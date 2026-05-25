import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ViewContainerRef, Injector } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ShortUrlService } from '../../api/short-url';
import { OgMetaService } from '../../core/services/og-meta.service';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';
import { renderLitematicHeadless } from '../../shared/components/litematic-viewer/litematic-headless-render';

@Component({
    selector: 'app-short-url-redirect',
    standalone: true,
    imports: [MatProgressBarModule, MatIconModule],
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            /* escape the 1.5rem padding of <main class="content"> */
            margin: -1.5rem;
            height: calc(100% + 3rem);
        }
        @media (max-width: 600px) {
            :host { margin: -0.75rem; height: calc(100% + 1.5rem); }
        }
        .viewer-wrap {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .viewer-wrap ::ng-deep .viewer-dialog {
            height: 100%;
        }
        .state-overlay {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 1rem;
            color: var(--mat-sys-on-surface-variant);
        }
    `],
    template: `
        @if (state() === 'loading') {
            <div class="state-overlay">
                <mat-progress-bar mode="indeterminate" style="width:240px" />
                <span i18n>Loading…</span>
            </div>
        } @else if (state() === 'error') {
            <div class="state-overlay">
                <mat-icon>error_outline</mat-icon>
                <span>{{ errorMsg() }}</span>
            </div>
        } @else if (state() === 'viewing') {
            <div class="viewer-wrap" #viewerHost></div>
        }
    `,
})
export class ShortUrlRedirectComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private http = inject(HttpClient);
    private injector = inject(Injector);
    private shortUrlApi = inject(ShortUrlService);
    private ogMeta = inject(OgMetaService);

    @ViewChild('viewerHost', { read: ViewContainerRef, static: false })
    viewerHost!: ViewContainerRef;

    readonly state = signal<'loading' | 'viewing' | 'error'>('loading');
    readonly errorMsg = signal('');

    private pendingData: LitematicViewerData | null = null;

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id')!;

        // Try the litematic endpoint first.
        // baseUrlInterceptor expands /qs/… to api.choculaterie.com/qs/…
        // authInterceptor may add Authorization - api.choculaterie.com handles CORS for choculaterie.com.
        this.http.get(`/qs/${id}/litematic`, { responseType: 'arraybuffer' }).subscribe({
            next: (buffer) => {
                const fileName = `${id}.litematic`;
                this.pendingData = { fileData: buffer, fileName };
                this.ogMeta.setQuickShare(fileName);
                this.state.set('viewing');
                // viewerHost renders after state change - wait one tick
                setTimeout(() => {
                    this.mountViewer();
                    // Generate OG preview in background (fire-and-forget)
                    this.generateAndUploadPreview(buffer, id);
                });
            },
            error: () => {
                // Endpoint not found or not a litematic quick-share - fall back to normal redirect
                this.doRedirect(id);
            },
        });
    }

    private doRedirect(id: string): void {
        this.shortUrlApi.getQsId(id).subscribe({
            next: (res: any) => {
                if (res?.longUrl) {
                    try {
                        const url = new URL(res.longUrl);
                        if (url.origin === window.location.origin) {
                            this.router.navigateByUrl(url.pathname + url.search + url.hash);
                        } else {
                            window.location.href = res.longUrl;
                        }
                    } catch {
                        window.location.href = res.longUrl;
                    }
                } else {
                    this.router.navigate(['/not-found']);
                }
            },
            error: () => this.router.navigate(['/not-found']),
        });
    }

    private mountViewer(): void {
        if (!this.viewerHost || !this.pendingData) return;

        const data = this.pendingData;
        const customInjector = Injector.create({
            parent: this.injector,
            providers: [
                { provide: MAT_DIALOG_DATA, useValue: data },
                { provide: MatDialogRef, useValue: { close: () => this.router.navigate(['/']) } },
            ],
        });

        this.viewerHost.createComponent(LitematicViewerComponent, { injector: customInjector });
    }

    ngOnDestroy(): void {
        this.viewerHost?.clear();
        this.ogMeta.clear();
    }

    private generateAndUploadPreview(buffer: ArrayBuffer, id: string): void {
        // Render headlessly then PUT to backend - completely silent, never blocks the viewer.
        // Backend should store the PNG and return screenshotPath in GET /qs/{id}/info.
        renderLitematicHeadless(buffer, this.http)
            .then((file) => {
                this.shortUrlApi.putQsIdScreenshot(id, { file }).subscribe({
                    error: () => { /* silently ignore */ },
                });
            })
            .catch(() => { /* render failed - silently ignore */ });
    }
}
