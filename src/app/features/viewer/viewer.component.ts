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
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';

@Component({
    selector: 'app-viewer',
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
            this.errorMsg.set('No file URL provided.');
            this.state.set('error');
            return;
        }

        // Use native fetch - bypasses Angular interceptors so no Authorization header
        // is added, avoiding a CORS preflight OPTIONS on this public endpoint.
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
                // viewerHost renders after state change - wait one tick
                setTimeout(() => this.mountViewer());
            })
            .catch(() => {
                this.errorMsg.set('Failed to load litematic file.');
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
