import { Injectable, inject, signal, computed } from '@angular/core';
import { interval, of, Subscription } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { SessionService } from './session.service';
import { AdminService } from '../../api/admin';
import { NotificationsService } from '../../api/notifications';
import type { LiveMessageResponse, AdminNotificationResponse, UserNotificationResponse } from '../../api/generated.schemas';

export interface SiteStats {
    downloadsCount: number;
    schematicCount: number;
    quickShareCount: number;
    userCount: number;
}

/** Unified inbox item for the dialog (admin + user notifications). */
export type InboxItem =
    | (AdminNotificationResponse & { source: 'admin' })
    | (UserNotificationResponse & { source: 'user' });

const LIVE_MESSAGES_POLL_INTERVAL = 10_000;
const USER_NOTIFICATIONS_POLL_INTERVAL = 30_000;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
    private session = inject(SessionService);
    private adminApi = inject(AdminService);
    private notificationsApi = inject(NotificationsService);
    private userNotifPollSub: Subscription | null = null;

    readonly announcements = signal<LiveMessageResponse[]>([]);
    readonly stats = signal<SiteStats | null>(null);
    readonly adminNotifications = signal<AdminNotificationResponse[]>([]);
    readonly userNotifications = signal<UserNotificationResponse[]>([]);

    readonly hasUnreadAdminNotifications = computed(() =>
        this.adminNotifications().some(n => !n.isRead)
    );

    readonly hasUnreadUserNotifications = computed(() =>
        this.userNotifications().some(n => !n.isRead)
    );

    /** Combined inbox list, newest first. */
    readonly inboxItems = computed<InboxItem[]>(() => {
        const admin: InboxItem[] = this.session.isAdminOrMod()
            ? this.adminNotifications().map(n => ({ ...n, source: 'admin' as const }))
            : [];
        const user: InboxItem[] = this.userNotifications().map(n => ({ ...n, source: 'user' as const }));
        return [...admin, ...user].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    });

    readonly unreadInboxCount = computed(() => {
        const userUnread = this.userNotifications().filter(n => !n.isRead).length;
        const adminUnread = this.session.isAdminOrMod()
            ? this.adminNotifications().filter(n => !n.isRead).length
            : 0;
        return userUnread + adminUnread;
    });

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

    markUserNotificationRead(id: number | string): void {
        this.userNotifications.update(list => list.map(n => n.id === id ? { ...n, isRead: true } : n));
    }

    markUserNotificationUnread(id: number | string): void {
        this.userNotifications.update(list => list.map(n => n.id === id ? { ...n, isRead: false } : n));
    }

    removeUserNotification(id: number | string): void {
        this.userNotifications.update(list => list.filter(n => n.id !== id));
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

    seedUserNotifications(): void {
        if (!this.session.isAuthenticated()) {
            this.userNotifications.set([]);
            return;
        }
        this.notificationsApi.getApiNotifications().subscribe({
            next: (notifications) => this.userNotifications.set(notifications),
            error: () => { /* ignore when unauthenticated race */ },
        });
    }

    /** Seed both admin (if applicable) and user notifications. */
    seedInbox(): void {
        this.seedAdminNotifications();
        this.seedUserNotifications();
        this.startUserNotificationPolling();
    }

    /** Poll for live message changes every 10s instead of pushing them over a websocket. */
    startLiveMessagePolling(): void {
        interval(LIVE_MESSAGES_POLL_INTERVAL).pipe(
            switchMap(() => this.adminApi.getApiAdminLiveMessages().pipe(
                catchError(() => of(null)),
            )),
        ).subscribe({
            next: (msgs) => { if (msgs) this.announcements.set(msgs); },
        });
    }

    /** Light poll for user inbox while authenticated. */
    startUserNotificationPolling(): void {
        this.userNotifPollSub?.unsubscribe();
        if (!this.session.isAuthenticated()) return;

        this.userNotifPollSub = interval(USER_NOTIFICATIONS_POLL_INTERVAL).pipe(
            switchMap(() => {
                if (!this.session.isAuthenticated()) return of(null);
                return this.notificationsApi.getApiNotifications().pipe(catchError(() => of(null)));
            }),
        ).subscribe({
            next: (notifications) => {
                if (notifications) this.userNotifications.set(notifications);
            },
        });
    }

    clearUserNotifications(): void {
        this.userNotifPollSub?.unsubscribe();
        this.userNotifPollSub = null;
        this.userNotifications.set([]);
        this.adminNotifications.set([]);
    }
}
