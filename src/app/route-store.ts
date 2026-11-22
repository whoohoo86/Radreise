import { Injectable, signal, computed } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { ColorMode, ParsedRoute, looksLikeGpx, parseGpx } from './gpx';

const ROOT = 'routen';
const DIR = Directory.Data;
const ROUTE_COLORS = ['#7b3fa0', '#b0407a', '#1d3557', '#8a5a2b', '#4a4e69', '#2a7f62'];

export interface Entry {
  name: string;
  /** Pfad relativ zum Routen-Verzeichnis, z. B. "Alpen/2026/etappe1.gpx" */
  path: string;
  type: 'file' | 'directory';
  size: number;
}

export interface RouteMeta {
  distance: number;
  ascent: number;
}

export interface LoadedRoute {
  path: string;
  name: string;
  color: string;
  route: ParsedRoute;
}

export type Tab = 'karte' | 'routen' | 'planer';

export interface Toast {
  text: string;
  tone: 'ok' | 'error';
  action?: { label: string; tab: Tab };
}

const join = (a: string, b: string) => (a ? `${a}/${b}` : b);
const fsPath = (rel: string) => (rel ? `${ROOT}/${rel}` : ROOT);
const sanitize = (n: string) => n.replace(/[\\/:*?"<>|]/g, '_').trim();

@Injectable({ providedIn: 'root' })
export class RouteStore {
  readonly tab = signal<Tab>('karte');
  readonly toast = signal<Toast | null>(null);

  readonly cwd = signal('');
  readonly entries = signal<Entry[]>([]);
  readonly meta = signal<Record<string, RouteMeta>>({});

  readonly colorMode = signal<ColorMode>('ele');
  private readonly loadedMap = signal<Record<string, LoadedRoute>>({});
  readonly visible = signal<string[]>([]);
  readonly main = signal<string | null>(null);

  readonly visibleRoutes = computed(() =>
    this.visible().map((p) => this.loadedMap()[p]).filter((r): r is LoadedRoute => !!r),
  );
  readonly mainRoute = computed(() => {
    const m = this.main();
    return m ? this.loadedMap()[m] ?? null : null;
  });

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.refresh();
  }

  notify(text: string, tone: Toast['tone'] = 'ok', action?: Toast['action']) {
    clearTimeout(this.toastTimer);
    this.toast.set({ text, tone, action });
    this.toastTimer = setTimeout(() => this.toast.set(null), 6000);
  }

  // ---- Verzeichnis -------------------------------------------------------

  async refresh(): Promise<void> {
    const rel = this.cwd();
    try {
      await Filesystem.mkdir({ path: fsPath(rel), directory: DIR, recursive: true });
    } catch {
      /* existiert bereits */
    }
    try {
      const res = await Filesystem.readdir({ path: fsPath(rel), directory: DIR });
      const entries = res.files
        .filter((f) => f.type === 'directory' || /\.gpx$/i.test(f.name))
        .map<Entry>((f) => ({ name: f.name, path: join(rel, f.name), type: f.type, size: f.size }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'de') : a.type === 'directory' ? -1 : 1));
      this.entries.set(entries);
      void this.loadMeta(entries);
    } catch (e) {
      this.notify(`Ordner konnte nicht gelesen werden: ${this.msg(e)}`, 'error');
    }
  }

  private async loadMeta(entries: Entry[]) {
    for (const e of entries) {
      if (e.type !== 'file' || this.meta()[e.path]) continue;
      try {
        const r = parseGpx(await this.readText(e.path));
        this.meta.update((m) => ({ ...m, [e.path]: { distance: r.distance, ascent: r.ascent } }));
      } catch {
        /* defekte Datei: keine Kennzahlen */
      }
    }
  }

  async openDir(rel: string) {
    this.cwd.set(rel);
    await this.refresh();
  }

  async up() {
    const parts = this.cwd().split('/').filter(Boolean);
    parts.pop();
    await this.openDir(parts.join('/'));
  }

  async makeDir(name: string) {
    const n = sanitize(name);
    if (!n) return;
    try {
      await Filesystem.mkdir({ path: fsPath(join(this.cwd(), n)), directory: DIR, recursive: true });
      await this.refresh();
    } catch (e) {
      this.notify(`Ordner konnte nicht angelegt werden: ${this.msg(e)}`, 'error');
    }
  }

  async remove(entry: Entry) {
    try {
      if (entry.type === 'directory') {
        await Filesystem.rmdir({ path: fsPath(entry.path), directory: DIR, recursive: true });
      } else {
        await Filesystem.deleteFile({ path: fsPath(entry.path), directory: DIR });
      }
      this.forget(entry.path);
      await this.refresh();
    } catch (e) {
      this.notify(`Löschen fehlgeschlagen: ${this.msg(e)}`, 'error');
    }
  }

  private forget(prefix: string) {
    const hit = (p: string) => p === prefix || p.startsWith(prefix + '/');
    this.visible.update((v) => v.filter((p) => !hit(p)));
    if (this.main() && hit(this.main()!)) this.main.set(this.visible()[0] ?? null);
    this.loadedMap.update((m) => Object.fromEntries(Object.entries(m).filter(([p]) => !hit(p))));
    this.meta.update((m) => Object.fromEntries(Object.entries(m).filter(([p]) => !hit(p))));
  }

  // ---- Dateien -----------------------------------------------------------

  private async readText(rel: string): Promise<string> {
    const r = await Filesystem.readFile({ path: fsPath(rel), directory: DIR, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  }

  /** Speichert GPX-Text im aktuellen Ordner; liefert den Pfad der neuen Datei. */
  async saveGpx(text: string, filename: string): Promise<string> {
    if (!looksLikeGpx(text)) throw new Error('Keine GPX-Datei');
    parseGpx(text); // wirft bei defekten Dateien, bevor etwas gespeichert wird

    let base = sanitize(filename.replace(/\.[a-z0-9]+$/i, '')) || `route-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const taken = new Set((await this.listNames(this.cwd())).map((n) => n.toLowerCase()));
    let name = `${base}.gpx`;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}-${i}.gpx`;

    const rel = join(this.cwd(), name);
    await Filesystem.writeFile({ path: fsPath(rel), directory: DIR, data: text, encoding: Encoding.UTF8, recursive: true });
    await this.refresh();
    return rel;
  }

  private async listNames(rel: string): Promise<string[]> {
    try {
      return (await Filesystem.readdir({ path: fsPath(rel), directory: DIR })).files.map((f) => f.name);
    } catch {
      return [];
    }
  }

  // ---- Anzeige auf der Karte ----------------------------------------------

  private colorFor(path: string): string {
    let h = 0;
    for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ROUTE_COLORS[h % ROUTE_COLORS.length];
  }

  private async ensureLoaded(path: string): Promise<boolean> {
    if (this.loadedMap()[path]) return true;
    try {
      const route = parseGpx(await this.readText(path));
      const name = path.split('/').pop()!.replace(/\.gpx$/i, '');
      this.loadedMap.update((m) => ({ ...m, [path]: { path, name, color: this.colorFor(path), route } }));
      return true;
    } catch (e) {
      this.notify(`„${path.split('/').pop()}“ kann nicht angezeigt werden: ${this.msg(e)}`, 'error');
      return false;
    }
  }

  async toggle(path: string) {
    if (this.visible().includes(path)) {
      this.visible.update((v) => v.filter((p) => p !== path));
      if (this.main() === path) this.main.set(this.visible()[0] ?? null);
      return;
    }
    if (!(await this.ensureLoaded(path))) return;
    this.visible.update((v) => [...v, path]);
    if (!this.main()) this.main.set(path);
  }

  async setMain(path: string) {
    if (!(await this.ensureLoaded(path))) return;
    if (!this.visible().includes(path)) this.visible.update((v) => [...v, path]);
    this.main.set(path);
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
