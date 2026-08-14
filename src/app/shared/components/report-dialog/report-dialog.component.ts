import { Component, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
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
    imports: [TPipe, MatDialogModule, MatButtonModule, MatIconModule],
    template: `
        <h2 mat-dialog-title>
            <mat-icon>flag</mat-icon> <span>{{ 'Report' | t }}</span> {{ data.type === 'schematic' ? schematicLabel : userLabel }}
        </h2>
        <mat-dialog-content>
            <p>{{ 'Are you sure you want to report' | t }} <strong>{{ data.targetName }}</strong>?</p>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button mat-dialog-close>{{ 'Cancel' | t }}</button>
            <button mat-flat-button color="warn" (click)="submit()">{{ 'Report' | t }}</button>
        </mat-dialog-actions>
    `,
    styles: [`
        h2 { display: flex; align-items: center; gap: 0.5rem; }
    `],
})
export class ReportDialogComponent {
    private dialogRef = inject(MatDialogRef<ReportDialogComponent>);
    data = inject<ReportDialogData>(MAT_DIALOG_DATA);

    readonly schematicLabel = $localize`Schematic`;
    readonly userLabel = $localize`User`;

    submit(): void {
        this.dialogRef.close({ confirmed: true } as ReportDialogResult);
    }
}
