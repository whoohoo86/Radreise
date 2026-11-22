import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, viewChild } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { BIKEROUTER_URL, Bikerouter, Bounds, ExportedFile } from './bikerouter';
import { looksLikeGpx } from './gpx';
import { RouteStore } from './route-store';

@Component({
  selector: 'app-planner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="target">
      <p>Exporte werden gespeichert in <strong>{{ target() }}</strong></p>
      <button type="button" (click)="store.tab.set('routen')">Ordner wechseln</button>
    </div>
    @if (native) {
      <div #host class="host" aria-hidden="true"></div>
    } @else {
      <div class="web">
        <p>Der Planer läuft nur in der Android-App, weil dort der Export von bikerouter abgefangen wird.</p>
        <p>Im Browser kannst du <a href="https://bikerouter.de/" target="_blank" rel="noopener">bikerouter.de</a> öffnen, die Route als GPX exportieren und sie im Tab Routen importieren.</p>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .target { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
    .target p { flex: 1; margin: 0; overflow-wrap: anywhere; }
    .target button { min-height: 40px; padding: 0 12px; font: inherit; border-radius: 9px; border: 1.5px solid var(--ink); background: var(--panel); color: var(--ink); }
    .host { flex: 1; min-height: 0; }
    .web { padding: 16px; max-width: 60ch; }
  `,
})
export class Planner implements OnDestroy {
  protected readonly store = inject(RouteStore);
  protected readonly native = Capacitor.isNativePlatform();
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');

  protected readonly target = computed(() => 'Routen' + (this.store.cwd() ? '/' + this.store.cwd() : ''));

  private opened = false;
  private resizer?: ResizeObserver;
  private handles: Promise<PluginListenerHandle>[] = [];

  constructor() {
    if (!this.native) return;

    this.handles.push(
      Bikerouter.addListener('fileExported', (f) => void this.onExport(f)),
      Bikerouter.addListener('closeRequested', () => this.store.tab.set('karte')),
    );

    effect(() => {
      const active = this.store.tab() === 'planer';
      const el = this.host()?.nativeElement;
      if (!el) return;
      // Warten, bis das Layout des aktivierten Tabs steht, dann Rechteck messen.
      requestAnimationFrame(() => void this.sync(active, el));
    });
  }

  private bounds(el: HTMLElement): Bounds {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  private async sync(active: boolean, el: HTMLElement) {
    if (!active) {
      if (this.opened) await Bikerouter.setVisible({ visible: false });
      return;
    }
    if (!this.opened) {
      this.opened = true;
      await Bikerouter.open({ url: BIKEROUTER_URL, ...this.bounds(el) });
      this.resizer = new ResizeObserver(() => {
        if (this.store.tab() === 'planer') void Bikerouter.setBounds(this.bounds(el));
      });
      this.resizer.observe(el);
    } else {
      await Bikerouter.setBounds(this.bounds(el));
      await Bikerouter.setVisible({ visible: true });
    }
  }

  private async onExport(f: ExportedFile) {
    if (!looksLikeGpx(f.text)) {
      this.store.notify(`„${f.filename}“ ist keine GPX-Datei. Wähle im Export von bikerouter das Format GPX.`, 'error');
      return;
    }
    try {
      const path = await this.store.saveGpx(f.text, f.filename);
      await this.store.setMain(path);
      this.store.notify(`Gespeichert: ${path}`, 'ok', { label: 'Auf Karte zeigen', tab: 'karte' });
    } catch (e) {
      this.store.notify(`Export konnte nicht gespeichert werden: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  ngOnDestroy() {
    this.resizer?.disconnect();
    this.handles.forEach((h) => void h.then((x) => x.remove()));
    if (this.opened) void Bikerouter.close();
  }
}
