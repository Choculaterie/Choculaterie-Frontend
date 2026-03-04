import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { SessionService } from './session.service';
import { AdminService } from '../../api/admin';
import type { LiveMessageResponse, AdminNotificationResponse } from '../../api/generated.schemas';

export interface SiteStats {
    userCount: number;
    schematicCount: number;
    quickShareCount: number;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
    private session = inject(SessionService);
    private adminApi = inject(AdminService);
    private hub: signalR.HubConnection | null = null;

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

    connect(): void {
        if (this.hub) return;

        this.hub = new signalR.HubConnectionBuilder()
            .withUrl(`${environment.apiBasePath}/hubs/choculaterie`, {
                // Browsers can't set Authorization headers on WebSocket upgrades —
                // backend reads this query param automatically.
                accessTokenFactory: () => this.session.getToken() ?? '',
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // Live messages
        this.hub.on('LiveMessageCreated', (msg: LiveMessageResponse) => {
            this.announcements.update(list => [...list, msg]);
        });
        this.hub.on('LiveMessageUpdated', (msg: LiveMessageResponse) => {
            this.announcements.update(list => list.map(m => m.id === msg.id ? msg : m));
        });
        this.hub.on('LiveMessageDeleted', (id: number | string) => {
            this.announcements.update(list => list.filter(m => m.id !== id));
        });

        // Stats
        this.hub.on('StatsUpdated', (s: SiteStats) => {
            this.stats.set(s);
        });

        // Admin notifications
        this.hub.on('AdminNotification', (n: AdminNotificationResponse) => {
            this.addAdminNotification(n);
        });

        this.hub.start()
            .then(() => {
                this.hub!.invoke('SubscribeLiveMessages').catch(() => { });
                this.hub!.invoke('SubscribeStats').catch(() => { });
                if (this.session.isAdminOrMod()) {
                    this.hub!.invoke('SubscribeAdminNotifications').catch(() => { });
                }
            })
            .catch(err => console.warn('[RealtimeService] connection failed:', err));
    }

    ngOnDestroy(): void {
        this.hub?.invoke('UnsubscribeLiveMessages').catch(() => { });
        this.hub?.invoke('UnsubscribeStats').catch(() => { });
        this.hub?.invoke('UnsubscribeAdminNotifications').catch(() => { });
        this.hub?.stop();
    }
}
