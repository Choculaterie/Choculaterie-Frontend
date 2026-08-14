import { Component, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface TicketReplyViewData {
    title: string;
    reply: string;
}

@Component({
    selector: 'app-ticket-reply-view-dialog',
    standalone: true,
    imports: [TPipe, MatDialogModule, MatButtonModule],
    template: `
<div mat-dialog-title class="title-row">
    <span>{{ 'Ticket reply' | t }}</span>
    <button mat-icon-button mat-dialog-close>
        <img src="/icons/letters/X.svg" alt="Close">
    </button>
</div>
<mat-dialog-content>
    <p class="ticket-title">{{ data.title }}</p>
    <p class="reply-body">{{ data.reply }}</p>
</mat-dialog-content>
<mat-dialog-actions align="end">
    <button mat-stroked-button mat-dialog-close>{{ 'Close' | t }}</button>
</mat-dialog-actions>
    `,
    styles: [`
        .title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        .ticket-title {
            font-weight: 600;
            margin: 0 0 0.75rem;
            opacity: 0.85;
        }
        .reply-body {
            white-space: pre-wrap;
            line-height: 1.55;
            margin: 0;
        }
    `],
})
export class TicketReplyViewDialogComponent {
    readonly data = inject<TicketReplyViewData>(MAT_DIALOG_DATA);
    private dialogRef = inject(MatDialogRef<TicketReplyViewDialogComponent>);
}
