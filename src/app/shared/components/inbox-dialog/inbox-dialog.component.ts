import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { RealtimeService } from '../../../core/services/realtime.service';
import { AdminService } from '../../../api/admin';
import type { AdminNotificationResponse } from '../../../api/generated.schemas';

@Component({
    selector: 'app-inbox-dialog',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatDividerModule,
    ],
    template: `
<div mat-dialog-title class="inbox-dlg-title">
    <div class="title-left">
        <mat-icon class="title-icon">inbox</mat-icon>
        <span i18n>Admin Inbox</span>
    </div>
    <div class="title-right">
        @if (hasAnyUnread()) {
        <button mat-icon-button (click)="markAllRead()" matTooltip="Mark all read" i18n-matTooltip>
            <mat-icon>done_all</mat-icon>
        </button>
        } @else {
        <button mat-icon-button (click)="markAllUnread()" matTooltip="Mark all unread" i18n-matTooltip>
            <mat-icon>markunread</mat-icon>
        </button>
        }
        <button mat-icon-button mat-dialog-close>
            <mat-icon>close</mat-icon>
        </button>
    </div>
</div>

<mat-dialog-content class="inbox-dlg-content">
    @if (realtime.adminNotifications().length === 0) {
    <div class="inbox-empty">
        <mat-icon>notifications_none</mat-icon>
        <p i18n>No notifications</p>
    </div>
    } @else {
    @for (n of realtime.adminNotifications(); track n.id) {
    <div class="inbox-item" [class.inbox-unread]="!n.isRead" (click)="openNotification(n)">
        <mat-icon class="inbox-type-icon">{{ notifIcon(n.type) }}</mat-icon>
        <div class="inbox-text">
            <span class="inbox-msg">{{ n.message }}</span>
            <span class="inbox-time">{{ formatTime(n.createdAt) }}</span>
        </div>
        <button mat-icon-button class="inbox-action-btn" (click)="toggleRead(n, $event)"
            [matTooltip]="n.isRead ? 'Mark unread' : 'Mark read'">
            <mat-icon>{{ n.isRead ? 'markunread' : 'done' }}</mat-icon>
        </button>
        <button mat-icon-button class="inbox-action-btn inbox-delete-btn" (click)="deleteNotification(n, $event)"
            matTooltip="Delete" i18n-matTooltip>
            <mat-icon>delete</mat-icon>
        </button>
    </div>
    }
    }
</mat-dialog-content>
    `,
    styles: [`
        .inbox-dlg-title {
            display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
        }
        .title-left {
            display: flex; align-items: center; gap: 8px;
        }
        .title-right {
            display: flex; align-items: center; gap: 2px;
            margin-right: -8px;
        }
        .title-icon { color: var(--mat-sys-primary); }
        .inbox-dlg-content {
            height: 480px;
            display: flex; flex-direction: column;
        }
        .inbox-empty {
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;
            padding: 1rem; opacity: 0.5;
            mat-icon { font-size: 40px; width: 40px; height: 40px; }
        }
        .inbox-item {
            display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
            padding: 0.65rem 1rem; cursor: pointer; transition: background 0.15s;
            border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0,0,0,.08));
            &:hover { background: var(--mat-sys-surface-variant); }
        }
        .inbox-unread { background: color-mix(in srgb, var(--mat-sys-primary) 6%, transparent); font-weight: 600; }
        .inbox-type-icon { flex-shrink: 0; opacity: 0.7; display: flex; align-items: center; justify-content: center; }
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
            default: return 0;
        }
    }

    openNotification(n: AdminNotificationResponse): void {
        if (!n.isRead && n.type !== 'schematic_deleted') {
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

    notifIcon(type: string): string {
        switch (type) {
            case 'tag_suggestion': return 'label';
            case 'schematic_deleted': return 'grid_view';
            case 'contact_ticket': return 'mail';
            default: return 'notifications';
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
