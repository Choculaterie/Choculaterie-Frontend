import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MAT_DIALOG_DATA, MatDialogRef, MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AdminService } from '../../api/admin';
import { ToastService } from '../../core/services/toast.service';
import { TicketImgPipe, UserImgPipe } from '../../shared/pipes/image-url.pipe';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import type { ContactTicketResponse } from '../../api/generated.schemas';
import { MatDialog } from '@angular/material/dialog';
import { AdminUserDialogComponent } from './admin-user-dialog.component';

export interface AdminTicketDialogData {
    ticket: ContactTicketResponse;
}

export interface AdminTicketDialogResult {
    deleted?: boolean;
    updated?: ContactTicketResponse;
}

@Component({
    selector: 'app-admin-ticket-dialog',
    standalone: true,
    imports: [
        DatePipe,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatFormFieldModule,
        MatInputModule,
        TicketImgPipe,
        UserImgPipe,
    ],
    template: `
<div mat-dialog-title class="ticket-dlg-title">
    <span>{{ ticket().title }}</span>
    <button mat-icon-button mat-dialog-close class="close-btn">
        <img src="/icons/letters/X.svg" alt="" aria-hidden="true" class="mc-icon" />
    </button>
</div>

<mat-dialog-content class="ticket-dlg-content">
    <div class="ticket-meta">
        @if (ticket().username) {
        <a class="meta-chip meta-link" (click)="openUserDetail()">
            @if (ticket().userFilePath) {
            <img [src]="ticket().userFilePath | userImg" alt="" class="chip-avatar" />
            } @else {
            <img src="/icons/ui/smile_circle.svg" alt="" aria-hidden="true" class="mc-icon" />
            }
            {{ ticket().username }}
        </a>
        } @else {
        <span class="meta-chip muted"><img src="/icons/ui/smile.svg" alt="" aria-hidden="true" class="mc-icon" /> Anonymous</span>
        }
        <span class="meta-chip"><img src="/icons/misc/clock.svg" alt="" aria-hidden="true" class="mc-icon" /> {{ ticket().createdAt | date:'medium' }}</span>
        @if (!ticket().isRead) {
        <span class="meta-chip unread-chip"><mat-icon>mark_email_unread</mat-icon> Unread</span>
        }
        @if (ticket().adminReply) {
        <span class="meta-chip meta-chip-text muted" i18n>Replied</span>
        }
    </div>

    <div class="msg-block">
        <div class="msg-header">
            <span i18n>Ticket</span>
            @if (ticket().username) {
            <span class="msg-meta">{{ ticket().username }}</span>
            } @else {
            <span class="msg-meta" i18n>Anonymous</span>
            }
            <span class="msg-meta">{{ ticket().createdAt | date:'medium' }}</span>
        </div>
        <p class="msg-body">{{ ticket().description }}</p>
        @if (ticket().contact) {
        <div class="ticket-contact">
            <img src="/icons/arrows/tild_full_right.svg" alt="" aria-hidden="true" class="mc-icon" />
            <span>{{ ticket().contact }}</span>
        </div>
        }
        @if (ticket().imagePaths.length) {
        <div class="ticket-images">
            @for (path of ticket().imagePaths; track path) {
            <a [href]="path | ticketImg" target="_blank" rel="noopener">
                <img [src]="path | ticketImg" class="ticket-thumb" alt="attachment" />
            </a>
            }
        </div>
        }
    </div>

    @if (ticket().adminReply) {
    <div class="msg-block">
        <div class="msg-header">
            <span i18n>Your reply</span>
            @if (ticket().adminRepliedBy) {
            <span class="msg-meta">{{ ticket().adminRepliedBy }}</span>
            }
            @if (ticket().adminRepliedAt) {
            <span class="msg-meta">{{ ticket().adminRepliedAt | date:'medium' }}</span>
            }
        </div>
        <p class="msg-body">{{ ticket().adminReply }}</p>
    </div>
    }

    <div class="reply-form">
        <h4 class="reply-heading" i18n>Send reply</h4>
        @if (!ticket().userId) {
        <p class="reply-hint muted" i18n>Anonymous ticket. Reply is saved but the submitter has no inbox.</p>
        } @else {
        <p class="reply-hint" i18n>The user will get this in their inbox.</p>
        }
        <mat-form-field appearance="outline" class="full-width">
            <mat-label i18n>Reply</mat-label>
            <textarea matInput rows="4" maxlength="2000" [(ngModel)]="replyText" [disabled]="sending()"></textarea>
        </mat-form-field>
        <div class="form-actions">
            <button mat-flat-button type="button" (click)="sendReply()"
                [disabled]="sending() || !replyText.trim()">
                <img [src]="sending() || !replyText.trim()
                    ? '/icons/fantasy/potion_throw_disabled.svg'
                    : '/icons/fantasy/potion_throw.svg'" alt="" aria-hidden="true" matButtonIcon class="mc-icon" />
                @if (sending()) { <span i18n>Sending...</span> }
                @else if (ticket().adminReply) { <span i18n>Update reply</span> }
                @else { <span i18n>Send reply</span> }
            </button>
        </div>
    </div>
</mat-dialog-content>

<mat-dialog-actions align="end">
    <button mat-stroked-button color="warn" (click)="deleteTicket()">Delete</button>
    <button mat-stroked-button mat-dialog-close>Close</button>
</mat-dialog-actions>
    `,
    styles: [`
        .ticket-dlg-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 1.1rem;
            font-weight: 600;
            gap: 1rem;
        }
        .close-btn { margin-right: -8px; }
        .ticket-dlg-content {
            min-width: min(90vw, 560px);
            padding-top: 8px;
        }
        .ticket-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .meta-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 10px 2px 6px;
            border-radius: 999px;
            background: var(--mat-sys-surface-container);
            font-size: 0.82rem;
            mat-icon { font-size: 15px; width: 15px; height: 15px; }
        }
        .chip-avatar {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
        }
        .unread-chip {
            background: color-mix(in srgb, var(--mat-sys-error) 15%, transparent);
            color: var(--mat-sys-error);
        }
        .muted { opacity: 0.6; }
        .meta-chip-text { padding-left: 10px; }
        .meta-link {
            cursor: pointer;
            text-decoration: none;
            transition: background 0.15s;
            &:hover { background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent); }
        }
        .msg-block {
            background: color-mix(in srgb, var(--mat-sys-primary) 6%, transparent);
            border-radius: 8px;
            padding: 0.75rem 1rem;
            margin-bottom: 0.75rem;
        }
        .msg-header {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            align-items: baseline;
            font-weight: 600;
            margin-bottom: 0.4rem;
            font-size: 0.9rem;
        }
        .msg-meta {
            font-weight: 400;
            font-size: 0.78rem;
            opacity: 0.6;
        }
        .msg-body {
            white-space: pre-wrap;
            line-height: 1.55;
            margin: 0;
        }
        .ticket-contact {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.9rem;
            opacity: 0.8;
            margin-top: 0.65rem;
        }
        .ticket-images {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 0.65rem;
        }
        .ticket-thumb {
            width: 110px;
            height: 110px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid var(--mat-sys-outline-variant);
            cursor: zoom-in;
            transition: opacity 0.15s;
            &:hover { opacity: 0.85; }
        }
        .reply-form {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            margin-top: 0.25rem;
        }
        .reply-heading {
            margin: 0;
            font-size: 0.95rem;
        }
        .reply-hint {
            margin: 0 0 0.25rem;
            font-size: 0.82rem;
            opacity: 0.7;
        }
        .reply-form .full-width {
            width: 100%;
            margin-bottom: -0.75rem;
        }
        .form-actions {
            display: flex;
            justify-content: flex-end;
        }
        .full-width { width: 100%; }
    `],
})
export class AdminTicketDialogComponent {
    private adminApi = inject(AdminService);
    private toast = inject(ToastService);
    private confirmDialog = inject(MatDialog);
    private dialogRef = inject(MatDialogRef<AdminTicketDialogComponent>);
    private raw = inject<AdminTicketDialogData>(MAT_DIALOG_DATA);

    readonly ticket = signal<ContactTicketResponse>(this.raw.ticket);
    readonly sending = signal(false);
    replyText = this.raw.ticket.adminReply ?? '';

    sendReply(): void {
        const text = this.replyText.trim();
        if (!text || this.sending()) return;

        this.sending.set(true);
        this.adminApi.postApiAdminTicketsIdReply(this.ticket().id as number, { reply: text }).subscribe({
            next: (updated) => {
                this.ticket.set(updated);
                this.replyText = updated.adminReply ?? text;
                this.sending.set(false);
                this.toast.success(updated.userId
                    ? 'Reply sent. User notified in their inbox.'
                    : 'Reply saved. Anonymous ticket has no inbox.');
                this.dialogRef.close({ updated } as AdminTicketDialogResult);
            },
            error: (err) => {
                this.sending.set(false);
                this.toast.error(err.error?.message ?? err.error?.detail ?? 'Failed to send reply.');
            },
        });
    }

    deleteTicket(): void {
        const ref = this.confirmDialog.open(ConfirmDialogComponent, {
            data: {
                title: 'Delete Ticket',
                message: `Delete ticket "${this.ticket().title}"? This will also remove attached images.`,
                confirmText: 'Delete',
                warn: true,
            } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminTicketsId(this.ticket().id as number).subscribe({
                    next: () => {
                        this.toast.success('Ticket deleted.');
                        this.dialogRef.close({ deleted: true } as AdminTicketDialogResult);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? 'Failed to delete ticket.'),
                });
            }
        });
    }

    openUserDetail(): void {
        const t = this.ticket();
        if (!t.userId) return;
        this.adminApi.getApiAdminUsersId(t.userId as string).subscribe({
            next: (u) => {
                this.confirmDialog.open(AdminUserDialogComponent, {
                    data: u,
                    width: '900px',
                    maxWidth: '95vw',
                    maxHeight: '90vh',
                });
            },
            error: () => this.toast.error('Failed to load user details.'),
        });
    }
}
