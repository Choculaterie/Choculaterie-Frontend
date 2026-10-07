import { translateText } from '../../core/i18n/translation.store';
import {
    Component,
    OnInit,
    OnDestroy,
    inject,
    signal,
    ViewChild,
    ViewContainerRef,
    Injector,
} from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';

@Component({
    selector: 'app-viewer',
    standalone: true,
    imports: [TPipe, LoadingSpinnerComponent, MatIconModule],
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
                <app-loading-spinner [message]="'Loading…' | t" bare />
            </div>
        } @else if (state() === 'error') {
            <div class="state-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" class="mc-icon" aria-hidden="true"><path fill="currentColor" d="M13,1h3v1h-3zM13,2h3v1h-3zM13,3h3v1h-3zM10,4h3v1h-3zM16,4h3v1h-3zM10,5h3v1h-3zM16,5h3v1h-3zM10,6h3v1h-3zM16,6h3v1h-3zM10,7h3v1h-3zM16,7h3v1h-3zM10,8h3v1h-3zM16,8h3v1h-3zM10,9h3v1h-3zM16,9h3v1h-3zM7,10h3v1h-3zM13,10h3v1h-3zM19,10h3v1h-3zM7,11h3v1h-3zM13,11h3v1h-3zM19,11h3v1h-3zM7,12h3v1h-3zM13,12h3v1h-3zM19,12h3v1h-3zM7,13h3v1h-3zM13,13h3v1h-3zM19,13h3v1h-3zM7,14h3v1h-3zM13,14h3v1h-3zM19,14h3v1h-3zM7,15h3v1h-3zM13,15h3v1h-3zM19,15h3v1h-3zM4,16h3v1h-3zM13,16h3v1h-3zM22,16h3v1h-3zM4,17h3v1h-3zM13,17h3v1h-3zM22,17h3v1h-3zM4,18h3v1h-3zM13,18h3v1h-3zM22,18h3v1h-3zM4,19h3v1h-3zM22,19h3v1h-3zM4,20h3v1h-3zM22,20h3v1h-3zM4,21h3v1h-3zM22,21h3v1h-3zM1,22h3v1h-3zM13,22h3v1h-3zM25,22h3v1h-3zM1,23h3v1h-3zM13,23h3v1h-3zM25,23h3v1h-3zM1,24h3v1h-3zM13,24h3v1h-3zM25,24h3v1h-3zM1,25h27v1h-27zM1,26h27v1h-27zM1,27h27v1h-27z" /><path fill="var(--mc-icon-shadow)" d="M13,7h3v1h-3zM19,7h3v1h-3zM13,8h3v1h-3zM19,8h3v1h-3zM13,9h3v1h-3zM19,9h3v1h-3zM10,13h3v1h-3zM16,13h3v1h-3zM22,13h3v1h-3zM10,14h3v1h-3zM16,14h3v1h-3zM22,14h3v1h-3zM10,15h3v1h-3zM16,15h3v1h-3zM22,15h3v1h-3zM10,16h3v1h-3zM16,16h3v1h-3zM10,17h3v1h-3zM16,17h3v1h-3zM10,18h3v1h-3zM16,18h3v1h-3zM7,19h3v1h-3zM16,19h3v1h-3zM25,19h3v1h-3zM7,20h3v1h-3zM16,20h3v1h-3zM25,20h3v1h-3zM7,21h3v1h-3zM16,21h3v1h-3zM25,21h3v1h-3zM7,22h3v1h-3zM7,23h3v1h-3zM7,24h3v1h-3zM28,25h3v1h-3zM28,26h3v1h-3zM28,27h3v1h-3zM4,28h27v1h-27zM4,29h27v1h-27zM4,30h27v1h-27z" /></svg>
                <span>{{ errorMsg() }}</span>
            </div>
        } @else {
            <div class="viewer-wrap" #viewerHost></div>
        }
    `,
})
export class ViewerComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private injector = inject(Injector);

    @ViewChild('viewerHost', { read: ViewContainerRef, static: false })
    viewerHost!: ViewContainerRef;

    readonly state = signal<'loading' | 'ready' | 'error'>('loading');
    readonly errorMsg = signal('');

    private pendingData: LitematicViewerData | null = null;

    ngOnInit(): void {
        const url = this.route.snapshot.queryParamMap.get('url');
        if (!url) {
            this.errorMsg.set(translateText('No file URL provided.'));
            this.state.set('error');
            return;
        }

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then(blob => blob.arrayBuffer())
            .then(buffer => {
                const fileName = url.split('/').pop()?.split('?')[0] ?? 'schematic.litematic';
                this.pendingData = { fileData: buffer, fileName };
                this.state.set('ready');

                setTimeout(() => this.mountViewer());
            })
            .catch(() => {
                this.errorMsg.set(translateText('Failed to load litematic file.'));
                this.state.set('error');
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
    }
}
