import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { SessionService } from './session.service';
import { ToastService } from './toast.service';
import { AdminService } from '../../api/admin';
import type { LiveMessageResponse, AdminNotificationResponse } from '../../api/generated.schemas';

export interface SiteStats {
    downloadsCount: number;
    schematicCount: number;
    quickShareCount: number;
    userCount: number;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
    private session = inject(SessionService);
    private adminApi = inject(AdminService);
    private toast = inject(ToastService);
    private hub: signalR.HubConnection | null = null;
    private _retryTimer: ReturnType<typeof setInterval> | null = null;
    private _hasConnected = false;
    private _graceTimer: ReturnType<typeof setTimeout> | null = null;
    private _disconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /** Connection state: idle → connected ↔ reconnecting → disconnected */
    readonly connectionState = signal<'idle' | 'connected' | 'reconnecting' | 'disconnected'>('idle');

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
                // Browsers can't set Authorization headers on WebSocket upgrades -
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

        // ── Connection lifecycle ──
        this.hub.onreconnecting(() => {
            this.scheduleDisconnect('reconnecting');
        });

        this.hub.onreconnected(() => {
            this._hasConnected = true;
            this.cancelDisconnect();
            this.connectionState.set('connected');
            this.clearRetryTimer();
            this.toast.dismissReconnecting();
            this.toast.success($localize`Reconnected to server.`);
            // Re-subscribe after reconnect
            this.hub!.invoke('SubscribeLiveMessages').catch(() => { });
            this.hub!.invoke('SubscribeStats').catch(() => { });
            if (this.session.isAdminOrMod()) {
                this.hub!.invoke('SubscribeAdminNotifications').catch(() => { });
            }
        });

        this.hub.onclose(() => {
            if (this._hasConnected) {
                this.scheduleDisconnect('disconnected');
                this.startRetryTimer();
            }
        });

        this.hub.start()
            .then(() => {
                this._hasConnected = true;
                this.clearGraceTimer();
                this.connectionState.set('connected');
                this.hub!.invoke('SubscribeLiveMessages').catch(() => { });
                this.hub!.invoke('SubscribeStats').catch(() => { });
                if (this.session.isAdminOrMod()) {
                    this.hub!.invoke('SubscribeAdminNotifications').catch(() => { });
                }
            })
            .catch(err => {
                console.warn('[RealtimeService] connection failed:', err);
                // On first attempt, wait a grace period before showing reconnecting
                if (!this._hasConnected) {
                    this.startGraceTimer();
                    this.startRetryTimer();
                } else {
                    this.scheduleDisconnect('disconnected');
                    this.startRetryTimer();
                }
            });
    }

    /** Manual reconnect: rebuild hub & start */
    private tryReconnect(): void {
        if (!this.hub) return;
        if (this.hub.state === signalR.HubConnectionState.Connected ||
            this.hub.state === signalR.HubConnectionState.Connecting ||
            this.hub.state === signalR.HubConnectionState.Reconnecting) {
            return;
        }
        this.hub.start()
            .then(() => {
                this._hasConnected = true;
                const wasVisible = !this._disconnectTimer; // timer gone = toast was already shown
                this.cancelDisconnect();
                this.connectionState.set('connected');
                this.clearRetryTimer();
                if (wasVisible) {
                    this.toast.dismissReconnecting();
                    this.toast.success($localize`Reconnected to server.`);
                }
                this.hub!.invoke('SubscribeLiveMessages').catch(() => { });
                this.hub!.invoke('SubscribeStats').catch(() => { });
                if (this.session.isAdminOrMod()) {
                    this.hub!.invoke('SubscribeAdminNotifications').catch(() => { });
                }
            })
            .catch(() => { /* will retry on next interval */ });
    }

    /** Disable buttons immediately, but delay the toast by 3s. */
    private scheduleDisconnect(state: 'reconnecting' | 'disconnected'): void {
        this.connectionState.set(state);
        if (this._disconnectTimer) return;
        this._disconnectTimer = setTimeout(() => {
            this._disconnectTimer = null;
            this.toast.reconnecting();
        }, 3_000);
    }

    private cancelDisconnect(): void {
        if (this._disconnectTimer) {
            clearTimeout(this._disconnectTimer);
            this._disconnectTimer = null;
        }
    }

    private startRetryTimer(): void {
        if (this._retryTimer) return;
        this._retryTimer = setInterval(() => this.tryReconnect(), 10_000);
    }

    private clearRetryTimer(): void {
        if (this._retryTimer) {
            clearInterval(this._retryTimer);
            this._retryTimer = null;
        }
    }

    /** After 10s of failing to connect on first load, show the reconnecting toast. */
    private startGraceTimer(): void {
        if (this._graceTimer) return;
        this._graceTimer = setTimeout(() => {
            this._graceTimer = null;
            if (!this._hasConnected && this.connectionState() !== 'connected') {
                this.connectionState.set('disconnected');
                this.toast.reconnecting();
            }
        }, 10_000);
    }

    private clearGraceTimer(): void {
        if (this._graceTimer) {
            clearTimeout(this._graceTimer);
            this._graceTimer = null;
        }
    }

    ngOnDestroy(): void {
        this.clearRetryTimer();
        this.clearGraceTimer();
        this.cancelDisconnect();
        this.hub?.invoke('UnsubscribeLiveMessages').catch(() => { });
        this.hub?.invoke('UnsubscribeStats').catch(() => { });
        this.hub?.invoke('UnsubscribeAdminNotifications').catch(() => { });
        this.hub?.stop();
    }
}
