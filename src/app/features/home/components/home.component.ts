import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SchematicsService } from '../../../api/schematics';
import { StatsService } from '../../../api/stats';
import { RealtimeService } from '../../../core/services/realtime.service';
import type { SchematicListItemResponse } from '../../../api/generated.schemas';
import { SchematicCardComponent } from '../../../shared/components/schematic-card/schematic-card.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { SessionService } from '../../../core/services/session.service';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [
        RouterLink,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        SchematicCardComponent,
        LoadingSpinnerComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
    private schematicsApi = inject(SchematicsService);
    private statsApi = inject(StatsService);
    private realtime = inject(RealtimeService);
    private session = inject(SessionService);
    private router = inject(Router);

    readonly latestSchematics = signal<SchematicListItemResponse[]>([]);
    readonly loadingSchematics = signal(true);

    // Live-updated via SignalR; seeded from HTTP on first load
    readonly stats = this.realtime.stats;

    ngOnInit(): void {
        // On very first site load, redirect logged-in users to /schematics once per session
        if (this.session.isAuthenticated() && !sessionStorage.getItem('home_visited')) {
            sessionStorage.setItem('home_visited', '1');
            this.router.navigate(['/schematics'], { replaceUrl: true });
            return;
        }
        sessionStorage.setItem('home_visited', '1');

        this.schematicsApi.getApiSchematics({ page: 1, pageSize: 8, sort: 'date', direction: 'desc' }).subscribe({
            next: (res) => { this.latestSchematics.set(res.items.slice(0, 8)); this.loadingSchematics.set(false); },
            error: () => this.loadingSchematics.set(false),
        });

        // Seed stats via HTTP (SignalR StatsUpdated keeps it live after that)
        if (!this.realtime.stats()) {
            this.statsApi.getApiStats<ReturnType<typeof this.realtime.stats>>().subscribe({
                next: (res) => this.realtime.seedStats(res as any),
                error: () => { },
            });
        }
    }
}
