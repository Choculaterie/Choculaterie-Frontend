import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { RealtimeService } from '../../../core/services/realtime.service';
import { AdminService } from '../../../api/admin';
import { ThemeService } from '../../../core/services/theme.service';
import type { AdminNotificationResponse } from '../../../api/generated.schemas';

@Component({
    selector: 'app-inbox-dialog',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatTooltipModule,
        MatDividerModule,
    ],
    template: `
<div mat-dialog-title class="inbox-dlg-title">
    <div class="title-left">
        <span i18n>Admin Inbox</span>
    </div>
    <div class="title-right">
        @if (hasAnyUnread()) {
        <button mat-icon-button (click)="markAllRead()" matTooltip="Mark all read" i18n-matTooltip class="check-icon-btn check-gray" [style.filter]="theme.isDark() ? 'none' : 'invert(1)'">
            <img src="/icons/ui/check.svg" alt="Mark all read">
        </button>
        } @else {
        <button mat-icon-button (click)="markAllUnread()" matTooltip="Mark all unread" i18n-matTooltip class="check-icon-btn" [style.filter]="theme.isDark() ? 'none' : 'invert(1)'">
            <img src="/icons/ui/check.svg" alt="Mark all unread">
        </button>
        }
        <button mat-icon-button mat-dialog-close>
            <img src="/icons/letters/X.svg" alt="Close">
        </button>
    </div>
</div>

<mat-dialog-content class="inbox-dlg-content">
    @if (realtime.adminNotifications().length === 0) {
    <div class="inbox-empty">
        <img src="/icons/communication/mail.svg" alt="No notifications" class="empty-icon">
        <p i18n>No notifications</p>
    </div>
    } @else {
    @for (n of realtime.adminNotifications(); track n.id) {
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
            matTooltip="Delete" i18n-matTooltip>
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
        .check-type-icon {
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            image-rendering: pixelated;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' shape-rendering='crispEdges'%3E%3Cpath fill='white' d='M22,4h4v1h-4zM22,5h4v1h-4zM22,6h4v1h-4zM18,7h8v1h-8zM18,8h8v1h-8zM18,9h8v1h-8zM18,10h4v1h-4zM18,11h4v1h-4zM18,12h4v1h-4zM2,13h4v1h-4zM14,13h8v1h-8zM2,14h4v1h-4zM14,14h8v1h-8zM2,15h4v1h-4zM14,15h8v1h-8zM2,16h8v1h-8zM14,16h4v1h-4zM2,17h8v1h-8zM14,17h4v1h-4zM2,18h8v1h-8zM14,18h4v1h-4zM6,19h12v1h-12zM6,20h12v1h-12zM6,21h12v1h-12zM10,22h4v1h-4zM10,23h4v1h-4zM10,24h4v1h-4z'/%3E%3Cpath fill='%233e3e3e' d='M26,7h4v1h-4zM26,8h4v1h-4zM26,9h4v1h-4zM22,10h8v1h-8zM22,11h8v1h-8zM22,12h8v1h-8zM22,13h4v1h-4zM22,14h4v1h-4zM22,15h4v1h-4zM18,16h8v1h-8zM18,17h8v1h-8zM18,18h8v1h-8zM18,19h4v1h-4zM18,20h4v1h-4zM18,21h4v1h-4zM14,22h8v1h-8zM14,23h8v1h-8zM14,24h8v1h-8zM14,25h4v1h-4zM14,26h4v1h-4zM14,27h4v1h-4z'/%3E%3C/svg%3E");
            &.check-gray {
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' shape-rendering='crispEdges'%3E%3Cpath fill='white' d='M22,4h4v1h-4zM22,5h4v1h-4zM22,6h4v1h-4zM18,7h8v1h-8zM18,8h8v1h-8zM18,9h8v1h-8zM18,10h4v1h-4zM18,11h4v1h-4zM18,12h4v1h-4zM2,13h4v1h-4zM14,13h8v1h-8zM2,14h4v1h-4zM14,14h8v1h-8zM2,15h4v1h-4zM14,15h8v1h-8zM2,16h8v1h-8zM14,16h4v1h-4zM2,17h8v1h-8zM14,17h4v1h-4zM2,18h8v1h-8zM14,18h4v1h-4zM6,19h12v1h-12zM6,20h12v1h-12zM6,21h12v1h-12zM10,22h4v1h-4zM10,23h4v1h-4zM10,24h4v1h-4z'/%3E%3C/svg%3E");
                filter: contrast(0);
            }
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
        .inbox-type-icon.mc-icon { width: 24px; height: 24px; }
        .inbox-text { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }
        .inbox-msg { font-size: 0.88rem; white-space: normal; word-break: break-word; }
        .inbox-time { font-size: 0.72rem; opacity: 0.5; }
        .check-icon-btn {
            /* Filter applied by JavaScript based on theme */
        }
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
    private router = inject(Router);
    private dialogRef = inject(MatDialogRef<InboxDialogComponent>);

    readonly hasAnyUnread = computed(() =>
        this.realtime.adminNotifications().some(n => !n.isRead)
    );

    /** Map notification type to admin tab index */
    private notifTab(type: string): number {
        switch (type) {
            case 'tag_suggestion': return 5;
            case 'schematic_deleted': return 1;
            case 'contact_ticket': return 8;
            case 'server_error': return 9;
            default: return 0;
        }
    }

    openNotification(n: AdminNotificationResponse): void {
        if (!n.isRead && n.type !== 'schematic_deleted' && n.type !== 'server_error') {
            this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                next: () => this.realtime.markAdminNotificationRead(n.id),
            });
        }
        this.dialogRef.close();
        this.router.navigate(['/admin'], { queryParams: { tab: this.notifTab(n.type) } });
    }

    toggleRead(n: AdminNotificationResponse, event: Event): void {
        event.stopPropagation();
        if (n.isRead) {
            this.adminApi.postApiAdminNotificationsIdUnread(n.id as number).subscribe({
                next: () => this.realtime.markAdminNotificationUnread(n.id),
            });
        } else {
            this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                next: () => this.realtime.markAdminNotificationRead(n.id),
            });
        }
    }

    markAllRead(): void {
        this.realtime.adminNotifications()
            .filter(n => !n.isRead)
            .forEach(n => {
                this.adminApi.postApiAdminNotificationsIdRead(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationRead(n.id),
                });
            });
    }

    markAllUnread(): void {
        this.realtime.adminNotifications()
            .filter(n => n.isRead)
            .forEach(n => {
                this.adminApi.postApiAdminNotificationsIdUnread(n.id as number).subscribe({
                    next: () => this.realtime.markAdminNotificationUnread(n.id),
                });
            });
    }

    deleteNotification(n: AdminNotificationResponse, event: Event): void {
        event.stopPropagation();
        this.adminApi.deleteApiAdminNotificationsId(n.id as number).subscribe({
            next: () => this.realtime.removeAdminNotification(n.id),
        });
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
