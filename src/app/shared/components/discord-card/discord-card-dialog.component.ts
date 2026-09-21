import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { simpleDiscord } from '@ng-icons/simple-icons';
import { TPipe } from '../../../core/i18n/t.pipe';
import { translateText } from '../../../core/i18n/translation.store';

export interface DiscordCardDialogData {
    username: string;
}

interface DiscordActivity {
    type: number;
    name: string | null;
    state: string | null;
    details: string | null;
    emoji: string | null;
}

interface DiscordCardResponse {
    discordId: string;
    username: string | null;
    globalName: string | null;
    avatarUrl: string | null;
    status: string | null;
    activity: DiscordActivity | null;
    fetchedAt: string | null;
    stale: boolean;
}

@Component({
    selector: 'app-discord-card-dialog',
    standalone: true,
    imports: [TPipe, DatePipe, MatDialogModule, MatButtonModule, MatProgressBarModule, NgIconComponent],
    viewProviders: [provideIcons({ simpleDiscord })],
    template: `
        <div class="dc-card">
            <div class="dc-header">
                <ng-icon name="simpleDiscord" size="20" />
                <h2>{{ 'Discord' | t }}</h2>
                <span class="dc-spacer"></span>
                <button mat-icon-button mat-dialog-close aria-label="Close">
                    <img src="/icons/letters/X.svg" alt="" aria-hidden="true" class="mc-icon" />
                </button>
            </div>

            @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
            } @else if (error()) {
            <p class="dc-error">{{ error() }}</p>
            } @else if (card(); as c) {
            <div class="dc-body">
                @if (c.avatarUrl) {
                <img [src]="c.avatarUrl" alt="" class="dc-avatar" />
                } @else {
                <div class="dc-avatar dc-avatar--empty"><ng-icon name="simpleDiscord" size="32" /></div>
                }
                <div class="dc-names">
                    @if (c.globalName) {
                    <span class="dc-global">{{ c.globalName }}</span>
                    }
                    <span class="dc-handle">&#64;{{ c.username }}</span>
                    @if (activityLine(); as line) {
                    <span class="dc-activity">{{ line }}</span>
                    }
                </div>
            </div>
            @if (c.stale) {
            <p class="dc-stale">
                @if (c.fetchedAt) {
                {{ 'Could not refresh. Showing results cached on' | t }} {{ c.fetchedAt | date:'medium' }}
                } @else {
                {{ 'Could not reach Discord. Showing the linked name only.' | t }}
                }
            </p>
            }
            }
        </div>
    `,
    styles: `
        .dc-card { padding: 0.75rem 1rem 1rem; min-width: 260px; }
        .dc-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            h2 { margin: 0; font-size: 1.05rem; }
        }
        .dc-spacer { flex: 1; }
        .dc-body { display: flex; align-items: center; gap: 1rem; }
        .dc-avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
            background: var(--mat-sys-surface-variant);
        }
        .dc-avatar--empty { display: flex; align-items: center; justify-content: center; }
        .dc-names { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
        .dc-global { font-size: 1.05rem; font-weight: 700; overflow-wrap: anywhere; }
        .dc-handle { color: var(--mat-sys-primary); overflow-wrap: anywhere; }
        .dc-activity {
            margin-top: 0.2rem;
            font-size: 0.78rem;
            line-height: 1.4;
            color: var(--mat-sys-on-surface-variant);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .dc-stale {
            margin: 0.9rem 0 0;
            font-size: 0.75rem;
            color: var(--mat-sys-on-surface-variant);
        }
        .dc-error { margin: 0.5rem 0 0; color: var(--mat-sys-error); font-size: 0.85rem; }
    `,
})
export class DiscordCardDialogComponent implements OnInit {
    private http = inject(HttpClient);

    readonly loading = signal(true);
    readonly error = signal('');
    readonly card = signal<DiscordCardResponse | null>(null);

    constructor(@Inject(MAT_DIALOG_DATA) public data: DiscordCardDialogData) { }

    activityLine(): string | null {
        const a = this.card()?.activity;
        if (!a) return null;

        if (a.type === 4) {
            const text = [a.emoji, a.state].filter(Boolean).join(' ').trim();
            return text || null;
        }

        const name = a.name?.trim();
        if (!name) return null;

        const prefix = {
            0: 'Playing',
            1: 'Streaming',
            2: 'Listening to',
            3: 'Watching',
            5: 'Competing in',
        }[a.type];

        return prefix ? `${translateText(prefix)} ${name}` : name;
    }

    ngOnInit(): void {
        this.http.get<DiscordCardResponse>(`/api/Users/${encodeURIComponent(this.data.username)}/discord-card`)
            .subscribe({
                next: (res) => {
                    this.card.set(res);
                    this.loading.set(false);
                },
                error: () => {
                    this.error.set('Could not load this Discord profile.');
                    this.loading.set(false);
                },
            });
    }
}
