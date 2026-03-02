import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ImageCropperComponent, ImageCroppedEvent, OutputFormat } from 'ngx-image-cropper';

export interface CropperDialogData {
    imageFile: File;
    aspectRatio?: number;
    roundCropper?: boolean;
    format?: OutputFormat;
}

export interface CropperDialogResult {
    blob: Blob;
    file: File;
}

@Component({
    selector: 'app-image-cropper-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ImageCropperComponent],
    template: `
    <h2 mat-dialog-title>Crop Image</h2>
    <mat-dialog-content>
        @if (!imageLoaded()) {
            <mat-spinner diameter="40" />
        }
        <image-cropper
            [imageFile]="data.imageFile"
            [maintainAspectRatio]="true"
            [aspectRatio]="data.aspectRatio ?? 1"
            [roundCropper]="data.roundCropper ?? true"
            [resizeToWidth]="data.aspectRatio && data.aspectRatio > 1 ? 1200 : 512"
            [resizeToHeight]="data.aspectRatio && data.aspectRatio > 1 ? Math.round(1200 / data.aspectRatio) : 512"
            [format]="data.format ?? 'png'"
            [style.display]="imageLoaded() ? 'block' : 'none'"
            (imageLoaded)="onImageLoaded()"
            (imageCropped)="onCropped($event)"
            (loadImageFailed)="onLoadFailed()"
        />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
        <button mat-stroked-button mat-dialog-close>Cancel</button>
        <button mat-flat-button [disabled]="!croppedBlob" (click)="confirm()">
            <mat-icon>check</mat-icon> Apply
        </button>
    </mat-dialog-actions>
    `,
    styles: [`
        mat-dialog-content {
            min-width: 350px;
            min-height: 350px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        image-cropper { max-height: 60vh; }
    `],
})
export class ImageCropperDialogComponent {
    readonly data = inject<CropperDialogData>(MAT_DIALOG_DATA);
    private dialogRef = inject(MatDialogRef<ImageCropperDialogComponent>);
    readonly Math = Math;

    croppedBlob: Blob | null = null;
    readonly imageLoaded = signal(false);

    onImageLoaded(): void {
        this.imageLoaded.set(true);
    }

    onCropped(event: ImageCroppedEvent): void {
        this.croppedBlob = event.blob ?? null;
    }

    onLoadFailed(): void {
        this.dialogRef.close();
    }

    confirm(): void {
        if (!this.croppedBlob) return;
        const file = new File([this.croppedBlob], this.data.imageFile.name, {
            type: this.croppedBlob.type,
        });
        this.dialogRef.close({ blob: this.croppedBlob, file } as CropperDialogResult);
    }
}
