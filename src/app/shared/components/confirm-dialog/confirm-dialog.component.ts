import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
    title: string;
    message: string;
    bullets?: string[];
    confirmText?: string;
    cancelText?: string;
    warn?: boolean;
}

@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule],
    template: `
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>
            <p>{{ data.message }}</p>
            @if (data.bullets?.length) {
            <ul class="confirm-bullets">
                @for (b of data.bullets; track $index) {
                <li>{{ b }}</li>
                }
            </ul>
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button [mat-dialog-close]="false">{{ data.cancelText || 'Cancel' }}</button>
            <button mat-flat-button [color]="data.warn ? 'warn' : 'primary'" [mat-dialog-close]="true">
                {{ data.confirmText || 'Confirm' }}
            </button>
        </mat-dialog-actions>
    `,
    styles: `
        .confirm-bullets {
            margin: 0.5rem 0 0;
            padding-left: 1.25rem;

            li {
                margin-bottom: 0.35rem;
            }

            li:last-child {
                margin-bottom: 0;
            }
        }
    `,
})
export class ConfirmDialogComponent {
    data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
