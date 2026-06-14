import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { SessionService } from '../../../core/services/session.service';
import { environment } from '../../../environments/environment';

export interface LiveLogEntry {
    timestamp: string;
    level: string;
    category: string;
    message: string;
    exception?: string | null;
    source: 'Backend' | 'API';
}

const MAX_ENTRIES = 300;

/**
 * Drives the admin "Server Logs" live tail. Connections to both backends'
 * `/hubs/logs` are only opened while the Server Logs tab is visible.
 */
@Injectable({ providedIn: 'root' })
export class AdminLogsService {
    private session = inject(SessionService);
    private backendConn?: signalR.HubConnection;
    private apiConn?: signalR.HubConnection;

    readonly entries = signal<LiveLogEntry[]>([]);

    connect(): void {
        if (this.backendConn) return;
        this.backendConn = this.build(environment.apiBasePath, 'Backend');
        this.apiConn = this.build(environment.apiProjectBasePath, 'API');
        this.backendConn.start().catch(() => {});
        this.apiConn.start().catch(() => {});
    }

    disconnect(): void {
        this.backendConn?.stop();
        this.apiConn?.stop();
        this.backendConn = undefined;
        this.apiConn = undefined;
        this.entries.set([]);
    }

    clear(): void {
        this.entries.set([]);
    }

    private build(baseUrl: string, source: 'Backend' | 'API'): signalR.HubConnection {
        const conn = new signalR.HubConnectionBuilder()
            .withUrl(`${baseUrl}/hubs/logs`, { accessTokenFactory: () => this.session.getToken() ?? '' })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        conn.on('RecentLogs', (logs: Omit<LiveLogEntry, 'source'>[]) =>
            this.merge(logs.map(l => ({ ...l, source }))));
        conn.on('LogEntry', (entry: Omit<LiveLogEntry, 'source'>) =>
            this.merge([{ ...entry, source }]));

        return conn;
    }

    private merge(newEntries: LiveLogEntry[]): void {
        this.entries.update(list =>
            [...list, ...newEntries]
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                .slice(-MAX_ENTRIES));
    }
}
