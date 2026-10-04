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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" class="mc-icon" aria-hidden="true"><path fill="currentColor" d="M2,4h10v1h-10zM20,4h7v1h-7zM2,5h10v1h-10zM20,5h7v1h-7zM2,6h10v1h-10zM20,6h7v1h-7zM2,7h3v1h-3zM12,7h8v1h-8zM23,7h4v1h-4zM2,8h3v1h-3zM12,8h8v1h-8zM23,8h4v1h-4zM2,9h3v1h-3zM12,9h8v1h-8zM23,9h4v1h-4zM2,10h3v1h-3zM23,10h4v1h-4zM2,11h3v1h-3zM23,11h4v1h-4zM2,12h3v1h-3zM23,12h4v1h-4zM2,13h3v1h-3zM23,13h4v1h-4zM2,14h3v1h-3zM23,14h4v1h-4zM2,15h3v1h-3zM23,15h4v1h-4zM2,16h10v1h-10zM20,16h7v1h-7zM2,17h10v1h-10zM20,17h7v1h-7zM2,18h10v1h-10zM20,18h7v1h-7zM2,19h3v1h-3zM12,19h8v1h-8zM2,20h3v1h-3zM12,20h8v1h-8zM2,21h3v1h-3zM12,21h8v1h-8zM2,22h3v1h-3zM2,23h3v1h-3zM2,24h3v1h-3zM2,25h3v1h-3zM2,26h3v1h-3zM2,27h3v1h-3z" /><path fill="var(--mc-icon-shadow)" d="M5,7h7v1h-7zM27,7h3v1h-3zM5,8h7v1h-7zM27,8h3v1h-3zM5,9h7v1h-7zM27,9h3v1h-3zM5,10h4v1h-4zM16,10h7v1h-7zM27,10h3v1h-3zM5,11h4v1h-4zM16,11h7v1h-7zM27,11h3v1h-3zM5,12h4v1h-4zM16,12h7v1h-7zM27,12h3v1h-3zM5,13h4v1h-4zM27,13h3v1h-3zM5,14h4v1h-4zM27,14h3v1h-3zM5,15h4v1h-4zM27,15h3v1h-3zM27,16h3v1h-3zM27,17h3v1h-3zM27,18h3v1h-3zM5,19h7v1h-7zM23,19h7v1h-7zM5,20h7v1h-7zM23,20h7v1h-7zM5,21h7v1h-7zM23,21h7v1h-7zM5,22h4v1h-4zM16,22h7v1h-7zM5,23h4v1h-4zM16,23h7v1h-7zM5,24h4v1h-4zM16,24h7v1h-7zM5,25h4v1h-4zM5,26h4v1h-4zM5,27h4v1h-4zM5,28h4v1h-4zM5,29h4v1h-4zM5,30h4v1h-4z" /></svg> <span>{{ 'Report' | t }}</span> {{ data.type === 'schematic' ? schematicLabel : userLabel }}
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
