import {
    Component,
    Inject,
    signal,
    computed,
    NgZone,
    OnDestroy,
    ViewChild,
    ElementRef,
    AfterViewInit,
} from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';
import {
    BlockDefinition,
    BlockModel,
    TextureAtlas,
    Structure,
    StructureRenderer,
    type Resources,
    type Identifier,
} from 'deepslate';
import { mat4, vec3 } from 'gl-matrix';

import {
    parseLitematic,
    structureFromLitematicAsync,
    countNonAirBlocks,
} from './litematic-utils';
import { OPAQUE_BLOCKS, TRANSPARENT_BLOCKS, NON_SELF_CULLING } from './opaque-blocks';

// ── Public interface ──

export interface IsometricScreenshotData {
    fileData: ArrayBuffer;
    fileName: string;
    /** 'edit' shows "Use" button, 'download' shows "Download" (default: 'edit') */
    mode?: 'edit' | 'download';
}

@Component({
    selector: 'app-isometric-screenshot-dialog',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatTooltipModule,
        MatSliderModule,
        FormsModule,
    ],
    template: `
    <div class="screenshot-dialog">
        <div class="screenshot-header">
            <h2>Generate Picture</h2>
            <button mat-icon-button mat-dialog-close>
                <mat-icon>close</mat-icon>
            </button>
        </div>

        <div class="screenshot-body">
            @if (loading()) {
            <div class="loading-overlay">
                <mat-progress-bar [mode]="loadingProgress() > 0 ? 'determinate' : 'indeterminate'"
                    [value]="loadingProgress()" />
                <p>{{ loadingStatus() }}</p>
            </div>
            }
            @if (error()) {
            <div class="error-overlay">
                <mat-icon>error_outline</mat-icon>
                <p>{{ error() }}</p>
            </div>
            }
            <canvas #previewCanvas class="render-canvas"
                [class.hidden]="loading() || error()"
                [style.transform]="previewTransform()"></canvas>
        </div>

        @if (!loading() && !error()) {
        <div class="screenshot-controls">
            <div class="slider-group">
                <label>Yaw: {{ yaw }}°</label>
                <mat-slider [min]="-180" [max]="180" [step]="1" discrete>
                    <input matSliderThumb [(ngModel)]="yaw" (valueChange)="onCameraChange()" />
                </mat-slider>
            </div>
            <div class="slider-group">
                <label>Pitch: {{ pitch }}°</label>
                <mat-slider [min]="-90" [max]="90" [step]="1" discrete>
                    <input matSliderThumb [(ngModel)]="pitch" (valueChange)="onCameraChange()" />
                </mat-slider>
            </div>
            <div class="slider-group">
                <label>Zoom: {{ zoom }}%</label>
                <mat-slider [min]="25" [max]="300" [step]="5" discrete>
                    <input matSliderThumb [(ngModel)]="zoom" (valueChange)="onCameraChange()" />
                </mat-slider>
            </div>
        </div>

        <div class="screenshot-actions">
            <div class="controls-row">
                <button mat-icon-button (click)="rotateLeft()" matTooltip="Rotate left 90°">
                    <mat-icon>rotate_left</mat-icon>
                </button>
                <button mat-icon-button (click)="rotateRight()" matTooltip="Rotate right 90°">
                    <mat-icon>rotate_right</mat-icon>
                </button>
                <div class="preset-buttons">
                    <button mat-stroked-button (click)="applyPreset('front')" matTooltip="Front view">
                        Front
                    </button>
                    <button mat-stroked-button (click)="applyPreset('back')" matTooltip="Back view">
                        Back
                    </button>
                    <button mat-stroked-button (click)="applyPreset('top')" matTooltip="Top-down view">
                        Top
                    </button>
                    <button mat-stroked-button (click)="applyPreset('iso')" matTooltip="Isometric view">
                        Isometric
                    </button>
                </div>
                <span class="spacer"></span>
                <button mat-icon-button (click)="flipH()" matTooltip="Flip horizontal">
                    <mat-icon>flip</mat-icon>
                </button>
                <button mat-icon-button (click)="flipV()" matTooltip="Flip vertical" style="transform: rotate(90deg)">
                    <mat-icon>flip</mat-icon>
                </button>
            </div>
            <div class="confirm-row">
                <span class="spacer"></span>
                <button mat-stroked-button mat-dialog-close>Cancel</button>
                <button mat-flat-button (click)="confirm()">
                    <mat-icon>{{ data.mode === 'download' ? 'download' : 'check' }}</mat-icon>
                    {{ data.mode === 'download' ? 'Download' : 'Use' }}
                </button>
            </div>
        </div>
        }
    </div>
    `,
    styles: [`
        .screenshot-dialog {
            display: flex;
            flex-direction: column;
            height: 80vh;
            width: 100%;
            overflow: hidden;

            @media (max-width: 600px) {
                height: 100vh;
            }
        }

        .screenshot-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.5rem 1rem;
            flex-shrink: 0;
            h2 { margin: 0; font-size: 1.1rem; }
        }

        .screenshot-body {
            flex: 1;
            position: relative;
            min-height: 0;
            background: #1a1a2e;
            border-radius: 8px;
            margin: 0 1rem;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .loading-overlay,
        .error-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            color: rgba(255, 255, 255, 0.8);
            mat-progress-bar { width: 60%; max-width: 320px; }
            z-index: 1;
            p { margin: 0; font-size: 0.9rem; }
        }
        .error-overlay mat-icon { font-size: 48px; width: 48px; height: 48px; color: #ef5350; }

        .render-canvas {
            max-width: 100%;
            max-height: 100%;
            display: block;
            transition: transform 0.15s;
            &.hidden { visibility: hidden; }
        }

        .screenshot-controls {
            display: flex;
            gap: 1rem;
            padding: 0.75rem 1rem 0;
            flex-shrink: 0;
            flex-wrap: wrap;

            .slider-group {
                flex: 1;
                min-width: 140px;
                label {
                    font-size: 0.8rem;
                    opacity: 0.7;
                    margin-bottom: 0.25rem;
                    display: block;
                }
                mat-slider { width: 100%; }
            }
        }

        .screenshot-actions {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            padding: 0.5rem 1rem 0.75rem;
            flex-shrink: 0;
        }

        .controls-row, .confirm-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .preset-buttons {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            button { font-size: 0.8rem; }
        }

        .spacer { flex: 1; }
    `],
})
export class IsometricScreenshotDialogComponent implements AfterViewInit, OnDestroy {
    private static readonly MAX_BLOCKS = 250_000;
    private static readonly RENDER_SIZE = 2048;

    @ViewChild('previewCanvas', { static: false }) previewCanvasRef!: ElementRef<HTMLCanvasElement>;

    // ── Camera parameters (bound to template sliders) ──
    yaw = 45;     // degrees, horizontal rotation
    pitch = 35;   // degrees, vertical angle
    zoom = 100;   // percentage (100 = default fit)

    // ── Signals ──
    readonly loading = signal(true);
    readonly loadingProgress = signal(0);
    readonly loadingStatus = signal('Loading block definitions…');
    readonly error = signal('');
    readonly isFlippedH = signal(false);
    readonly isFlippedV = signal(false);
    readonly previewTransform = computed(() => {
        const sx = this.isFlippedH() ? -1 : 1;
        const sy = this.isFlippedV() ? -1 : 1;
        return `scale(${sx}, ${sy})`;
    });

    // ── Private state ──
    private offscreenCanvas!: HTMLCanvasElement;
    private gl!: WebGLRenderingContext;
    private renderer!: StructureRenderer;
    private resources!: Resources;
    private structure!: Structure;
    private previewCtx!: CanvasRenderingContext2D;
    private destroyed = false;
    private renderRequested = false;
    private viewReady = false;

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: IsometricScreenshotData,
        private dialogRef: MatDialogRef<IsometricScreenshotDialogComponent>,
        private http: HttpClient,
        private zone: NgZone,
    ) {
        this.init();
    }

    ngAfterViewInit(): void {
        this.viewReady = true;
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        if (this.gl) {
            const ext = this.gl.getExtension('WEBGL_lose_context');
            ext?.loseContext();
        }
    }

    // ── Public API ──

    onCameraChange(): void {
        if (!this.renderRequested) {
            this.renderRequested = true;
            requestAnimationFrame(() => {
                this.renderRequested = false;
                this.renderPreview();
            });
        }
    }

    rotateLeft(): void {
        this.yaw = ((this.yaw - 90 + 180) % 360) - 180;
        this.renderPreview();
    }

    rotateRight(): void {
        this.yaw = ((this.yaw + 90 + 180) % 360) - 180;
        this.renderPreview();
    }

    applyPreset(preset: 'front' | 'back' | 'top' | 'iso'): void {
        switch (preset) {
            case 'front': this.yaw = 0; this.pitch = 0; break;
            case 'back': this.yaw = 180; this.pitch = 0; break;
            case 'top': this.yaw = 0; this.pitch = 90; break;
            case 'iso': this.yaw = 45; this.pitch = 35; break;
        }
        this.renderPreview();
    }

    flipH(): void { this.isFlippedH.update(v => !v); }
    flipV(): void { this.isFlippedV.update(v => !v); }

    confirm(): void {
        if (!this.renderer || !this.structure) return;

        // Render at full resolution with transparent background for clean export
        const gl = this.gl;
        const view = this.buildViewMatrix();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.renderer.drawStructure(view);

        // Copy WebGL → 2D canvas for trimming
        const copyCanvas = document.createElement('canvas');
        copyCanvas.width = this.offscreenCanvas.width;
        copyCanvas.height = this.offscreenCanvas.height;
        copyCanvas.getContext('2d')!.drawImage(this.offscreenCanvas, 0, 0);

        const trimmed = this.trimCanvas(copyCanvas);
        const flipped = this.applyFlips(trimmed);
        flipped.toBlob((blob) => {
            if (!blob) return;
            const fileName = (this.data.fileName.replace(/\.litematic$/i, '') || 'screenshot') + '.png';
            const file = new File([blob], fileName, { type: 'image/png' });
            this.dialogRef.close(file);
        }, 'image/png');

        // Restore preview background
        this.renderPreview();
    }

    // ═══════════════════════════════════════════════════════════
    // Loading pipeline
    // ═══════════════════════════════════════════════════════════

    private init(): void {
        this.http.get<{
            blockstates: Record<string, unknown>;
            models: Record<string, unknown>;
            textures: Record<string, [number, number, number, number]>;
        }>('/assets/litematic-viewer/assets.json', {
            reportProgress: true,
            observe: 'events',
        }).subscribe({
            next: (event) => {
                if (event.type === HttpEventType.DownloadProgress && event.total) {
                    this.loadingProgress.set(Math.round((event.loaded / event.total) * 70));
                } else if (event.type === HttpEventType.Response) {
                    this.loadingProgress.set(70);
                    this.loadingStatus.set('Loading textures…');
                    this.loadAtlas(event.body as any);
                }
            },
            error: () => {
                this.error.set('Failed to load resources.');
                this.loading.set(false);
            },
        });
    }

    private loadAtlas(assets: {
        blockstates: Record<string, unknown>;
        models: Record<string, unknown>;
        textures: Record<string, [number, number, number, number]>;
    }): void {
        this.http.get('/assets/litematic-viewer/atlas.png', { responseType: 'blob' }).subscribe({
            next: (atlasBlob) => {
                this.loadingProgress.set(80);
                this.loadingStatus.set('Parsing litematic…');
                const img = new Image();
                img.onload = async () => {
                    try {
                        if (this.destroyed) return;

                        this.resources = this.buildResources(assets, img);

                        const litematic = parseLitematic(new Uint8Array(this.data.fileData));
                        if (!litematic.regions.length) {
                            this.error.set('No regions found in litematic file.');
                            this.loading.set(false);
                            return;
                        }

                        const region = litematic.regions[0];
                        let maxY = region.absHeight;

                        const totalBlocks = countNonAirBlocks(litematic);
                        if (totalBlocks > IsometricScreenshotDialogComponent.MAX_BLOCKS) {
                            let lo = 1, hi = region.absHeight;
                            while (lo < hi) {
                                const mid = Math.ceil((lo + hi) / 2);
                                if (countNonAirBlocks(litematic, 0, mid) <= IsometricScreenshotDialogComponent.MAX_BLOCKS) {
                                    lo = mid;
                                } else {
                                    hi = mid - 1;
                                }
                            }
                            maxY = lo;
                        }

                        this.loadingProgress.set(85);
                        this.loadingStatus.set('Building 3D structure…');
                        await new Promise<void>(r => setTimeout(r, 0));
                        if (this.destroyed) return;

                        this.structure = (await structureFromLitematicAsync(
                            litematic, 0, maxY,
                            (frac) => this.loadingProgress.set(85 + Math.round(frac * 8)),
                        ))!;

                        if (!this.structure || this.destroyed) return;

                        this.loadingProgress.set(94);
                        this.loadingStatus.set('Setting up renderer…');
                        await new Promise<void>(r => setTimeout(r, 0));
                        if (this.destroyed) return;

                        this.setupOffscreenGL();

                        const size = this.structure.getSize();
                        const volume = size[0] * size[1] * size[2];
                        const chunkSize = volume > 500_000 ? 32 : 16;
                        this.renderer = new StructureRenderer(
                            this.gl, this.structure, this.resources, { chunkSize },
                        );

                        // Set up the visible preview canvas
                        this.setupPreviewCanvas();

                        this.loadingProgress.set(97);
                        this.loadingStatus.set('Rendering…');
                        await new Promise<void>(r => setTimeout(r, 0));
                        if (this.destroyed) return;

                        this.renderPreview();
                        this.loading.set(false);
                    } catch (e) {
                        console.error('Screenshot init error:', e);
                        this.error.set('Failed to generate screenshot.');
                        this.loading.set(false);
                    }
                };
                img.onerror = () => {
                    this.error.set('Failed to load texture atlas.');
                    this.loading.set(false);
                };
                img.src = URL.createObjectURL(atlasBlob);
            },
            error: () => {
                this.error.set('Failed to load resources.');
                this.loading.set(false);
            },
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Resource building  (identical to the 3D viewer)
    // ═══════════════════════════════════════════════════════════

    private buildResources(
        assets: {
            blockstates: Record<string, unknown>;
            models: Record<string, unknown>;
            textures: Record<string, [number, number, number, number]>;
        },
        textureImage: HTMLImageElement,
    ): Resources {
        const blockDefinitions: Record<string, BlockDefinition> = {};
        for (const id of Object.keys(assets.blockstates)) {
            blockDefinitions['minecraft:' + id] = BlockDefinition.fromJson(
                id,
                assets.blockstates[id] as Parameters<typeof BlockDefinition.fromJson>[1],
            );
        }

        const blockModels: Record<string, BlockModel> = {};
        for (const id of Object.keys(assets.models)) {
            blockModels['minecraft:' + id] = BlockModel.fromJson(
                id,
                assets.models[id] as Parameters<typeof BlockModel.fromJson>[1],
            );
        }
        for (const builtin of ['builtin/generated', 'builtin/entity', 'builtin/block']) {
            if (!blockModels['minecraft:' + builtin]) {
                blockModels['minecraft:' + builtin] = BlockModel.fromJson(builtin, {});
            }
        }
        Object.values(blockModels).forEach(m =>
            m.flatten({ getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null }),
        );

        const atlasSize = this.upperPowerOfTwo(
            Math.max(textureImage.width, textureImage.height),
        );
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = textureImage.width;
        atlasCanvas.height = textureImage.height;
        const ctx = atlasCanvas.getContext('2d')!;
        ctx.drawImage(textureImage, 0, 0);
        const atlasData = ctx.getImageData(0, 0, atlasSize, atlasSize);

        const idMap: Record<string, [number, number, number, number]> = {};
        for (const id of Object.keys(assets.textures)) {
            const [u, v, du, dv] = assets.textures[id];
            const dv2 = du !== dv && id.startsWith('block/') ? du : dv;
            idMap['minecraft:' + id] = [
                u / atlasSize,
                v / atlasSize,
                (u + du) / atlasSize,
                (v + dv2) / atlasSize,
            ];
        }

        const textureAtlas = new TextureAtlas(atlasData, idMap);

        return {
            getBlockDefinition: (id: Identifier) => blockDefinitions[id.toString()] ?? null,
            getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null,
            getTextureUV: (id: Identifier) => textureAtlas.getTextureUV(id),
            getTextureAtlas: () => textureAtlas.getTextureAtlas(),
            getBlockFlags: (id: Identifier) => ({
                opaque: OPAQUE_BLOCKS.has(id.toString()),
                semi_transparent: TRANSPARENT_BLOCKS.has(id.toString()),
                self_culling: !NON_SELF_CULLING.has(id.toString()),
            }),
            getBlockProperties: () => null,
            getDefaultBlockProperties: () => null,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // Rendering
    // ═══════════════════════════════════════════════════════════

    private setupOffscreenGL(): void {
        const SIZE = IsometricScreenshotDialogComponent.RENDER_SIZE;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = SIZE;
        this.offscreenCanvas.height = SIZE;
        Object.defineProperty(this.offscreenCanvas, 'clientWidth', { value: SIZE });
        Object.defineProperty(this.offscreenCanvas, 'clientHeight', { value: SIZE });

        const gl = this.offscreenCanvas.getContext('webgl', {
            preserveDrawingBuffer: true,
            alpha: true,
            premultipliedAlpha: false,
            antialias: true,
        });
        if (!gl) throw new Error('WebGL is not supported');
        this.gl = gl;
        gl.viewport(0, 0, SIZE, SIZE);
    }

    /**
     * Match the visible preview canvas to its container and prepare
     * a 2D context for fast copies from the offscreen WebGL canvas.
     */
    private setupPreviewCanvas(): void {
        const preview = this.previewCanvasRef?.nativeElement;
        if (!preview) return;

        // Set internal resolution to match the offscreen canvas.
        // CSS max-width/max-height will scale it to fit the container.
        const SIZE = IsometricScreenshotDialogComponent.RENDER_SIZE;
        preview.width = SIZE;
        preview.height = SIZE;
        this.previewCtx = preview.getContext('2d')!;
    }

    /** Build the view matrix from current camera parameters. */
    private buildViewMatrix(): mat4 {
        const size = this.structure.getSize();
        const cx = size[0] / 2, cy = size[1] / 2, cz = size[2] / 2;

        const pitchRad = (this.pitch * Math.PI) / 180;
        const yawRad = (this.yaw * Math.PI) / 180;

        const radius = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const baseDist = Math.max(radius * 2.2, 5);
        const dist = baseDist * (100 / this.zoom);

        const cameraPos = vec3.fromValues(-cx, -cy, -cz);
        const zoomOffset = vec3.fromValues(0, 0, -dist);
        vec3.rotateX(zoomOffset, zoomOffset, [0, 0, 0], -pitchRad);
        vec3.rotateY(zoomOffset, zoomOffset, [0, 0, 0], -yawRad);
        vec3.add(cameraPos, cameraPos, zoomOffset);

        const view = mat4.create();
        mat4.rotateX(view, view, pitchRad);
        mat4.rotateY(view, view, yawRad);
        mat4.translate(view, view, cameraPos);

        return view;
    }

    /**
     * Render the 3D scene and copy it to the visible preview canvas.
     * This is fast: just a WebGL draw call + a single drawImage copy.
     * No PNG encoding or pixel scanning needed.
     */
    private renderPreview(): void {
        if (!this.renderer || !this.structure || !this.previewCtx) return;

        const gl = this.gl;
        const view = this.buildViewMatrix();

        // Render with dark background for preview
        gl.clearColor(0.102, 0.102, 0.180, 1.0); // #1a1a2e
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.renderer.drawStructure(view);

        // Fast GPU-accelerated copy to visible preview canvas
        this.previewCtx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // ═══════════════════════════════════════════════════════════
    // Post-processing helpers (only used on confirm/export)
    // ═══════════════════════════════════════════════════════════

    private trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
        const w = canvas.width, h = canvas.height;
        const ctx = canvas.getContext('2d')!;
        const data = ctx.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < minX) return canvas;

        const pad = 8;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cropW;
        out.height = cropH;
        out.getContext('2d')!.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        return out;
    }

    private applyFlips(src: HTMLCanvasElement): HTMLCanvasElement {
        const fh = this.isFlippedH(), fv = this.isFlippedV();
        if (!fh && !fv) return src;
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext('2d')!;
        ctx.translate(fh ? src.width : 0, fv ? src.height : 0);
        ctx.scale(fh ? -1 : 1, fv ? -1 : 1);
        ctx.drawImage(src, 0, 0);
        return out;
    }

    private upperPowerOfTwo(x: number): number {
        x -= 1;
        x |= x >> 1;
        x |= x >> 2;
        x |= x >> 4;
        x |= x >> 8;
        x |= x >> 16;
        return x + 1;
    }
}
