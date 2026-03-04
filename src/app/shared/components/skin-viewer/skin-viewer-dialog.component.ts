import {
    Component,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    Inject,
    signal,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as skinview3d from 'skinview3d';
import { MojangProxyService } from '../../../api/mojang-proxy';

export interface SkinViewerDialogData {
    username: string;
}

@Component({
    selector: 'app-skin-viewer-dialog',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
    ],
    templateUrl: './skin-viewer-dialog.component.html',
    styleUrl: './skin-viewer-dialog.component.scss',
})
export class SkinViewerDialogComponent implements AfterViewInit, OnDestroy {
    @ViewChild('skinCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

    readonly loading = signal(true);
    readonly error = signal('');
    readonly playerName = signal('');
    readonly animating = signal(true);

    private viewer: skinview3d.SkinViewer | null = null;
    private skinUrl = '';

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: SkinViewerDialogData,
        private dialogRef: MatDialogRef<SkinViewerDialogComponent>,
        private mojang: MojangProxyService,
    ) { }

    ngAfterViewInit(): void {
        this.initViewer();
    }

    ngOnDestroy(): void {
        this.viewer?.dispose();
        this.viewer = null;
    }

    private async initViewer(): Promise<void> {
        const canvas = this.canvasRef.nativeElement;

        this.viewer = new skinview3d.SkinViewer({ canvas, width: canvas.offsetWidth || 360, height: canvas.offsetHeight || 480 });
        this.viewer.fov = 50;
        this.viewer.zoom = 0.9;

        if (this.viewer.controls) {
            this.viewer.controls.enablePan = false;
            this.viewer.controls.enableDamping = true;
            this.viewer.controls.dampingFactor = 0.08;
            this.viewer.controls.enableZoom = true;
            this.viewer.controls.minDistance = 15;
            this.viewer.controls.maxDistance = 65;
        }

        this.viewer.animation = new skinview3d.WalkingAnimation();
        (this.viewer.animation as skinview3d.WalkingAnimation).speed = 0.5;

        await this.loadSkin(this.data.username);
    }

    private async loadSkin(username: string): Promise<void> {
        this.loading.set(true);
        this.error.set('');

        try {
            // Step 1: username → UUID via proxy
            const profileUrl = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
            const profile = await this.mojang
                .getApiMojangProxy<{ id: string; name: string }>({ endpoint: profileUrl })
                .toPromise();

            if (!profile?.id) {
                this.error.set(`Player "${username}" not found.`);
                this.loading.set(false);
                return;
            }

            const uuid = profile.id.replace(/-/g, '');
            this.playerName.set(profile.name);

            // Step 2: UUID → session profile with textures
            const sessionUrl = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;
            const session = await this.mojang
                .getApiMojangProxy<{ name: string; properties: { name: string; value: string }[] }>({ endpoint: sessionUrl })
                .toPromise();

            if (!session) {
                this.error.set('Failed to fetch skin data.');
                this.loading.set(false);
                return;
            }

            this.playerName.set(session.name);

            const texturesProp = session.properties?.find(p => p.name === 'textures');
            if (!texturesProp) {
                this.error.set('No skin data found for this player.');
                this.loading.set(false);
                return;
            }

            const texturesJson = JSON.parse(atob(texturesProp.value));
            let skinUrl: string = texturesJson?.textures?.SKIN?.url;

            if (!skinUrl) {
                this.error.set('No skin found for this player.');
                this.loading.set(false);
                return;
            }

            skinUrl = skinUrl.replace(/^http:\/\//i, 'https://');
            this.skinUrl = skinUrl;

            if (this.viewer) {
                await this.viewer.loadSkin(skinUrl);
            }

            this.loading.set(false);
        } catch (err: any) {
            const status = err?.status;
            if (status === 404) {
                this.error.set(`Player "${username}" not found.`);
            } else {
                this.error.set('Failed to load skin. Please try again.');
            }
            this.loading.set(false);
        }
    }

    toggleAnimation(): void {
        if (!this.viewer) return;
        const next = !this.animating();
        this.animating.set(next);
        if (next) {
            this.viewer.animation = new skinview3d.WalkingAnimation();
            (this.viewer.animation as skinview3d.WalkingAnimation).speed = 0.5;
        } else {
            this.viewer.animation = null;
        }
    }

    screenshotBody(): void {
        if (!this.viewer) return;
        this.viewer.renderPaused = true;
        this.viewer.render();
        const canvas = this.canvasRef.nativeElement;
        const url = canvas.toDataURL('image/png');
        this.viewer.renderPaused = false;
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.playerName() || 'skin'}.png`;
        a.click();
    }

    async screenshotFace(): Promise<void> {
        if (!this.skinUrl) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = this.skinUrl;
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); });
        const out = document.createElement('canvas');
        out.width = 128;
        out.height = 128;
        const ctx = out.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        // Face base layer (8,8 on the skin texture)
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 128, 128);
        // Hat/overlay layer (40,8 on the skin texture)
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 128, 128);
        const a = document.createElement('a');
        a.href = out.toDataURL('image/png');
        a.download = `${this.playerName() || 'face'}-face.png`;
        a.click();
    }

    close(): void {
        this.dialogRef.close();
    }
}
