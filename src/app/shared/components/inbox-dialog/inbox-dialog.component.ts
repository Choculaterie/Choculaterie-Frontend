import { Component, inject, computed } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { RealtimeService, type InboxItem } from '../../../core/services/realtime.service';
import { AdminService } from '../../../api/admin';
import { NotificationsService } from '../../../api/notifications';
import { ThemeService } from '../../../core/services/theme.service';
import { TicketReplyViewDialogComponent } from '../ticket-reply-view-dialog/ticket-reply-view-dialog.component';

@Component({
    selector: 'app-inbox-dialog',
    standalone: true,
    imports: [TPipe, 
        MatDialogModule,
        MatButtonModule,
        MatTooltipModule,
        MatDividerModule,
    ],
    template: `
<div mat-dialog-title class="inbox-dlg-title">
    <div class="title-left">
        <span>{{ 'Inbox' | t }}</span>
    </div>
    <div class="title-right">
        @if (hasAnyUnread()) {
        <button mat-icon-button (click)="markAllRead()" [matTooltip]="'Mark all read' | t" class="check-icon-btn check-gray" [style.filter]="theme.isDark() ? 'none' : 'invert(1)'">
            <img src="/icons/ui/check.svg" alt="Mark all read">
        </button>
        } @else if (items().length > 0) {
        <button mat-icon-button (click)="markAllUnread()" [matTooltip]="'Mark all unread' | t" class="check-icon-btn" [style.filter]="theme.isDark() ? 'none' : 'invert(1)'">
            <img src="/icons/ui/check.svg" alt="Mark all unread">
        </button>
        }
        <button mat-icon-button mat-dialog-close>
            <img src="/icons/letters/X.svg" alt="Close">
        </button>
    </div>
</div>

<mat-dialog-content class="inbox-dlg-content">
    @if (items().length === 0) {
    <div class="inbox-empty">
        <img src="/icons/communication/mail.svg" alt="No notifications" class="empty-icon">
        <p>{{ 'No notifications' | t }}</p>
    </div>
    } @else {
    @for (n of items(); track trackItem(n)) {
    <div class="inbox-item" [class.inbox-unread]="!n.isRead" (click)="openNotification(n)">
        <img src="/icons/ui/info.svg" alt="" class="inbox-type-icon" style="width: 24px; height: 24px; left: -3px;">
        <div class="inbox-text">
            <span class="inbox-msg">{{ n.message }}</span>
            <span class="inbox-time">{{ formatTime(n.createdAt) }}</span>
        </div>
        <button mat-icon-button class="inbox-action-btn check-icon-btn" [class.check-gray]="!n.isRead"
            (click)="toggleRead(n, $event)" [matTooltip]="n.isRead ? 'Mark unread' : 'Mark read'" [style.filter]="theme.isDark() ? 'none' : 'invert(1)'">
            <img src="/icons/ui/check.svg" alt="">
        </button>
        <button mat-icon-button class="inbox-action-btn inbox-delete-btn" (click)="deleteNotification(n, $event)"
            [matTooltip]="'Delete' | t">
            <img src="/icons/fantasy/skull.svg" alt="Delete" style="width: 18px; height: 18px;">
        </button>
    </div>
    }
    }
</mat-dialog-content>
    `,
    styles: [`
        .inbox-dlg-title {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
        }
        .title-left {
            display: flex; align-items: center; gap: 8px;
            justify-content: center;
            grid-column: 2;
        }
        .title-right {
            display: flex; align-items: center; gap: 2px;
            justify-content: flex-end;
            grid-column: 3;
            margin-right: -8px;
        }
        .inbox-dlg-content {
            height: 480px;
            display: flex; flex-direction: column;
        }
        .inbox-empty {
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;
            padding: 1rem; opacity: 0.5;
            mat-icon { font-size: 40px; width: 40px; height: 40px; }
            .empty-icon { width: 40px; height: 40px; }
        }
        .inbox-item {
            display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
            padding: 0.65rem 1rem; cursor: pointer; transition: background 0.15s;
            border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0,0,0,.08));
            &:hover { background: var(--mat-sys-surface-variant); }
        }
        .inbox-unread { background: color-mix(in srgb, var(--mat-sys-primary) 6%, transparent); font-weight: 600; }
        .inbox-type-icon { flex-shrink: 0; opacity: 0.7; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
        .inbox-text { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }
        .inbox-msg { font-size: 0.88rem; white-space: normal; word-break: break-word; }
        .inbox-time { font-size: 0.72rem; opacity: 0.5; }
        .inbox-action-btn {
            flex-shrink: 0;
            --mdc-icon-button-state-layer-size: 32px;
            --mdc-icon-button-icon-size: 18px;
            width: 32px; height: 32px; opacity: 0.5;
            display: inline-flex; align-items: center; justify-content: center;
            .mat-icon { font-size: 18px; width: 18px; height: 18px; }
            &:hover { opacity: 1; }
        }
        .inbox-delete-btn:hover { color: var(--mat-sys-error); }
    `],
})
export class InboxDialogComponent {
    readonly realtime = inject(RealtimeService);
    readonly theme = inject(ThemeService);
    private adminApi = inject(AdminService);
    private notificationsApi = inject(NotificationsService);
    private router = inject(Router);
    private dialogRef = inject(MatDialogRef<InboxDialogComponent>);
    private dialog = inject(MatDialog);

    readonly items = computed(() => this.realtime.inboxItems());

    readonly hasAnyUnread = computed(() =>
        this.items().some(n => !n.isRead)
    );

    trackItem(n: InboxItem): string {
        return `${n.source}-${n.id}`;
    }

    /** Map admin notification type to admin tab index */
    private notifTab(type: string): number {
        switch (type) {
            case 'tag_suggestion': return 5;
            case 'schematic_deleted': return 1;
            case 'contact_ticket': return 8;
            case 'server_error': return 9;
            default: return 0;
        }
    }

    private parseData(data: string | null | undefined): Record<string, unknown> {
        if (!data) return {};
        try { return JSON.parse(data) as Record<string, unknown>; }
        catch { return {}; }
    }

    openNotification(n: InboxItem): void {
        if (n.source === 'admin') {
            if (!n.isRead && n.type !== 'schematic_deleted' && n.type !== 'server_error') {
                this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationRead(n.id),
                });
            }
            this.dialogRef.close();
            const tab = this.notifTab(n.type);
            const data = this.parseData(n.data);
            const ticketId = n.type === 'contact_ticket'
                ? (data['ticketId'] ?? data['TicketId'] ?? null)
                : null;
            this.router.navigate(['/admin'], {
                queryParams: {
                    tab,
                    ...(ticketId != null ? { ticketId } : {}),
                },
            });
            return;
        }

        // User notification
        if (!n.isRead) {
            this.notificationsApi.postApiNotificationsIdRead(n.id as number).subscribe({
                next: () => this.realtime.markUserNotificationRead(n.id),
            });
        }

        const data = this.parseData(n.data);

        if (n.type === 'starred_user_schematic') {
            const schematicId = data['schematicId'] ?? data['SchematicId'];
            this.dialogRef.close();
            if (schematicId != null) {
                this.router.navigate(['/schematics', String(schematicId)]);
            }
            return;
        }

        if (n.type === 'ticket_reply') {
            this.dialogRef.close();
            this.dialog.open(TicketReplyViewDialogComponent, {
                width: '480px',
                maxWidth: '95vw',
                data: {
                    title: String(data['title'] ?? data['Title'] ?? 'Ticket reply'),
                    reply: String(data['reply'] ?? data['Reply'] ?? n.message),
                },
            });
            return;
        }

        this.dialogRef.close();
    }

    toggleRead(n: InboxItem, event: Event): void {
        event.stopPropagation();
        if (n.source === 'admin') {
            if (n.isRead) {
                this.adminApi.postApiAdminNotificationsIdUnread(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationUnread(n.id),
                });
            } else {
                this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationRead(n.id),
                });
            }
            return;
        }

        if (n.isRead) {
            this.notificationsApi.postApiNotificationsIdUnread(n.id as number).subscribe({
                next: () => this.realtime.markUserNotificationUnread(n.id),
            });
        } else {
            this.notificationsApi.postApiNotificationsIdRead(n.id as number).subscribe({
                next: () => this.realtime.markUserNotificationRead(n.id),
            });
        }
    }

    markAllRead(): void {
        for (const n of this.items().filter(i => !i.isRead)) {
            if (n.source === 'admin') {
                this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationRead(n.id),
                });
            } else {
                this.notificationsApi.postApiNotificationsIdRead(n.id as number).subscribe({
                    next: () => this.realtime.markUserNotificationRead(n.id),
                });
            }
        }
    }

    markAllUnread(): void {
        for (const n of this.items().filter(i => i.isRead)) {
            if (n.source === 'admin') {
                this.adminApi.postApiAdminNotificationsIdUnread(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationUnread(n.id),
                });
            } else {
                this.notificationsApi.postApiNotificationsIdUnread(n.id as number).subscribe({
                    next: () => this.realtime.markUserNotificationUnread(n.id),
                });
            }
        }
    }

    deleteNotification(n: InboxItem, event: Event): void {
        event.stopPropagation();
        if (n.source === 'admin') {
            this.adminApi.deleteApiAdminNotificationsId(n.id as number).subscribe({
                next: () => this.realtime.removeAdminNotification(n.id),
            });
        } else {
            this.notificationsApi.deleteApiNotificationsId(n.id as number).subscribe({
                next: () => this.realtime.removeUserNotification(n.id),
            });
        }
    }

    formatTime(iso: string): string {
        try {
            const d = new Date(iso);
            const now = new Date();
            const diff = now.getTime() - d.getTime();
            if (diff < 60_000) return 'just now';
            if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
            if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch { return ''; }
    }
}
