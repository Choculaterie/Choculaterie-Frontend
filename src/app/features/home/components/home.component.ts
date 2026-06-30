import { Component, OnInit, OnDestroy, inject, signal, computed, effect, Injector, ElementRef, ViewChild, afterNextRender } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, interval, switchMap, catchError, of } from 'rxjs';
import { SchematicsService } from '../../../api/schematics';
import { StatsService } from '../../../api/stats';
import { RealtimeService } from '../../../core/services/realtime.service';
import type { SchematicListItemResponse } from '../../../api/generated.schemas';
import { SchematicCardComponent } from '../../../shared/components/schematic-card/schematic-card.component';
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
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
    private schematicsApi = inject(SchematicsService);
    private statsApi = inject(StatsService);
    private realtime = inject(RealtimeService);
    private session = inject(SessionService);
    private router = inject(Router);
    private injector = inject(Injector);
    private gridResizeObserver?: ResizeObserver;
    private statsPollSub?: Subscription;

    @ViewChild('schematicGrid') private schematicGrid?: ElementRef<HTMLElement>;

    private readonly rawSchematics = signal<SchematicListItemResponse[]>([]);
    private readonly numColumns = signal(1);
    readonly latestSchematics = computed(() => this.reorderForRowFirst(this.rawSchematics(), this.numColumns()));
    readonly loadingSchematics = signal(true);

    readonly stats = this.realtime.stats;

    readonly isAuthenticated = this.session.isAuthenticated;
    readonly currentUsername = computed(() => this.session.user()?.username ?? '');

    constructor() {
        effect(() => {
            if (!this.loadingSchematics()) {
                afterNextRender(() => this.attachGridObserver(), { injector: this.injector });
            }
        });
    }

    ngOnInit(): void {
        this.schematicsApi.getApiSchematics({ page: 1, pageSize: 8, sort: 'date', direction: 'desc' }).subscribe({
            next: (res) => { this.rawSchematics.set(res.items.slice(0, 8)); this.loadingSchematics.set(false); },
            error: () => this.loadingSchematics.set(false),
        });

        this.statsApi.getApiStats<ReturnType<typeof this.realtime.stats>>().subscribe({
            next: (res) => this.realtime.seedStats(res as any),
            error: () => { },
        });

        this.statsPollSub = interval(30_000).pipe(
            switchMap(() => this.statsApi.getApiStats<ReturnType<typeof this.realtime.stats>>().pipe(
                catchError(() => of(null)),
            )),
        ).subscribe({ next: (res) => { if (res) this.realtime.seedStats(res as any); } });
    }

    openQuickShareLink(): void {
        window.open('https://modrinth.com/mod/llitematica-quick-share-addon', '_blank', 'noopener');
    }

    ngOnDestroy(): void {
        this.gridResizeObserver?.disconnect();
        this.statsPollSub?.unsubscribe();
    }

    private attachGridObserver(): void {
        const el = this.schematicGrid?.nativeElement;
        if (!el) return;
        this.gridResizeObserver?.disconnect();
        this.gridResizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? el.clientWidth;
            const cols = Math.max(1, Math.floor((width + 16) / (260 + 16)));
            if (cols !== this.numColumns()) {
                this.numColumns.set(cols);
            }
        });
        this.gridResizeObserver.observe(el);
    }

    private reorderForRowFirst(items: SchematicListItemResponse[], numCols: number): SchematicListItemResponse[] {
        const n = items.length;
        if (numCols <= 1 || n <= numCols) return items;
        const baseRows = Math.floor(n / numCols);
        const extraCols = n % numCols;
        const result: SchematicListItemResponse[] = [];
        for (let c = 0; c < numCols; c++) {
            const colRows = c < extraCols ? baseRows + 1 : baseRows;
            for (let r = 0; r < colRows; r++) {
                const origIdx = r * numCols + c;
                if (origIdx < n) result.push(items[origIdx]);
            }
        }
        return result;
    }
}
