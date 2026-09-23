import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TPipe } from '../../../core/i18n/t.pipe';
import { FileSizePipe } from '../../pipes/file-size.pipe';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import type { SaveVersionResponse } from '../../../api/generated.schemas';

export interface SaveVersionsDialogData {
    saveId: string;
    worldName: string;
}

@Component({
    selector: 'app-save-versions-dialog',
    standalone: true,
    imports: [TPipe, DatePipe, FileSizePipe, MatDialogModule, MatButtonModule, MatTooltipModule, LoadingSpinnerComponent],
    template: `
        <h2 mat-dialog-title>{{ 'Version history' | t }}</h2>
        <mat-dialog-content>
            @if (loading()) {
            <app-loading-spinner [message]="'Loading versions…' | t" />
            } @else if (error()) {
            <p class="versions-error">{{ error() }}</p>
            } @else {
            <p class="versions-intro"><strong>{{ data.worldName }}</strong></p>
            <p class="versions-intro">{{ 'Pick the backup you want to download.' | t }}</p>
            <ul class="versions-list">
                @for (v of versions(); track v.id) {
                <li class="version-row">
                    <div class="version-info">
                        <strong>{{ v.createdAt | date:'medium' }}</strong>
                        @if (v.isHead) { <span class="version-current">{{ 'Current' | t }}</span> }
                        <span class="version-meta">{{ v.fileCount }} {{ 'files' | t }} · {{ +v.totalBytes | fileSize }}</span>
                    </div>
                    <button mat-icon-button [disabled]="busyId() === v.id" (click)="download(v)"
                        [matTooltip]="'Download' | t">
                        @if (busyId() === v.id) {
                        <img src="loading.gif" alt="" class="version-loading" />
                        } @else {
                        <img src="/icons/arrows/arrow_down.svg" alt="" aria-hidden="true" class="mc-icon" />
                        }
                    </button>
                </li>
                }
            </ul>
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button [mat-dialog-close]="false">{{ 'Close' | t }}</button>
        </mat-dialog-actions>
    `,
    styles: `
        .versions-intro {
            margin: 0 0 0.35rem;
            color: var(--mat-sys-on-surface-variant);
        }

        .versions-error {
            color: var(--mat-sys-error);
        }

        .versions-list {
            list-style: none;
            margin: 0;
            padding: 0;
            min-width: 320px;
        }

        .version-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.6rem 0;
            border-bottom: 1px solid var(--mat-sys-outline-variant);
        }

        .version-row:last-child {
            border-bottom: none;
        }

        .version-info {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
        }

        .version-meta {
            font-size: 0.8125rem;
            color: var(--mat-sys-on-surface-variant);
        }

        .version-current {
            font-size: 0.75rem;
            color: var(--mat-sys-primary);
        }

        .version-loading {
            width: 18px;
            height: 18px;
            object-fit: contain;
        }
    `,
})
export class SaveVersionsDialogComponent {
    private http = inject(HttpClient);
    readonly dialogRef = inject(MatDialogRef<SaveVersionsDialogComponent>);
    readonly data = inject<SaveVersionsDialogData>(MAT_DIALOG_DATA);

    readonly versions = signal<SaveVersionResponse[]>([]);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly busyId = signal('');

    constructor() {
        this.http.get<SaveVersionResponse[]>(`/api/SaveManager/${this.data.saveId}/versions`).subscribe({
            next: (list) => { this.versions.set(list); this.loading.set(false); },
            error: () => { this.error.set('Could not load version history.'); this.loading.set(false); },
        });
    }

    download(v: SaveVersionResponse): void {
        this.busyId.set(v.id);
        this.http.get<{ url: string }>(
            `/api/SaveManager/${this.data.saveId}/versions/${v.id}/download-url`).subscribe({
            next: ({ url }) => {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.data.worldName}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                this.busyId.set('');
            },
            error: () => { this.error.set('Could not start that download.'); this.busyId.set(''); },
        });
    }
}
