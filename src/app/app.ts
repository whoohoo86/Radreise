import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Explorer } from './explorer';
import { MapView } from './map-view';
import { Planner } from './planner';
import { RouteStore, Tab } from './route-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapView, Explorer, Planner],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(RouteStore);
  protected readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'karte', label: 'Karte', icon: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14' },
    { id: 'routen', label: 'Routen', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
    { id: 'planer', label: 'Planer', icon: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 16c4-1 2-6 6-7s4-1 4-1' },
  ];
}
