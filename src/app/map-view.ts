import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild, OnDestroy,
} from '@angular/core';
import * as L from 'leaflet';
import { ELE_RAMP, SLOPE_RAMP, SLOPE_RANGE, colorSegments, rampCss } from './gpx';
import { RouteStore } from './route-store';

interface BaseLayer {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
}

const BASES: BaseLayer[] = [
  {
    id: 'cyclosm',
    label: 'Rad',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, Stil <a href="https://www.cyclosm.org">CyclOSM</a>, Tiles OpenStreetMap France',
    maxNativeZoom: 19,
  },
  {
    id: 'topo',
    label: 'Gelände',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM, Darstellung © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxNativeZoom: 17,
  },
  {
    id: 'osm',
    label: 'Standard',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    maxNativeZoom: 19,
  },
];

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

@Component({
  selector: 'app-map-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="map"></div>

    <div class="bases" role="group" aria-label="Kartenstil">
      @for (b of bases; track b.id) {
        <button type="button" [class.on]="base() === b.id" [attr.aria-pressed]="base() === b.id" (click)="base.set(b.id)">
          {{ b.label }}
        </button>
      }
    </div>

    @if (store.tab() !== 'karte') {
      <!-- Vorschau im Routen-Tab: nur Karte, keine Legende -->
    } @else if (store.mainRoute(); as r) {
      <section class="card" aria-label="Hauptroute">
        <h2>{{ r.name }}</h2>
        <dl>
          <dt>Länge</dt><dd>{{ km(r.route.distance) }} km</dd>
          @if (r.route.minEle !== null) {
            <dt>Anstieg</dt><dd>{{ r.route.ascent }} m</dd>
            <dt>Abstieg</dt><dd>{{ r.route.descent }} m</dd>
          }
        </dl>
        @if (r.route.minEle !== null) {
          <div class="modes" role="group" aria-label="Farbcodierung">
            <button type="button" [class.on]="store.colorMode() === 'ele'" (click)="store.colorMode.set('ele')">Höhe</button>
            <button type="button" [class.on]="store.colorMode() === 'slope'" (click)="store.colorMode.set('slope')">Steigung</button>
          </div>
          <div class="bar" [style.background]="legend().css"></div>
          <div class="ends"><span>{{ legend().from }}</span><span>{{ legend().to }}</span></div>
        } @else {
          <p class="hint">Diese Datei enthält keine Höhendaten, daher gibt es keine Farbcodierung.</p>
        }
      </section>
    } @else {
      <section class="card empty">
        <p>Noch keine Route auf der Karte.</p>
        <button type="button" class="primary" (click)="store.tab.set('routen')">Route auswählen</button>
      </section>
    }
  `,
  styles: `
    :host { display: block; position: relative; height: 100%; min-height: 0; }
    .map { position: absolute; inset: 0; background: #dfe6e2; }
    .bases { position: absolute; top: 10px; left: 10px; z-index: 500; display: flex; background: var(--panel);
      border-radius: 10px; box-shadow: 0 1px 6px rgb(20 33 43 / .25); overflow: hidden; }
    .bases button, .modes button { border: 0; background: none; padding: 9px 13px; font: inherit; color: var(--ink); min-height: 40px; }
    .bases button.on, .modes button.on { background: var(--ink); color: #fff; font-weight: 700; }
    .card { position: absolute; left: 10px; bottom: 44px; z-index: 900; width: min(300px, calc(100% - 20px)); background: var(--panel);
      border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 8px rgb(20 33 43 / .3); }
    .card h2 { margin: 0 0 6px; font-size: 1.05rem; overflow-wrap: anywhere; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; margin: 0 0 10px; }
    dt { color: var(--mute); }
    dd { margin: 0; font-weight: 700; }
    .modes { display: flex; border: 1.5px solid var(--ink); border-radius: 9px; overflow: hidden; margin-bottom: 10px; }
    .modes button { flex: 1; }
    .bar { height: 10px; border-radius: 5px; box-shadow: inset 0 0 0 1px rgb(20 33 43 / .25); }
    .ends { display: flex; justify-content: space-between; margin-top: 3px; font-size: .85rem; color: var(--mute); }
    .hint { margin: 0; color: var(--mute); font-size: .9rem; }
    .empty p { margin: 0 0 10px; }
  `,
})
export class MapView implements OnDestroy {
  protected readonly store = inject(RouteStore);
  protected readonly bases = BASES;
  protected readonly base = signal('cyclosm');
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  private map?: L.Map;
  private tiles?: L.TileLayer;
  private readonly overlay = L.layerGroup();
  private readonly ready = signal(false);
  private resizer?: ResizeObserver;
  private fitted: string | null = null;

  protected readonly legend = computed(() => {
    const r = this.store.mainRoute()?.route;
    if (this.store.colorMode() === 'ele' && r?.minEle != null) {
      return { css: rampCss(ELE_RAMP), from: `${Math.round(r.minEle)} m`, to: `${Math.round(r.maxEle!)} m` };
    }
    return { css: rampCss(SLOPE_RAMP), from: `−${SLOPE_RANGE} %`, to: `+${SLOPE_RANGE} %` };
  });

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.host().nativeElement, { zoomControl: false, preferCanvas: true, maxZoom: 20 })
        .setView([51.16, 10.45], 6);
      L.control.zoom({ position: 'topright' }).addTo(map);
      this.overlay.addTo(map);
      this.map = map;
      this.resizer = new ResizeObserver(() => map.invalidateSize());
      this.resizer.observe(this.host().nativeElement);
      this.ready.set(true);
    });

    effect(() => {
      if (!this.ready()) return;
      const def = BASES.find((b) => b.id === this.base())!;
      this.tiles?.remove();
      this.tiles = L.tileLayer(def.url, {
        attribution: def.attribution, maxNativeZoom: def.maxNativeZoom, maxZoom: 20,
      }).addTo(this.map!);
      this.tiles.bringToBack();
    });

    effect(() => {
      if (!this.ready()) return;
      const routes = this.store.visibleRoutes();
      const main = this.store.mainRoute();
      const mode = this.store.colorMode();
      this.draw(routes, main?.path ?? null, mode);
    });

    effect(() => {
      // Im Routen-Tab ist die Karte kleiner: Auswahl neu einpassen, sobald das Layout steht.
      if (this.store.tab() !== 'routen' || !this.ready()) return;
      requestAnimationFrame(() => {
        const pts = untracked(() => this.store.mainRoute())?.route.points;
        if (!pts) return;
        this.map!.invalidateSize();
        this.map!.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon] as L.LatLngTuple)), { padding: [24, 24] });
      });
    });

    effect(() => {
      const main = this.store.mainRoute();
      if (!this.ready() || !main || this.fitted === main.path) return;
      untracked(() => {
        this.fitted = main.path;
        const pts = main.route.points;
        this.map!.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon] as L.LatLngTuple)), { padding: [24, 24] });
      });
    });
  }

  protected km(m: number) {
    return nf.format(m / 1000);
  }

  private draw(routes: ReturnType<RouteStore['visibleRoutes']>, mainPath: string | null, mode: 'ele' | 'slope') {
    this.overlay.clearLayers();
    const line = (r: (typeof routes)[number]) => r.route.points.map((p) => [p.lat, p.lon] as L.LatLngTuple);

    for (const r of routes) {
      if (r.path === mainPath) continue;
      const pts = line(r);
      L.polyline(pts, { color: '#fff', weight: 7, opacity: 0.8, interactive: false }).addTo(this.overlay);
      L.polyline(pts, { color: r.color, weight: 4, opacity: 0.95 })
        .bindTooltip(r.name, { sticky: true })
        .on('click', () => void this.store.setMain(r.path))
        .addTo(this.overlay);
    }

    const main = routes.find((r) => r.path === mainPath);
    if (!main) return;
    L.polyline(line(main), { color: '#fff', weight: 12, opacity: 0.95, interactive: false, lineCap: 'round' }).addTo(this.overlay);
    for (const s of colorSegments(main.route, mode)) {
      L.polyline([s.from, s.to], { color: s.color, weight: 8, opacity: 1, lineCap: 'round', interactive: false }).addTo(this.overlay);
    }
    const pts = main.route.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    L.circleMarker([first.lat, first.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#14212b', fillOpacity: 1 })
      .bindTooltip('Start').addTo(this.overlay);
    L.circleMarker([last.lat, last.lon], { radius: 7, color: '#14212b', weight: 3, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip('Ziel').addTo(this.overlay);
  }

  ngOnDestroy() {
    this.resizer?.disconnect();
    this.map?.remove();
  }
}
