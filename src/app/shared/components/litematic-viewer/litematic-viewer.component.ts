import {
    Component,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    Inject,
    signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SchematicRenderer, DiffViewer } from 'schematic-renderer';
import * as THREE from 'three';
import { RESOURCE_PACK_URL } from './resource-pack';

/** The subset of SchematicObject's public API the clip-plane/rebuild logic below needs. */
interface SchematicWithBounds {
    group: THREE.Object3D;
    rebuildMesh(): Promise<void>;
    renderingBounds: { min: THREE.Vector3; max: THREE.Vector3 };
}

export interface LitematicViewerData {
    fileData: ArrayBuffer;
    fileName: string;
    /** Enables diff mode. Pass `null` (not omitted) to diff against "nothing". */
    parentFileData?: ArrayBuffer | null;
}

@Component({
    selector: 'app-litematic-viewer',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatSliderModule,
        MatTooltipModule,
    ],
    templateUrl: './litematic-viewer.component.html',
    styleUrl: './litematic-viewer.component.scss',
})
export class LitematicViewerComponent implements AfterViewInit, OnDestroy {
    @ViewChild('viewerCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('minYTrack') minYTrackRef?: ElementRef<HTMLElement>;
    @ViewChild('maxYTrack') maxYTrackRef?: ElementRef<HTMLElement>;

    readonly loading = signal(true);
    readonly loadingStatus = signal('Loading resource pack…');
    readonly error = signal('');
    readonly isDiffMode = signal(false);
    readonly diffSummary = signal<{ added: number; removed: number } | null>(null);
    readonly flyMode = signal(false);
    readonly flyLocked = signal(false);

    // Y-range slicer (X/Z stay fixed). Signals, not fields: this app is zoneless and drag
    // tracking runs via document-level listeners Angular doesn't instrument.
    minY = 0;
    maxY = 0;
    readonly currentMinY = signal(0);
    readonly currentMaxY = signal(0);
    private minX = 0;
    private maxX = 0;
    private minZ = 0;
    private maxZ = 0;

    // Clip planes give instant live feedback while dragging; a real rebuild only runs once the
    // drag ends (see commitRenderingBounds), since clipping can't regenerate a culled face.
    private readonly minYClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private readonly maxYClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    private clipYOffset = 0;
    private renderingBoundsCommitInFlight = false;
    private renderingBoundsCommitQueued = false;
    private pendingCommitMinY = 0;
    private pendingCommitMaxY = 0;
    // What's actually loaded right now; a commit discards anything outside this range. See
    // resetToFullRangeIfNeeded.
    private lastCommittedMinY = 0;
    private lastCommittedMaxY = 0;

    private schemRenderer?: SchematicRenderer;
    private diffViewer?: DiffViewer;
    private readonly schematicId = 'main';
    private destroyed = false;

    // Manual drag tracking: mat-slider only commits on pointer-up (see attachDragListeners).
    private dragSetter: ((value: number) => void) | null = null;
    private dragEl: HTMLElement | null = null;
    private dragMin = 0;
    private dragMax = 0;

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: LitematicViewerData,
        private dialogRef: MatDialogRef<LitematicViewerComponent>,
        private http: HttpClient,
    ) { }

    ngAfterViewInit(): void {
        this.initViewer();
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.onDocPointerUp();
        this.schemRenderer?.dispose();
        this.diffViewer?.dispose();
    }

    downloadFile(): void {
        const blob = new Blob([this.data.fileData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.data.fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    private async initViewer(): Promise<void> {
        const canvas = this.canvasRef.nativeElement;
        const hasDiff = this.data.parentFileData !== undefined;

        try {
            if (hasDiff) {
                this.isDiffMode.set(true);
                this.loadingStatus.set('Diffing against previous commit…');
                const diffViewer = new DiffViewer(canvas, {
                    resourcePacks: { vanilla: () => this.fetchResourcePack() },
                    onStats: (stats) => {
                        this.diffSummary.set({ added: stats.added + stats.changed, removed: stats.removed });
                    },
                });
                this.diffViewer = diffViewer;

                const beforeBytes = this.data.parentFileData
                    ? new Uint8Array(this.data.parentFileData)
                    : new Uint8Array(0);
                await diffViewer.loadDiff(beforeBytes, new Uint8Array(this.data.fileData));
                if (this.destroyed) return;
            } else {
                this.loadingStatus.set('Loading resource pack…');
                let onReady!: () => void;
                const ready = new Promise<void>(resolve => { onReady = resolve; });
                const renderer = new SchematicRenderer(canvas, {}, {
                    vanilla: () => this.fetchResourcePack(),
                }, {
                    showGrid: true,
                    backgroundColor: '#1a1a2e',
                    enableInteraction: true,
                    enableDragAndDrop: false,
                    enableGizmos: false,
                    enableProgressBar: false,
                    sidebarOptions: { enabled: false } as any,
                    keyboardControlsOptions: { enabled: true },
                    callbacks: { onRendererInitialized: () => onReady() },
                });
                this.schemRenderer = renderer;
                if (this.destroyed) { renderer.dispose(); return; }

                await ready;
                if (this.destroyed) return;

                this.loadingStatus.set('Building 3D structure…');
                await renderer.schematicManager!.loadSchematic(this.schematicId, this.data.fileData);
                if (this.destroyed) return;

                renderer.cameraManager.focusOnSchematics();
                (renderer.cameraManager as any).on('flyControlsLocked', () => this.flyLocked.set(true));
                (renderer.cameraManager as any).on('flyControlsUnlocked', () => {
                    this.flyLocked.set(false);
                    // Library re-shows its own overlay on every unlock; keep ours the only one.
                    renderer.cameraManager.flyControls?.setOverlayVisible(false);
                });

                const schematicObj = renderer.schematicManager!.getSchematic(this.schematicId);
                const bounds = schematicObj?.bounds;
                if (bounds) {
                    this.minX = bounds.minX; this.maxX = bounds.maxX;
                    this.minZ = bounds.minZ; this.maxZ = bounds.maxZ;
                    this.minY = bounds.minY;
                    this.maxY = bounds.maxY;
                    this.currentMinY.set(bounds.minY);
                    this.currentMaxY.set(bounds.maxY);
                    this.lastCommittedMinY = bounds.minY;
                    this.lastCommittedMaxY = bounds.maxY;
                }
                if (schematicObj) await this.setupClippingPlanes(schematicObj);
            }

            this.loading.set(false);
            // Sliders are behind @if (!loading()); wait a tick for the ViewChild refs to exist.
            setTimeout(() => this.attachDragListeners());
        } catch (e) {
            console.error('Litematic viewer init error:', e);
            this.error.set('Failed to parse litematic file.');
            this.loading.set(false);
        }
    }

    private fetchResourcePack(): Promise<Blob> {
        return fetch(RESOURCE_PACK_URL).then(r => r.blob());
    }

    /** Only arms fly mode; entering still needs a canvas click (see enterFlyMode). */
    toggleFlyMode(): void {
        const enabled = this.schemRenderer?.cameraManager.toggleFlyControls();
        this.flyMode.set(!!enabled);
        this.schemRenderer?.cameraManager.flyControls?.setOverlayVisible(false);
    }

    /** Click handler for our own "Click to enter fly mode" overlay. */
    enterFlyMode(): void {
        this.schemRenderer?.cameraManager.flyControls?.lock();
    }

    onMinYChange = (value: number): void => {
        this.currentMinY.set(value);
        if (value < this.lastCommittedMinY) this.resetToFullRangeIfNeeded();
        this.updateClipPlanes();
    };

    onMaxYChange = (value: number): void => {
        this.currentMaxY.set(value);
        if (value > this.lastCommittedMaxY) this.resetToFullRangeIfNeeded();
        this.updateClipPlanes();
    };

    private async setupClippingPlanes(schematicObj: SchematicWithBounds): Promise<void> {
        const rendererObj = this.schemRenderer?.renderManager?.getRenderer();
        if (rendererObj) rendererObj.localClippingEnabled = true;

        await this.waitForMeshesToSettle(schematicObj);

        this.clipYOffset = schematicObj.group.position.y;
        this.wireClippingPlanesOntoMaterials(schematicObj);
        this.updateClipPlanes();
    }

    /** (Re-)assigns the two clip planes to every material currently in the schematic's group. */
    private wireClippingPlanesOntoMaterials(schematicObj: SchematicWithBounds): void {
        schematicObj.group.traverse((obj) => {
            // schematic-renderer bundles its own three.js, so `instanceof THREE.Mesh` fails.
            const mesh = obj as unknown as { isMesh?: boolean; material?: THREE.Material | THREE.Material[] };
            if (!mesh.isMesh || !mesh.material) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
                mat.clippingPlanes = [this.minYClipPlane, this.maxYClipPlane];
                mat.needsUpdate = true; // clipping plane count is baked into the compiled shader
            }
        });
    }

    private updateClipPlanes(): void {
        if (this.currentMinY() <= this.minY && this.currentMaxY() >= this.maxY) {
            this.disableClipPlanes();
            return;
        }
        this.minYClipPlane.constant = -(this.currentMinY() - 0.5 + this.clipYOffset);
        this.maxYClipPlane.constant = this.currentMaxY() + 0.5 + this.clipYOffset;
        this.schemRenderer?.invalidate();
    }

    private disableClipPlanes(): void {
        this.minYClipPlane.constant = 1e6;
        this.maxYClipPlane.constant = 1e6;
        this.schemRenderer?.invalidate();
    }

    /** Real, properly-capped rebuild at the current Y range; single-flight. */
    private commitRenderingBounds(): void {
        this.pendingCommitMinY = this.currentMinY();
        this.pendingCommitMaxY = this.currentMaxY();
        this.renderingBoundsCommitQueued = true;
        void this.runRenderingBoundsCommit();
    }

    /** Rebuilds against the full bounds when a drag crosses outside what's currently loaded. */
    private resetToFullRangeIfNeeded(): void {
        if (this.lastCommittedMinY <= this.minY && this.lastCommittedMaxY >= this.maxY) return;
        this.pendingCommitMinY = this.minY;
        this.pendingCommitMaxY = this.maxY;
        this.renderingBoundsCommitQueued = true;
        void this.runRenderingBoundsCommit();
    }

    private async runRenderingBoundsCommit(): Promise<void> {
        if (this.renderingBoundsCommitInFlight) return;
        const schematicObj = this.schemRenderer?.schematicManager?.getSchematic(this.schematicId);
        if (!schematicObj) return;

        this.renderingBoundsCommitInFlight = true;
        try {
            while (this.renderingBoundsCommitQueued) {
                this.renderingBoundsCommitQueued = false;
                const targetMinY = this.pendingCommitMinY;
                const targetMaxY = this.pendingCommitMaxY;
                // Setting schematicObj.renderingBounds directly produces an unclipped rebuild.
                this.schemRenderer?.setRenderingBounds(
                    this.schematicId,
                    [this.minX, targetMinY, this.minZ],
                    [this.maxX, targetMaxY, this.maxZ],
                    false,
                );
                await this.waitForMeshesToSettle(schematicObj);
                // rebuildMesh() disposes old materials and may re-centre the group.
                this.clipYOffset = schematicObj.group.position.y;
                this.wireClippingPlanesOntoMaterials(schematicObj);
                this.disableClipPlanes();
                this.lastCommittedMinY = targetMinY;
                this.lastCommittedMaxY = targetMaxY;
            }
        } catch (e) {
            console.error('Failed to commit rendering bounds:', e);
        } finally {
            this.renderingBoundsCommitInFlight = false;
        }
    }

    /** Polls the group's child count until steady; rebuildMesh()'s own promise isn't reliable. */
    private async waitForMeshesToSettle(schematicObj: SchematicWithBounds, maxWaitMs = 90000): Promise<void> {
        const start = Date.now();
        let lastCount = -1;
        let stableStreak = 0;
        while (Date.now() - start < maxWaitMs) {
            const count = schematicObj.group.children.length;
            if (count > 0 && count === lastCount) {
                if (++stableStreak >= 3) return; // unchanged for ~600ms
            } else {
                stableStreak = 0;
            }
            lastCount = count;
            await new Promise(r => setTimeout(r, 200));
        }
    }

    /** Wires up manual drag tracking on the slider wrapper elements once they exist. */
    private attachDragListeners(): void {
        const minYEl = this.minYTrackRef?.nativeElement;
        const maxYEl = this.maxYTrackRef?.nativeElement;
        if (minYEl) {
            minYEl.addEventListener(
                'pointerdown',
                (e) => this.startSliderDrag(e, minYEl, this.minY, this.maxY, this.onMinYChange),
                { capture: true },
            );
        }
        if (maxYEl) {
            maxYEl.addEventListener(
                'pointerdown',
                (e) => this.startSliderDrag(e, maxYEl, this.minY, this.maxY, this.onMaxYChange),
                { capture: true },
            );
        }
    }

    private startSliderDrag(event: PointerEvent, trackEl: HTMLElement, min: number, max: number, setter: (value: number) => void): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.dragEl = trackEl;
        this.dragMin = min;
        this.dragMax = max;
        this.dragSetter = setter;
        this.updateClipPlanes(); // re-enable, was disabled after the last commit
        this.updateFromPointer(event);
        document.addEventListener('pointermove', this.onDocPointerMove);
        document.addEventListener('pointerup', this.onDocPointerUp);
    }

    private onDocPointerMove = (event: PointerEvent): void => {
        if (this.dragSetter) this.updateFromPointer(event);
    };

    private onDocPointerUp = (): void => {
        const wasDragging = this.dragSetter !== null;
        this.dragSetter = null;
        this.dragEl = null;
        document.removeEventListener('pointermove', this.onDocPointerMove);
        document.removeEventListener('pointerup', this.onDocPointerUp);
        // Clip planes were only ever a live preview; hand off to a real, capped rebuild now.
        if (wasDragging) this.commitRenderingBounds();
    };

    private updateFromPointer(event: PointerEvent): void {
        if (!this.dragEl || !this.dragSetter) return;
        const rect = this.dragEl.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        this.dragSetter(Math.round(this.dragMin + pct * (this.dragMax - this.dragMin)));
    }
}
