import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
    MAT_DIALOG_DATA, MatDialogRef, MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { AdminService } from '../../api/admin';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { TicketImgPipe } from '../../shared/pipes/image-url.pipe';
import type { ContactTicketResponse } from '../../api/generated.schemas';
import { MatDialog } from '@angular/material/dialog';
import { AdminUserDialogComponent } from './admin-user-dialog.component';

export interface AdminTicketDialogData {
    ticket: ContactTicketResponse;
}

export interface AdminTicketDialogResult {
    deleted?: boolean;
}

@Component({
    selector: 'app-admin-ticket-dialog',
    standalone: true,
    imports: [
        DatePipe,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        TicketImgPipe,
    ],
    template: `
<div mat-dialog-title class="ticket-dlg-title">
    <span>{{ ticket().title }}</span>
    <button mat-icon-button mat-dialog-close class="close-btn">
        <mat-icon>close</mat-icon>
    </button>
</div>

<mat-dialog-content class="ticket-dlg-content">
    <div class="ticket-meta">
        @if (ticket().username) {
        <a class="meta-chip meta-link" (click)="openUserDetail()"><mat-icon>person</mat-icon> {{ ticket().username }}</a>
        } @else {
        <span class="meta-chip muted"><mat-icon>person_off</mat-icon> Anonymous</span>
        }
        <span class="meta-chip"><mat-icon>schedule</mat-icon> {{ ticket().createdAt | date:'medium' }}</span>
        @if (!ticket().isRead) {
        <span class="meta-chip unread-chip"><mat-icon>mark_email_unread</mat-icon> Unread</span>
        }
    </div>

    <p class="ticket-body">{{ ticket().description }}</p>

    @if (ticket().contact) {
    <div class="ticket-contact">
        <mat-icon>contact_mail</mat-icon>
        <span>{{ ticket().contact }}</span>
    </div>
    }

    @if (ticket().imagePaths.length) {
    <mat-divider class="img-divider" />
    <div class="ticket-images">
        @for (img of ticket().imagePaths; track img) {
        <a [href]="img | ticketImg" target="_blank" rel="noopener">
            <img [src]="img | ticketImg" class="ticket-thumb" alt="attachment" />
        </a>
        }
    </div>
    }
</mat-dialog-content>

<mat-dialog-actions align="end">
    <button mat-stroked-button color="warn" (click)="deleteTicket()">
        <mat-icon>delete</mat-icon> Delete
    </button>
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
        .unread-chip {
            background: color-mix(in srgb, var(--mat-sys-error) 15%, transparent);
            color: var(--mat-sys-error);
        }
        .muted { opacity: 0.6; }
        .meta-link {
            cursor: pointer;
            text-decoration: none;
            transition: background 0.15s;
            &:hover { background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent); }
        }
        .ticket-body {
            white-space: pre-wrap;
            line-height: 1.6;
            margin: 0 0 1rem;
        }
        .ticket-contact {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.9rem;
            opacity: 0.8;
            margin-bottom: 0.5rem;
            mat-icon { font-size: 18px; width: 18px; height: 18px; }
        }
        .img-divider { margin: 0.75rem 0; }
        .ticket-images {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
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
    `],
})
export class AdminTicketDialogComponent {
    private adminApi = inject(AdminService);
    private toast = inject(ToastService);
    private confirmDialog = inject(MatDialog);
    private dialogRef = inject(MatDialogRef<AdminTicketDialogComponent>);
    private raw = inject<AdminTicketDialogData>(MAT_DIALOG_DATA);

    readonly ticket = signal<ContactTicketResponse>(this.raw.ticket);

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
