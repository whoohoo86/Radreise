import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Entry, RouteStore } from './route-store';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

@Component({
  selector: 'app-explorer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <nav aria-label="Pfad">
        <button type="button" class="crumb" (click)="store.openDir('')">Routen</button>
        @for (c of crumbs(); track c.path) {
          <span aria-hidden="true">/</span>
          <button type="button" class="crumb" (click)="store.openDir(c.path)">{{ c.name }}</button>
        }
      </nav>
      <div class="actions">
        <button type="button" (click)="adding.set(true)">Neuer Ordner</button>
        <button type="button" (click)="picker.click()">GPX importieren</button>
        <input #picker type="file" hidden multiple accept=".gpx,application/gpx+xml,application/xml,text/xml" (change)="onFiles($event)" />
      </div>
      @if (adding()) {
        <form class="add" (submit)="$event.preventDefault(); create(name.value); name.value = ''">
          <input #name type="text" placeholder="Ordnername" aria-label="Ordnername" autocomplete="off" />
          <button type="submit" class="primary">Anlegen</button>
          <button type="button" (click)="adding.set(false)">Abbrechen</button>
        </form>
      }
    </header>

    <ul>
      @if (store.cwd()) {
        <li class="row">
          <button type="button" class="name" (click)="store.up()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            Ein Ordner höher
          </button>
        </li>
      }
      @for (e of store.entries(); track e.path) {
        @if (e.type === 'directory') {
          <li class="row">
            <button type="button" class="name" (click)="store.openDir(e.path)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              {{ e.name }}
            </button>
            <button type="button" class="icon" [attr.aria-label]="'Ordner ' + e.name + ' löschen'" (click)="remove(e)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
            </button>
          </li>
        } @else {
          <li class="row" [class.main]="store.main() === e.path">
            <label class="name">
              <input type="checkbox" [checked]="store.visible().includes(e.path)" (change)="store.toggle(e.path)" />
              <span class="txt">
                <span class="title">{{ label(e) }}</span>
                <span class="sub">{{ stats(e) }}</span>
              </span>
            </label>
            <button type="button" class="icon star" [attr.aria-pressed]="store.main() === e.path"
              [attr.aria-label]="'„' + label(e) + '“ als Hauptroute festlegen'" (click)="store.setMain(e.path)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
            </button>
            <button type="button" class="icon" [attr.aria-label]="'„' + label(e) + '“ löschen'" (click)="remove(e)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
            </button>
          </li>
        }
      } @empty {
        <li class="none">Dieser Ordner ist leer. Plane eine Route im Planer oder importiere eine GPX-Datei.</li>
      }
    </ul>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--paper); }
    header { padding: 10px 12px 6px; border-bottom: 1px solid var(--line); background: var(--panel); }
    nav { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; margin-bottom: 8px; color: var(--mute); }
    .crumb { border: 0; background: none; font: inherit; font-weight: 700; color: var(--ink); padding: 6px 4px; min-height: 36px; }
    .actions, .add { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .add input { flex: 1 1 140px; min-height: 44px; padding: 0 10px; font: inherit; border: 1.5px solid var(--ink); border-radius: 9px; }
    button { font: inherit; min-height: 44px; padding: 0 14px; border-radius: 9px; border: 1.5px solid var(--ink); background: var(--panel); color: var(--ink); }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
    ul { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    .row { display: flex; align-items: center; border-bottom: 1px solid var(--line); background: var(--panel); }
    .row.main { background: #e3f1f3; box-shadow: inset 4px 0 0 var(--accent); }
    .name { flex: 1; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 6px 12px; border: 0; border-radius: 0;
      background: none; text-align: left; min-width: 0; }
    .name svg { width: 24px; height: 24px; flex: none; fill: none; stroke: var(--ink); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .name input { width: 24px; height: 24px; flex: none; accent-color: var(--accent); }
    .txt { display: flex; flex-direction: column; min-width: 0; }
    .title { font-weight: 700; overflow-wrap: anywhere; }
    .sub { color: var(--mute); font-size: .9rem; }
    .icon { width: 48px; padding: 0; border: 0; background: none; display: grid; place-items: center; }
    .icon svg { width: 24px; height: 24px; fill: none; stroke: var(--mute); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .star[aria-pressed='true'] svg { fill: var(--accent); stroke: var(--accent); }
    .none { padding: 20px 16px; color: var(--mute); background: none; }
  `,
})
export class Explorer {
  protected readonly store = inject(RouteStore);
  protected readonly adding = signal(false);

  protected readonly crumbs = computed(() => {
    const parts = this.store.cwd().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  });

  protected label(e: Entry) {
    return e.name.replace(/\.gpx$/i, '');
  }

  protected stats(e: Entry): string {
    const m = this.store.meta()[e.path];
    if (!m) return `${Math.max(1, Math.round(e.size / 1024))} KB`;
    return `${nf.format(m.distance / 1000)} km, Anstieg ${m.ascent} m`;
  }

  protected async create(name: string) {
    await this.store.makeDir(name);
    this.adding.set(false);
  }

  protected async remove(e: Entry) {
    const what = e.type === 'directory' ? `Ordner „${e.name}“ mit allem Inhalt` : `„${this.label(e)}“`;
    if (confirm(`${what} löschen?`)) await this.store.remove(e);
  }

  protected async onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    let ok = 0;
    const failed: string[] = [];
    for (const f of files) {
      try {
        await this.store.saveGpx(await f.text(), f.name);
        ok++;
      } catch {
        failed.push(f.name);
      }
    }
    if (failed.length) this.store.notify(`Nicht importiert: ${failed.join(', ')}`, 'error');
    else if (ok) this.store.notify(ok === 1 ? '1 Route importiert' : `${ok} Routen importiert`);
  }
}
