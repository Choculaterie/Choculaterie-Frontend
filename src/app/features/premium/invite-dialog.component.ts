import { Component, inject } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/services/toast.service';
import type { ReferralInfo } from '../../api/billing';

@Component({
    selector: 'app-invite-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, TPipe],
    template: `
<div mat-dialog-title class="dlg-title">
    <span>{{ 'Invite friends' | t }}</span>
    <button mat-icon-button mat-dialog-close class="close-btn"><mat-icon svgIcon="mc:letters/X"></mat-icon></button>
</div>
<mat-dialog-content class="dlg-content">
    <p class="intro">{{ 'Share your code. When a friend uses it on their first Premium purchase, you get 1 free month of Premium.' | t }}</p>

    <span class="label">{{ 'Your code' | t }}</span>
    <div class="copy-row">
        <span class="value">{{ data.code }}</span>
        <button mat-icon-button [matTooltip]="'Copy' | t" (click)="copy(data.code)"><mat-icon svgIcon="mc:ui/overlapping_sheets"></mat-icon></button>
    </div>

    <span class="label">{{ 'Your link' | t }}</span>
    <div class="copy-row">
        <span class="value link">{{ data.link }}</span>
        <button mat-icon-button [matTooltip]="'Copy' | t" (click)="copy(data.link)"><mat-icon svgIcon="mc:ui/overlapping_sheets"></mat-icon></button>
    </div>

    <p class="uses">{{ 'Uses this year' | t }}: <strong>{{ data.rewardsThisYear }} / {{ data.rewardsPerYear }}</strong></p>
</mat-dialog-content>
`,
    styles: [`
        .dlg-title { display: flex; align-items: center; justify-content: space-between; }
        .close-btn { margin-right: -8px; }
        .dlg-content { display: flex; flex-direction: column; min-width: min(460px, 80vw); }
        .intro { margin: 0 0 1rem; opacity: 0.75; font-size: 0.88rem; line-height: 1.5; }
        .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.6; margin-bottom: 0.3rem; }
        .copy-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.15rem 0.25rem 0.15rem 0.75rem;
            border-radius: 10px; background: var(--mat-sys-surface-container-high); margin-bottom: 1rem; }
        .value { font-size: 0.95rem; overflow-wrap: anywhere; }
        .value.link { font-size: 0.85rem; }
        .uses { margin: 0.25rem 0 0; font-size: 0.9rem; }
        .uses strong { color: var(--mat-sys-primary); font-weight: normal; }
    `],
})
export class InviteDialogComponent {
    readonly data = inject<ReferralInfo>(MAT_DIALOG_DATA);
    private toast = inject(ToastService);

    async copy(value: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(value);
            this.toast.success('Copied');
        } catch {
            this.toast.error('Could not copy to the clipboard.');
        }
    }
}
