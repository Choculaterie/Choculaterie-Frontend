import { Component, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';

export interface DownloadPickerData {
    title: string;
    files: { id: number | string; name: string }[];
    showZip?: boolean;
}

@Component({
    selector: 'app-download-picker',
    standalone: true,
    imports: [TPipe, MatDialogModule, MatButtonModule, MatIconModule, MatListModule, MatDividerModule],
    template: `
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>
            <mat-nav-list>
                @for (file of data.files; track file.id; let i = $index) {
                <a mat-list-item [mat-dialog-close]="{ type: 'single', index: i }">
                    <img src="/icons/weapons/pickaxe.svg" alt="" aria-hidden="true" matListItemIcon class="mc-icon" />
                    <span matListItemTitle>{{ file.name }}</span>
                </a>
                }
                @if (data.showZip !== false) {
                <mat-divider />
                <a mat-list-item [mat-dialog-close]="{ type: 'zip' }">
                    <img src="/icons/arrows/tild_full_right.svg" alt="" aria-hidden="true" matListItemIcon class="mc-icon" />
                    <span matListItemTitle>{{ 'Download all as .zip' | t }}</span>
                </a>
                }
            </mat-nav-list>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button [mat-dialog-close]="null">{{ 'Cancel' | t }}</button>
        </mat-dialog-actions>
    `,
    styles: [`
        mat-dialog-content { padding: 0 !important; }
        mat-nav-list { padding-top: 0; }
    `],
})
export class DownloadPickerComponent {
    data = inject<DownloadPickerData>(MAT_DIALOG_DATA);
}
