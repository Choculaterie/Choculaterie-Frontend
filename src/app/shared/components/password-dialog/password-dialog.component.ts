import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';

export interface PasswordDialogData {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

@Component({
    selector: 'app-password-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressSpinnerModule, FormsModule],
    template: `
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>
            <p>{{ data.message }}</p>
            <mat-form-field appearance="outline" style="width: 100%; margin-top: 0.5rem;">
                <mat-label>Password</mat-label>
                <input matInput type="password" [(ngModel)]="password" (keyup.enter)="submit()"
                    [disabled]="loading()" />
                <mat-icon matPrefix>lock</mat-icon>
            </mat-form-field>
            @if (error()) {
            <p style="color: var(--mat-sys-error); font-size: 0.85rem; margin-top: -0.5rem;">{{ error() }}</p>
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button [mat-dialog-close]="null" [disabled]="loading()">
                {{ data.cancelText || 'Cancel' }}
            </button>
            <button mat-flat-button (click)="submit()" [disabled]="!password || loading()">
                @if (loading()) { <mat-spinner diameter="18" /> } @else { {{ data.confirmText || 'Confirm' }} }
            </button>
        </mat-dialog-actions>
    `,
})
export class PasswordDialogComponent {
    data = inject<PasswordDialogData>(MAT_DIALOG_DATA);
    private dialogRef = inject(MatDialogRef<PasswordDialogComponent>);

    password = '';
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    submit(): void {
        if (!this.password) return;
        this.dialogRef.close(this.password);
    }
}
