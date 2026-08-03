import {
    Component,
    Inject,
    Optional,
    input,
    output,
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
import * as THREE from 'three';
import { RESOURCE_PACK_URL } from './resource-pack';

export interface IsometricScreenshotData {
    fileData: ArrayBuffer;
    fileName: string;
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
    <div class="screenshot-dialog" [class.embed]="isEmbed()">
        @if (!isEmbed()) {
        <div class="screenshot-header">
            <h2>Generate Picture</h2>
            <button mat-icon-button type="button" (click)="cancel()">
                <img src="/icons/letters/X.svg" alt="" aria-hidden="true" class="mc-icon" />
            </button>
        </div>
        } @else {
        <div class="screenshot-header embed-header">
            <h2 i18n>Generate picture</h2>
            <button mat-icon-button type="button" (click)="cancel()" i18n-matTooltip matTooltip="Cancel">
                <img src="/icons/letters/X.svg" alt="" aria-hidden="true" class="mc-icon" />
            </button>
        </div>
        }

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
                (pointerdown)="startViewerDrag($event)"></canvas>
            @if (freezeUrl(); as freeze) {
            <img class="freeze-overlay" [src]="freeze" alt="" />
            }

            @if (!loading() && !error() && !isEmbed() && !freezeUrl()) {
            <a class="renderer-credit" href="https://github.com/Schem-at/schematic-renderer" target="_blank"
                rel="noopener noreferrer" i18n>Based on: schematic-renderer</a>
            }
        </div>

        @if (!loading() && !error()) {
        <div class="screenshot-controls">
            <div class="slider-group">
                <label>Yaw: {{ yawRounded() }}°</label>
                <div #yawTrack class="slider-track-wrap">
                    <mat-slider [min]="-180" [max]="180" [step]="1" discrete>
                        <input matSliderThumb [value]="yaw()" (valueChange)="onYawChange($event)" />
                    </mat-slider>
                </div>
            </div>
            <div class="slider-group">
                <label>Pitch: {{ pitchRounded() }}°</label>
                <div #pitchTrack class="slider-track-wrap">
                    <mat-slider [min]="-90" [max]="90" [step]="1" discrete>
                        <input matSliderThumb [value]="pitch()" (valueChange)="onPitchChange($event)" />
                    </mat-slider>
                </div>
            </div>
        </div>

        <div class="screenshot-actions">
            <div class="controls-row">
                <button mat-icon-button type="button" (click)="rotateLeft()" matTooltip="Rotate left 90°">
                    <img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
                <button mat-icon-button type="button" (click)="rotateRight()" matTooltip="Rotate right 90°">
                    <img src="/icons/arrows/arrow_right.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
                <div class="preset-buttons">
                    <button mat-stroked-button type="button" (click)="applyPreset('front')" matTooltip="Front view">Front</button>
                    <button mat-stroked-button type="button" (click)="applyPreset('back')" matTooltip="Back view">Back</button>
                    <button mat-stroked-button type="button" (click)="applyPreset('top')" matTooltip="Top-down view">Top</button>
                    <button mat-stroked-button type="button" (click)="applyPreset('bottom')" matTooltip="Bottom-up view">Bottom</button>
                    <button mat-stroked-button type="button" (click)="applyPreset('iso')" matTooltip="Isometric view">Isometric</button>
                </div>
                <span class="spacer"></span>
                <button mat-icon-button type="button" (click)="flipH()" matTooltip="Flip horizontal">
                    <img src="/icons/arrows/arrow_double_ways.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
                <button mat-icon-button type="button" (click)="flipV()" matTooltip="Flip vertical">
                    <img src="/icons/arrows/arrow_up_down.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(1px)" />
                </button>
            </div>
            <div class="confirm-row">
                <span class="spacer"></span>
                <button mat-stroked-button type="button" (click)="cancel()" i18n>Cancel</button>
                <button mat-flat-button type="button" (click)="confirm()">
                    <img [src]="resolvedMode() === 'download' ? '/icons/arrows/arrow_down.svg' : '/icons/ui/check.svg'" alt="" aria-hidden="true" matButtonIcon class="mc-icon" />
                    {{ resolvedMode() === 'download' ? 'Download' : 'Use' }}
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

            &.embed {
                height: auto;
                overflow: visible;
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

        .embed-header {
            padding: 0 0 0.5rem;
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

        .embed .screenshot-body {
            flex: none;
            width: 100%;
            height: 500px;
            margin: 0;
            border-radius: 12px;
            background: var(--mat-sys-surface-container);
            border: 1px solid var(--mat-sys-outline-variant);
            box-sizing: border-box;

            @media (max-width: 600px) {
                height: 220px;
                min-height: 0;
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

        .embed .loading-overlay,
        .embed .error-overlay {
            color: var(--mat-sys-on-surface);
        }

        .render-canvas {
            width: 100%;
            height: 100%;
            display: block;
            cursor: grab;
            touch-action: none;
            &.hidden { visibility: hidden; }
        }

        .freeze-overlay {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: fill;
            z-index: 5;
            pointer-events: none;
            border-radius: inherit;
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

        .embed .screenshot-controls {
            padding: 0.75rem 0 0;
        }

        .screenshot-actions {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            padding: 0.5rem 1rem 0.75rem;
            flex-shrink: 0;
        }

        .embed .screenshot-actions {
            padding: 0.5rem 0 0;
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
    private static readonly CAPTURE_H = 1000;
    private static readonly CAPTURE_W = Math.round(1000 * (960 / 500));

    readonly layout = input<'dialog' | 'embed'>('dialog');
    readonly fileData = input<ArrayBuffer | null>(null);
    readonly fileName = input('screenshot.litematic');
    readonly actionMode = input<'edit' | 'download'>('edit');

    readonly used = output<File>();
    readonly cancelled = output<void>();

    @ViewChild('previewCanvas', { static: false }) previewCanvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('yawTrack') yawTrackRef?: ElementRef<HTMLElement>;
    @ViewChild('pitchTrack') pitchTrackRef?: ElementRef<HTMLElement>;

    readonly yaw = signal(45);
    readonly pitch = signal(35);
    readonly yawRounded = computed(() => Math.round(this.yaw()));
    readonly pitchRounded = computed(() => Math.round(this.pitch()));
    readonly loading = signal(true);
    readonly loadingStatus = signal('Loading resource pack…');
    readonly error = signal('');
    readonly isFlippedH = signal(false);
    readonly isFlippedV = signal(false);
    readonly freezeUrl = signal<string | null>(null);

    private schemRenderer?: SchematicRenderer;
    private readonly schematicId = 'main';
    private destroyed = false;
    private animFrame: number | null = null;
    private targetYaw = 45;
    private targetPitch = 35;
    private dragSetter: ((value: number) => void) | null = null;
    private dragEl: HTMLElement | null = null;
    private dragMin = 0;
    private dragMax = 0;
    private viewerDragging = false;
    private viewerDragLastX = 0;
    private viewerDragLastY = 0;
    private static readonly DRAG_SENSITIVITY = 0.4;

    constructor(
        @Optional() @Inject(MAT_DIALOG_DATA) private dialogData: IsometricScreenshotData | null,
        @Optional() private dialogRef: MatDialogRef<IsometricScreenshotDialogComponent> | null,
    ) { }

    isEmbed(): boolean {
        return this.layout() === 'embed';
    }

    resolvedMode(): 'edit' | 'download' {
        return this.dialogData?.mode ?? this.actionMode();
    }

    private resolveSource(): IsometricScreenshotData | null {
        if (this.dialogData?.fileData) return this.dialogData;
        const buf = this.fileData();
        if (!buf) return null;
        return { fileData: buf, fileName: this.fileName(), mode: this.actionMode() };
    }

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

    cancel(): void {
        if (this.dialogRef) this.dialogRef.close(null);
        else this.cancelled.emit();
    }

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

    startViewerDrag(event: PointerEvent): void {
        // Left = orbit yaw/pitch (ours). Right = pan (orbit controls). Don't steal right-click.
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

    private getOrbitControls(): { target?: THREE.Vector3; update?: () => void } | undefined {
        const cm = this.schemRenderer?.cameraManager as any;
        return cm?.controls?.get?.(cm.activeControlKey);
    }

    private getSchematicCenter(): THREE.Vector3 {
        const sch = this.schemRenderer?.schematicManager?.getSchematic(this.schematicId) as
            { group?: THREE.Object3D } | undefined;
        if (sch?.group) {
            return new THREE.Box3().setFromObject(sch.group).getCenter(new THREE.Vector3());
        }
        return new THREE.Vector3();
    }

    private applyCameraDirection(lookTarget?: THREE.Vector3): void {
        const cm = this.schemRenderer?.cameraManager as any;
        const cam = cm?.activeCamera?.camera as THREE.Camera | undefined;
        if (!cm || !cam) return;

        const yawRad = (this.yaw() * Math.PI) / 180;
        const pitchRad = (this.pitch() * Math.PI) / 180;
        const dir = new THREE.Vector3(
            Math.cos(pitchRad) * Math.sin(yawRad),
            Math.sin(pitchRad),
            Math.cos(pitchRad) * Math.cos(yawRad),
        ).normalize();

        const controls = this.getOrbitControls();
        const target = lookTarget?.clone()
            ?? controls?.target?.clone()
            ?? (typeof cm.getControlsTarget === 'function' ? cm.getControlsTarget() : null)
            ?? new THREE.Vector3();

        if (controls?.target && lookTarget) {
            controls.target.copy(lookTarget);
        }

        let dist = cam.position.distanceTo(target);
        if (!Number.isFinite(dist) || dist < 0.5) dist = 20;

        cam.position.copy(target).addScaledVector(dir, dist);
        cam.lookAt(target);
        controls?.update?.();
        this.schemRenderer?.invalidate();
    }

    private configureOrbitForPanOnly(): void {
        const cm = this.schemRenderer?.cameraManager as any;
        const controls = cm?.controls?.get?.(cm.activeControlKey) as any;
        if (!controls) return;
        // Left-drag is owned by our yaw/pitch handler; right-drag pans without resetting.
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.enableZoom = true;
        if (controls.mouseButtons && THREE.MOUSE) {
            controls.mouseButtons.LEFT = null;
            controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
            controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        }
    }

    private animateTo(targetYaw: number, targetPitch: number, duration = 400): void {
        this.cancelAnimation();
        this.targetYaw = targetYaw;
        this.targetPitch = targetPitch;
        const startYaw = this.yaw();
        const startPitch = this.pitch();
        const deltaYaw = ((targetYaw - startYaw + 540) % 360) - 180;
        const deltaPitch = targetPitch - startPitch;

        const controls = this.getOrbitControls();
        const startPan = controls?.target?.clone() ?? this.getSchematicCenter();
        const endPan = this.getSchematicCenter();
        const ease = (t: number) => t * t * (3 - 2 * t);
        const startTime = performance.now();

        const step = (now: number) => {
            const t = Math.min(1, (now - startTime) / duration);
            const e = ease(t);
            this.yaw.set(startYaw + deltaYaw * e);
            this.pitch.set(startPitch + deltaPitch * e);
            const pan = startPan.clone().lerp(endPan, e);
            this.applyCameraDirection(pan);
            if (t < 1) {
                this.animFrame = requestAnimationFrame(step);
            } else {
                this.yaw.set(targetYaw);
                this.pitch.set(targetPitch);
                this.applyCameraDirection(endPan);
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

    flipH(): void {
        this.isFlippedH.update(v => !v);
        this.applySceneFlips();
        this.animateTo(this.targetYaw, this.targetPitch);
    }

    flipV(): void {
        this.isFlippedV.update(v => !v);
        this.applySceneFlips();
        this.animateTo(this.targetYaw, this.targetPitch);
    }

    private applySceneFlips(): void {
        const sch = this.schemRenderer?.schematicManager?.getSchematic(this.schematicId) as
            { group?: THREE.Object3D } | undefined;
        if (!sch?.group || !this.schemRenderer) return;

        const group = sch.group;
        const before = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());

        group.scale.set(
            this.isFlippedH() ? -1 : 1,
            this.isFlippedV() ? -1 : 1,
            1,
        );
        group.updateMatrixWorld(true);

        const after = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
        group.position.x += before.x - after.x;
        group.position.y += before.y - after.y;
        group.position.z += before.z - after.z;
        group.updateMatrixWorld(true);

        this.schemRenderer.invalidate();
    }

    async confirm(): Promise<void> {
        if (!this.schemRenderer) return;
        const source = this.resolveSource();
        if (!source) return;

        this.cancelAnimation();
        this.yaw.set(this.targetYaw);
        this.pitch.set(this.targetPitch);
        this.applyCameraDirection();
        this.applySceneFlips();

        const embed = this.isEmbed();
        const camState = this.snapshotCamera();
        await this.showFreezeOverlay();

        try {
            this.schemRenderer.setGridVisible(false);
            await this.schemRenderer.renderManager?.setBackgroundMode('transparent');

            let blob = await this.schemRenderer.takeScreenshot({
                format: 'image/png',
                transparent: true,
                width: IsometricScreenshotDialogComponent.CAPTURE_W,
                height: IsometricScreenshotDialogComponent.CAPTURE_H,
            });
            blob = await this.normalizeGeckoOrientation(blob);

            // Restore live view fully before unfreezing (takeScreenshot resizes the canvas).
            if (!embed) {
                this.schemRenderer.setGridVisible(true);
                await this.schemRenderer.renderManager?.setBackgroundMode('solid', { color: '#1a1a2e' });
            } else {
                this.schemRenderer.setGridVisible(false);
                await this.schemRenderer.renderManager?.setBackgroundMode('transparent');
            }
            this.restoreCamera(camState);
            window.dispatchEvent(new Event('resize'));
            this.restoreCamera(camState);
            this.schemRenderer.invalidate();
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
            this.hideFreezeOverlay();

            const name = (source.fileName.replace(/\.litematic$/i, '') || 'screenshot') + '.png';
            const file = new File([blob], name, { type: 'image/png' });

            if (this.resolvedMode() === 'download') {
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
                return;
            }
            if (this.dialogRef) this.dialogRef.close(file);
            else this.used.emit(file);
        } catch (e) {
            if (!embed) {
                this.schemRenderer.setGridVisible(true);
                await this.schemRenderer.renderManager?.setBackgroundMode('solid', { color: '#1a1a2e' });
            } else {
                this.schemRenderer.setGridVisible(false);
                await this.schemRenderer.renderManager?.setBackgroundMode('transparent');
            }
            this.restoreCamera(camState);
            this.schemRenderer.invalidate();
            this.hideFreezeOverlay();
            throw e;
        }
    }

    private snapshotCamera(): {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        aspect: number;
        target: THREE.Vector3 | null;
        distance: number;
    } | null {
        const cm = this.schemRenderer?.cameraManager as any;
        const cam = cm?.activeCamera?.camera as THREE.PerspectiveCamera | undefined;
        if (!cam) return null;
        const controls = cm.controls?.get?.(cm.activeControlKey) as { target?: THREE.Vector3 } | undefined;
        const target = controls?.target?.clone() ?? null;
        const distance = target ? cam.position.distanceTo(target) : cam.position.length();
        return {
            position: cam.position.clone(),
            quaternion: cam.quaternion.clone(),
            aspect: cam.aspect,
            target,
            distance,
        };
    }

    private restoreCamera(state: {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        aspect: number;
        target: THREE.Vector3 | null;
        distance: number;
    } | null): void {
        if (!state) return;
        const cm = this.schemRenderer?.cameraManager as any;
        const cam = cm?.activeCamera?.camera as THREE.PerspectiveCamera | undefined;
        if (!cam) return;
        const controls = cm.controls?.get?.(cm.activeControlKey) as
            { target?: THREE.Vector3; update?: () => void } | undefined;

        if (state.target && controls?.target) {
            controls.target.copy(state.target);
        }
        cam.position.copy(state.position);
        cam.quaternion.copy(state.quaternion);
        if ('aspect' in cam) {
            cam.aspect = state.aspect;
            cam.updateProjectionMatrix();
        }
        // Re-apply orbit distance from saved yaw/pitch so resize cannot leave a zoomed framing.
        this.applyCameraDirection();
        if (state.target && controls?.target) {
            const dir = cam.position.clone().sub(controls.target).normalize();
            cam.position.copy(controls.target).addScaledVector(dir, state.distance);
            cam.lookAt(controls.target);
        }
        controls?.update?.();
    }

    private async showFreezeOverlay(): Promise<void> {
        const src = this.previewCanvasRef?.nativeElement;
        if (!src) return;
        this.schemRenderer?.invalidate();
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

        const w = Math.max(1, src.width || Math.floor(src.clientWidth * (window.devicePixelRatio || 1)));
        const h = Math.max(1, src.height || Math.floor(src.clientHeight * (window.devicePixelRatio || 1)));
        const freeze = document.createElement('canvas');
        freeze.width = w;
        freeze.height = h;
        const ctx = freeze.getContext('2d')!;
        const body = src.parentElement;
        const bg = body ? getComputedStyle(body).backgroundColor : '#1a1a2e';
        const solid = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : '#1a1a2e';
        ctx.fillStyle = solid;
        ctx.fillRect(0, 0, w, h);
        try {
            ctx.drawImage(src, 0, 0, w, h);
        } catch { /* ignore */ }
        this.freezeUrl.set(freeze.toDataURL('image/png'));
        // Wait until the overlay is actually painted before mutating the WebGL canvas.
        await new Promise<void>(r => setTimeout(r, 32));
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }

    private hideFreezeOverlay(): void {
        this.freezeUrl.set(null);
    }

    private async init(): Promise<void> {
        try {
            const source = this.resolveSource();
            if (!source) {
                this.error.set('No schematic file.');
                this.loading.set(false);
                return;
            }

            const canvas = this.previewCanvasRef.nativeElement;
            this.loadingStatus.set('Loading resource pack…');
            const embed = this.isEmbed();

            let onReady!: () => void;
            const ready = new Promise<void>(resolve => { onReady = resolve; });
            const renderer = new SchematicRenderer(canvas, {}, {
                vanilla: () => fetch(RESOURCE_PACK_URL).then(r => r.blob()),
            }, {
                showGrid: !embed,
                backgroundColor: embed ? '#00000000' : '#1a1a2e',
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

            if (embed) {
                await renderer.renderManager?.setBackgroundMode('transparent');
            }

            this.loadingStatus.set('Building 3D structure…');
            await renderer.schematicManager!.loadSchematic(this.schematicId, source.fileData);
            if (this.destroyed) return;

            this.loading.set(false);
            await new Promise<void>(r => requestAnimationFrame(() => r()));
            window.dispatchEvent(new Event('resize'));
            await renderer.cameraManager.focusOnSchematics();
            this.configureOrbitForPanOnly();
            this.applyCameraDirection();
            setTimeout(() => this.attachDragListeners());
        } catch (e) {
            console.error('Screenshot init error:', e);
            this.error.set('Failed to generate screenshot.');
            this.loading.set(false);
        }
    }

    private isGecko(): boolean {
        return /Firefox|LibreWolf/i.test(navigator.userAgent);
    }

    private normalizeGeckoOrientation(src: Blob): Promise<Blob> {
        if (!this.isGecko()) return Promise.resolve(src);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const out = document.createElement('canvas');
                out.width = img.width;
                out.height = img.height;
                const ctx = out.getContext('2d')!;
                ctx.translate(0, img.height);
                ctx.scale(1, -1);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
                out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
            };
            img.onerror = () => reject(new Error('Failed to load screenshot for transform'));
            img.src = URL.createObjectURL(src);
        });
    }
}
