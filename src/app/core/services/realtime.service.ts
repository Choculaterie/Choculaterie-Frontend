import { Injectable, inject, signal, computed } from '@angular/core';
import { interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SessionService } from './session.service';
import { AdminService } from '../../api/admin';
import type { LiveMessageResponse, AdminNotificationResponse } from '../../api/generated.schemas';

export interface SiteStats {
    downloadsCount: number;
    schematicCount: number;
    quickShareCount: number;
    userCount: number;
}

const LIVE_MESSAGES_POLL_INTERVAL = 10_000;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
    private session = inject(SessionService);
    private adminApi = inject(AdminService);

    readonly announcements = signal<LiveMessageResponse[]>([]);
    readonly stats = signal<SiteStats | null>(null);
    readonly adminNotifications = signal<AdminNotificationResponse[]>([]);
    readonly hasUnreadAdminNotifications = computed(() =>
        this.adminNotifications().some(n => !n.isRead)
    );

    addAdminNotification(n: AdminNotificationResponse): void {
        this.adminNotifications.update(list => [n, ...list]);
    }

    markAdminNotificationRead(id: number | string): void {
        this.adminNotifications.update(list => list.map(n => n.id === id ? { ...n, isRead: true } : n));
    }

    markAdminNotificationUnread(id: number | string): void {
        this.adminNotifications.update(list => list.map(n => n.id === id ? { ...n, isRead: false } : n));
    }

    markAllAdminNotificationsRead(): void {
        this.adminNotifications.update(list => list.map(n => ({ ...n, isRead: true })));
    }

    markAllAdminNotificationsUnread(): void {
        this.adminNotifications.update(list => list.map(n => ({ ...n, isRead: false })));
    }

    removeAdminNotification(id: number | string): void {
        this.adminNotifications.update(list => list.filter(n => n.id !== id));
    }

    seedAnnouncements(msgs: LiveMessageResponse[]): void {
        this.announcements.set(msgs);
    }

    seedStats(s: SiteStats): void {
        this.stats.set(s);
    }

    /** Fetch existing notifications from the REST API and seed the signal store */
    seedAdminNotifications(): void {
        if (!this.session.isAdminOrMod()) return;
        this.adminApi.getApiAdminNotifications().subscribe({
            next: (notifications) => this.adminNotifications.set(notifications),
        });
    }

    /** Poll for live message changes every 10s instead of pushing them over a websocket. */
    startLiveMessagePolling(): void {
        interval(LIVE_MESSAGES_POLL_INTERVAL).pipe(
            switchMap(() => this.adminApi.getApiAdminLiveMessages()),
        ).subscribe({
            next: (msgs) => this.announcements.set(msgs),
            error: () => { },
        });
    }
}
