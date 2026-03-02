import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ReportDialogData {
    type: 'schematic' | 'user';
    targetId: string;
    targetName: string;
}

export interface ReportDialogResult {
    confirmed: true;
}

@Component({
    selector: 'app-report-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule],
    template: `
        <h2 mat-dialog-title>
            <mat-icon>flag</mat-icon> Report {{ data.type === 'schematic' ? 'Schematic' : 'User' }}
        </h2>
        <mat-dialog-content>
            <p>Are you sure you want to report <strong>{{ data.targetName }}</strong>?</p>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button mat-dialog-close>Cancel</button>
            <button mat-flat-button color="warn" (click)="submit()">Report</button>
        </mat-dialog-actions>
    `,
    styles: [`
        h2 { display: flex; align-items: center; gap: 0.5rem; }
    `],
})
export class ReportDialogComponent {
    private dialogRef = inject(MatDialogRef<ReportDialogComponent>);
    data = inject<ReportDialogData>(MAT_DIALOG_DATA);

    submit(): void {
        this.dialogRef.close({ confirmed: true } as ReportDialogResult);
    }
}
