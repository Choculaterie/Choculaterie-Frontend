import {
    Component,
    Inject,
    signal,
    computed,
    OnDestroy,
    ViewChild,
    ElementRef,
    AfterViewInit,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { SchematicRenderer } from 'schematic-renderer';
import { RESOURCE_PACK_URL } from './resource-pack';

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
    ],
    template: `
    <div class="screenshot-dialog">
        <div class="screenshot-header">
            <h2>Generate Picture</h2>
            <button mat-icon-button mat-dialog-close>
                <img src="/icons/letters/X.svg" alt="" aria-hidden="true" class="mc-icon" />
            </button>
        </div>

        <div class="screenshot-body">
            @if (loading()) {
            <div class="loading-overlay">
                <mat-progress-bar mode="indeterminate" />
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
                [style.transform]="previewTransform()"
                (pointerdown)="startViewerDrag($event)"></canvas>

            @if (!loading() && !error()) {
            <a class="renderer-credit" href="https://github.com/Schem-at/schematic-renderer" target="_blank"
                rel="noopener noreferrer" i18n>Based on: schematic-renderer</a>
            }
        </div>

        @if (!loading() && !error()) {
        <div class="screenshot-controls">
            <div class="slider-group">
                <label>Yaw: {{ yaw() }}°</label>
                <div #yawTrack class="slider-track-wrap">
                    <mat-slider [min]="-180" [max]="180" [step]="1" discrete>
                        <input matSliderThumb [value]="yaw()" (valueChange)="onYawChange($event)" />
                    </mat-slider>
                </div>
            </div>
            <div class="slider-group">
                <label>Pitch: {{ pitch() }}°</label>
                <div #pitchTrack class="slider-track-wrap">
                    <mat-slider [min]="-90" [max]="90" [step]="1" discrete>
                        <input matSliderThumb [value]="pitch()" (valueChange)="onPitchChange($event)" />
                    </mat-slider>
                </div>
            </div>
        </div>

        <div class="screenshot-actions">
            <div class="controls-row">
                <button mat-icon-button (click)="rotateLeft()" matTooltip="Rotate left 90°">
                    <img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
                <button mat-icon-button (click)="rotateRight()" matTooltip="Rotate right 90°">
                    <img src="/icons/arrows/arrow_right.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
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
                    <button mat-stroked-button (click)="applyPreset('bottom')" matTooltip="Bottom-up view">
                        Bottom
                    </button>
                    <button mat-stroked-button (click)="applyPreset('iso')" matTooltip="Isometric view">
                        Isometric
                    </button>
                </div>
                <span class="spacer"></span>
                <button mat-icon-button (click)="flipH()" matTooltip="Flip horizontal">
                    <img src="/icons/arrows/arrow_double_ways.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
                <button mat-icon-button (click)="flipV()" matTooltip="Flip vertical">
                    <img src="/icons/arrows/arrow_up_down.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
            </div>
            <div class="confirm-row">
                <span class="spacer"></span>
                <button mat-stroked-button mat-dialog-close>Cancel</button>
                <button mat-flat-button (click)="confirm()">
                    <img [src]="data.mode === 'download' ? '/icons/arrows/arrow_down.svg' : '/icons/ui/check.svg'" alt="" aria-hidden="true" matButtonIcon class="mc-icon" />
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
                height: auto;
                overflow-y: auto;
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

            @media (max-width: 600px) {
                flex: none;
                height: 45vw;
                min-height: 200px;
            }
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
            width: 100%;
            height: 100%;
            display: block;
            transition: transform 0.15s;
            cursor: grab;
            touch-action: none;
            &.hidden { visibility: hidden; }
        }

        .renderer-credit {
            position: absolute;
            left: 0.75rem;
            bottom: 0.75rem;
            font-size: 0.65rem;
            color: rgba(255, 255, 255, 0.5);
            background: rgba(0, 0, 0, 0.4);
            padding: 0.3rem 0.6rem;
            border-radius: 4px;
            text-decoration: none;
            z-index: 1;

            &:hover {
                color: rgba(255, 255, 255, 0.85);
                text-decoration: underline;
            }
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
                .slider-track-wrap {
                    display: block;
                    width: 100%;
                    touch-action: none;
                }
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
    @ViewChild('previewCanvas', { static: false }) previewCanvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('yawTrack') yawTrackRef?: ElementRef<HTMLElement>;
    @ViewChild('pitchTrack') pitchTrackRef?: ElementRef<HTMLElement>;

    // Signals, not fields: this app is zoneless and both rAF animation and manual drag run
    // outside any Angular-triggered callback.
    readonly yaw = signal(45);     // degrees, horizontal rotation
    readonly pitch = signal(35);   // degrees, vertical angle (90 = straight down, -90 = up)

    readonly loading = signal(true);
    readonly loadingStatus = signal('Loading resource pack…');
    readonly error = signal('');
    readonly isFlippedH = signal(false);
    readonly isFlippedV = signal(false);
    readonly previewTransform = computed(() => {
        const sx = this.isFlippedH() ? -1 : 1;
        const sy = this.isFlippedV() ? -1 : 1;
        return `scale(${sx}, ${sy})`;
    });

    private schemRenderer?: SchematicRenderer;
    private readonly schematicId = 'main';
    private destroyed = false;
    private animFrame: number | null = null;
    // Angle a button press is animating towards; yaw/pitch reflect the mid-animation value.
    private targetYaw = 45;
    private targetPitch = 35;

    // Manual drag tracking: mat-slider only commits a value on pointer-up.
    private dragSetter: ((value: number) => void) | null = null;
    private dragEl: HTMLElement | null = null;
    private dragMin = 0;
    private dragMax = 0;

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: IsometricScreenshotData,
        private dialogRef: MatDialogRef<IsometricScreenshotDialogComponent>,
    ) { }

    ngAfterViewInit(): void {
        this.init();
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.cancelAnimation();
        this.onDocPointerUp();
        this.onViewerPointerUp();
        this.schemRenderer?.dispose();
    }

    // Arrow fields so they stay bound to `this` when passed as bare callbacks.
    onYawChange = (value: number): void => {
        this.cancelAnimation();
        this.yaw.set(value);
        this.targetYaw = value;
        this.applyCameraDirection();
    };

    onPitchChange = (value: number): void => {
        this.cancelAnimation();
        this.pitch.set(value);
        this.targetPitch = value;
        this.applyCameraDirection();
    };

    // `(pointerdown.capture)` isn't real Angular syntax; a real addEventListener with
    // {capture:true} is needed to run before mat-slider's own bubble-phase handler.
    private attachDragListeners(): void {
        const yawEl = this.yawTrackRef?.nativeElement;
        const pitchEl = this.pitchTrackRef?.nativeElement;
        if (yawEl) {
            yawEl.addEventListener(
                'pointerdown',
                (e) => this.startSliderDrag(e, yawEl, -180, 180, this.onYawChange),
                { capture: true },
            );
        }
        if (pitchEl) {
            pitchEl.addEventListener(
                'pointerdown',
                (e) => this.startSliderDrag(e, pitchEl, -90, 90, this.onPitchChange),
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
        this.updateFromPointer(event);
        document.addEventListener('pointermove', this.onDocPointerMove);
        document.addEventListener('pointerup', this.onDocPointerUp);
    }

    private onDocPointerMove = (event: PointerEvent): void => {
        if (this.dragSetter) this.updateFromPointer(event);
    };

    private onDocPointerUp = (): void => {
        this.dragSetter = null;
        this.dragEl = null;
        document.removeEventListener('pointermove', this.onDocPointerMove);
        document.removeEventListener('pointerup', this.onDocPointerUp);
    };

    private updateFromPointer(event: PointerEvent): void {
        if (!this.dragEl || !this.dragSetter) return;
        const rect = this.dragEl.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        this.dragSetter(Math.round(this.dragMin + pct * (this.dragMax - this.dragMin)));
    }

    // Drag-to-orbit on the preview: enableInteraction is off, so this maps mouse movement
    // directly onto yaw/pitch instead, keeping the sliders as the single source of truth.
    private viewerDragging = false;
    private viewerDragLastX = 0;
    private viewerDragLastY = 0;
    private static readonly DRAG_SENSITIVITY = 0.4; // degrees per pixel

    startViewerDrag(event: PointerEvent): void {
        if (event.button !== 0) return;
        event.preventDefault();
        this.cancelAnimation();
        this.viewerDragging = true;
        this.viewerDragLastX = event.clientX;
        this.viewerDragLastY = event.clientY;
        (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
        document.addEventListener('pointermove', this.onViewerPointerMove);
        document.addEventListener('pointerup', this.onViewerPointerUp);
    }

    private onViewerPointerMove = (event: PointerEvent): void => {
        if (!this.viewerDragging) return;
        const dx = event.clientX - this.viewerDragLastX;
        const dy = event.clientY - this.viewerDragLastY;
        this.viewerDragLastX = event.clientX;
        this.viewerDragLastY = event.clientY;

        const s = IsometricScreenshotDialogComponent.DRAG_SENSITIVITY;
        const newYaw = ((this.yaw() - dx * s + 540) % 360) - 180;
        const newPitch = Math.max(-90, Math.min(90, this.pitch() + dy * s));
        this.yaw.set(newYaw);
        this.pitch.set(newPitch);
        this.targetYaw = newYaw;
        this.targetPitch = newPitch;
        this.applyCameraDirection();
    };

    private onViewerPointerUp = (): void => {
        this.viewerDragging = false;
        this.previewCanvasRef?.nativeElement.style.removeProperty('cursor');
        document.removeEventListener('pointermove', this.onViewerPointerMove);
        document.removeEventListener('pointerup', this.onViewerPointerUp);
    };

    /** snapToDirection takes a raw vector with no pitch clamp, unlike the isometric angle setter. */
    private applyCameraDirection(): void {
        const yawRad = (this.yaw() * Math.PI) / 180;
        const pitchRad = (this.pitch() * Math.PI) / 180;
        const direction: [number, number, number] = [
            Math.cos(pitchRad) * Math.sin(yawRad),
            Math.sin(pitchRad),
            Math.cos(pitchRad) * Math.cos(yawRad),
        ];
        this.schemRenderer?.cameraManager.snapToDirection(direction, false);
        this.schemRenderer?.invalidate();
    }

    /** Smoothly animates yaw/pitch to a target; only used for button-driven jumps. */
    private animateTo(targetYaw: number, targetPitch: number, duration = 400): void {
        this.cancelAnimation();
        this.targetYaw = targetYaw;
        this.targetPitch = targetPitch;
        const startYaw = this.yaw();
        const startPitch = this.pitch();
        // Shortest-path delta so e.g. 170° → -170° turns 20° the short way, not 340° the long way.
        const deltaYaw = ((targetYaw - startYaw + 540) % 360) - 180;
        const deltaPitch = targetPitch - startPitch;
        const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep
        const startTime = performance.now();

        const step = (now: number) => {
            const t = Math.min(1, (now - startTime) / duration);
            const e = ease(t);
            this.yaw.set(startYaw + deltaYaw * e);
            this.pitch.set(startPitch + deltaPitch * e);
            this.applyCameraDirection();
            if (t < 1) {
                this.animFrame = requestAnimationFrame(step);
            } else {
                this.yaw.set(targetYaw);
                this.pitch.set(targetPitch);
                this.applyCameraDirection();
                this.animFrame = null;
            }
        };
        this.animFrame = requestAnimationFrame(step);
    }

    private cancelAnimation(): void {
        if (this.animFrame !== null) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    }

    rotateLeft(): void {
        this.animateTo(((this.targetYaw - 90 + 180) % 360) - 180, this.targetPitch);
    }

    rotateRight(): void {
        this.animateTo(((this.targetYaw + 90 + 180) % 360) - 180, this.targetPitch);
    }

    applyPreset(preset: 'front' | 'back' | 'top' | 'bottom' | 'iso'): void {
        const targets: Record<typeof preset, [number, number]> = {
            front: [0, 0], back: [180, 0], top: [0, 90], bottom: [0, -90], iso: [45, 35],
        };
        const [targetYaw, targetPitch] = targets[preset];
        this.animateTo(targetYaw, targetPitch);
    }

    flipH(): void { this.isFlippedH.update(v => !v); }
    flipV(): void { this.isFlippedV.update(v => !v); }

    async confirm(): Promise<void> {
        if (!this.schemRenderer) return;

        // Jump straight to the target in case a rotation animation is still in flight.
        this.cancelAnimation();
        this.yaw.set(this.targetYaw);
        this.pitch.set(this.targetPitch);
        this.applyCameraDirection();

        // Grid and opaque background are live-preview aids only; turn off for the capture.
        this.schemRenderer.setGridVisible(false);
        await this.schemRenderer.renderManager?.setBackgroundMode('transparent');
        try {
            const blob = await this.schemRenderer.takeScreenshot({ format: 'image/png', transparent: true });
            const flipped = await this.applyFlips(blob);
            const fileName = (this.data.fileName.replace(/\.litematic$/i, '') || 'screenshot') + '.png';
            const file = new File([flipped], fileName, { type: 'image/png' });
            this.dialogRef.close(file);
        } finally {
            this.schemRenderer.setGridVisible(true);
            await this.schemRenderer.renderManager?.setBackgroundMode('solid', { color: '#1a1a2e' });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Loading pipeline
    // ═══════════════════════════════════════════════════════════

    private async init(): Promise<void> {
        try {
            const canvas = this.previewCanvasRef.nativeElement;
            this.loadingStatus.set('Loading resource pack…');

            let onReady!: () => void;
            const ready = new Promise<void>(resolve => { onReady = resolve; });
            const renderer = new SchematicRenderer(canvas, {}, {
                vanilla: () => fetch(RESOURCE_PACK_URL).then(r => r.blob()),
            }, {
                showGrid: true,
                backgroundColor: '#1a1a2e',
                enableDragAndDrop: false,
                enableGizmos: false,
                enableInteraction: false,
                enableProgressBar: false,
                sidebarOptions: { enabled: false } as any,
                cameraOptions: { defaultCameraPreset: 'perspective' },
                callbacks: { onRendererInitialized: () => onReady() },
            });
            this.schemRenderer = renderer;
            if (this.destroyed) { renderer.dispose(); return; }

            await ready;
            if (this.destroyed) return;

            this.loadingStatus.set('Building 3D structure…');
            await renderer.schematicManager!.loadSchematic(this.schematicId, this.data.fileData);
            if (this.destroyed) return;

            await renderer.cameraManager.focusOnSchematics();
            this.applyCameraDirection();

            this.loading.set(false);
            // Sliders are behind @if (!loading()); wait a tick for the ViewChild refs to exist.
            setTimeout(() => this.attachDragListeners());
        } catch (e) {
            console.error('Screenshot init error:', e);
            this.error.set('Failed to generate screenshot.');
            this.loading.set(false);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Export helpers
    // ═══════════════════════════════════════════════════════════

    private applyFlips(src: Blob): Promise<Blob> {
        const fh = this.isFlippedH(), fv = this.isFlippedV();
        if (!fh && !fv) return Promise.resolve(src);

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const out = document.createElement('canvas');
                out.width = img.width;
                out.height = img.height;
                const ctx = out.getContext('2d')!;
                ctx.translate(fh ? img.width : 0, fv ? img.height : 0);
                ctx.scale(fh ? -1 : 1, fv ? -1 : 1);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
                out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
            };
            img.onerror = () => reject(new Error('Failed to load screenshot for flipping'));
            img.src = URL.createObjectURL(src);
        });
    }
}
