import { Component, OnInit, OnDestroy, inject, signal, effect, ViewChild, ViewContainerRef, Injector } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ShortUrlService } from '../../api/short-url';
import { OgMetaService } from '../../core/services/og-meta.service';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';

@Component({
    selector: 'app-short-url-redirect',
    standalone: true,
    imports: [TPipe, MatIconModule],
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
        .state-overlay svg.mc-icon {
            width: 48px;
            height: 48px;
        }
    `],
    template: `
        @if (state() === 'loading') {
            <div class="state-overlay">
                <img src="loading.gif" alt="" aria-hidden="true" style="width:48px;height:48px;object-fit:contain" />
                <span>{{ 'Loading…' | t }}</span>
            </div>
        } @else if (state() === 'error') {
            <div class="state-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" class="mc-icon" aria-hidden="true"><path fill="currentColor" d="M13,1h3v1h-3zM13,2h3v1h-3zM13,3h3v1h-3zM10,4h3v1h-3zM16,4h3v1h-3zM10,5h3v1h-3zM16,5h3v1h-3zM10,6h3v1h-3zM16,6h3v1h-3zM10,7h3v1h-3zM16,7h3v1h-3zM10,8h3v1h-3zM16,8h3v1h-3zM10,9h3v1h-3zM16,9h3v1h-3zM7,10h3v1h-3zM13,10h3v1h-3zM19,10h3v1h-3zM7,11h3v1h-3zM13,11h3v1h-3zM19,11h3v1h-3zM7,12h3v1h-3zM13,12h3v1h-3zM19,12h3v1h-3zM7,13h3v1h-3zM13,13h3v1h-3zM19,13h3v1h-3zM7,14h3v1h-3zM13,14h3v1h-3zM19,14h3v1h-3zM7,15h3v1h-3zM13,15h3v1h-3zM19,15h3v1h-3zM4,16h3v1h-3zM13,16h3v1h-3zM22,16h3v1h-3zM4,17h3v1h-3zM13,17h3v1h-3zM22,17h3v1h-3zM4,18h3v1h-3zM13,18h3v1h-3zM22,18h3v1h-3zM4,19h3v1h-3zM22,19h3v1h-3zM4,20h3v1h-3zM22,20h3v1h-3zM4,21h3v1h-3zM22,21h3v1h-3zM1,22h3v1h-3zM13,22h3v1h-3zM25,22h3v1h-3zM1,23h3v1h-3zM13,23h3v1h-3zM25,23h3v1h-3zM1,24h3v1h-3zM13,24h3v1h-3zM25,24h3v1h-3zM1,25h27v1h-27zM1,26h27v1h-27zM1,27h27v1h-27z" /><path fill="var(--mc-icon-shadow)" d="M13,7h3v1h-3zM19,7h3v1h-3zM13,8h3v1h-3zM19,8h3v1h-3zM13,9h3v1h-3zM19,9h3v1h-3zM10,13h3v1h-3zM16,13h3v1h-3zM22,13h3v1h-3zM10,14h3v1h-3zM16,14h3v1h-3zM22,14h3v1h-3zM10,15h3v1h-3zM16,15h3v1h-3zM22,15h3v1h-3zM10,16h3v1h-3zM16,16h3v1h-3zM10,17h3v1h-3zM16,17h3v1h-3zM10,18h3v1h-3zM16,18h3v1h-3zM7,19h3v1h-3zM16,19h3v1h-3zM25,19h3v1h-3zM7,20h3v1h-3zM16,20h3v1h-3zM25,20h3v1h-3zM7,21h3v1h-3zM16,21h3v1h-3zM25,21h3v1h-3zM7,22h3v1h-3zM7,23h3v1h-3zM7,24h3v1h-3zM28,25h3v1h-3zM28,26h3v1h-3zM28,27h3v1h-3zM4,28h27v1h-27zM4,29h27v1h-27zM4,30h27v1h-27z" /></svg>
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

        this.http.get(`/qs/${id}/litematic`, { responseType: 'arraybuffer' }).subscribe({
            next: (buffer) => {
                const fileName = `${id}.litematic`;
                this.pendingData = { fileData: buffer, fileName };
                this.ogMeta.setQuickShare(fileName);
                this.state.set('viewing');
                setTimeout(() => {
                    const viewer = this.mountViewer();

                    this.maybeCaptureAndUploadPreview(id, viewer);
                });
            },
            error: () => this.doRedirect(id),
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

    private mountViewer(): LitematicViewerComponent | null {
        if (!this.viewerHost || !this.pendingData) return null;

        const data = this.pendingData;
        const customInjector = Injector.create({
            parent: this.injector,
            providers: [
                { provide: MAT_DIALOG_DATA, useValue: data },
                { provide: MatDialogRef, useValue: { close: () => this.router.navigate(['/']) } },
            ],
        });

        return this.viewerHost.createComponent(LitematicViewerComponent, { injector: customInjector }).instance;
    }

    ngOnDestroy(): void {
        this.viewerHost?.clear();
        this.ogMeta.clear();
    }

    private async maybeCaptureAndUploadPreview(id: string, viewer: LitematicViewerComponent | null): Promise<void> {
        try {
            if (!viewer) return;
            const info = await firstValueFrom(
                this.http.get<{ screenshotPath?: string }>(`/qs/${id}/info`),
            ).catch(() => null);
            if (info?.screenshotPath) return;

            await this.waitUntilNotLoading(viewer);
            if (viewer.error()) return;

            const again = await firstValueFrom(
                this.http.get<{ screenshotPath?: string }>(`/qs/${id}/info`),
            ).catch(() => null);
            if (again?.screenshotPath) return;

            const file = await viewer.capturePreviewPng(768, 768);
            if (!file) return;
            this.shortUrlApi.putQsIdScreenshot(id, { file }).subscribe({ error: () => { } });
        } catch {
            // silently ignore preview upload failures
        }
    }

    private waitUntilNotLoading(viewer: LitematicViewerComponent, timeoutMs = 60000): Promise<void> {
        if (!viewer.loading()) return Promise.resolve();
        return new Promise(resolve => {
            const timeoutId = setTimeout(() => { ref.destroy(); resolve(); }, timeoutMs);
            const ref = effect(() => {
                if (!viewer.loading()) {
                    clearTimeout(timeoutId);
                    ref.destroy();
                    resolve();
                }
            }, { injector: this.injector });
        });
    }
}
