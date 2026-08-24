import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';

const STORAGE_KEY = 'chocu-title-spotlight-dismissed-eternal-angler';
const PROMO_KEY = 'eternal-angler';

@Component({
    selector: 'app-title-spotlight',
    standalone: true,
    imports: [MatButtonModule],
    template: `
        @if (visible()) {
            <aside class="title-spotlight" aria-label="Community title spotlight">
                <a
                    class="title-spotlight__link"
                    href="https://store.steampowered.com/app/4378770/Eternal_Angler/"
                    target="_blank"
                    rel="noopener noreferrer"
                    (click)="trackClick()"
                >
                    <img
                        class="title-spotlight__art"
                        src="/assets/spotlight/eternal-angler.png"
                        width="600"
                        height="900"
                        alt="Eternal Angler on Steam"
                        loading="lazy"
                        decoding="async"
                    />
                    <span class="title-spotlight__copy">
                        <span class="title-spotlight__kicker">Community pick</span>
                        <span class="title-spotlight__name">Eternal Angler</span>
                        <span class="title-spotlight__meta">
                            A surreal multiplayer fishing game where you catch strange creatures hidden across fragmented dimensions.
                        </span>
                    </span>
                    <span class="title-spotlight__cta">View on Steam</span>
                </a>
                <button
                    mat-icon-button
                    type="button"
                    class="title-spotlight__dismiss"
                    aria-label="Dismiss"
                    (click)="dismiss($event)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"
                        class="mc-icon" aria-hidden="true">
                        <path fill="currentColor"
                            d="M2,4h4v1h-4zM22,4h4v1h-4zM2,5h4v1h-4zM22,5h4v1h-4zM2,6h4v1h-4zM22,6h4v1h-4zM2,7h8v1h-8zM18,7h8v1h-8zM2,8h8v1h-8zM18,8h8v1h-8zM2,9h8v1h-8zM18,9h8v1h-8zM6,10h16v1h-16zM6,11h16v1h-16zM6,12h16v1h-16zM10,13h8v1h-8zM10,14h8v1h-8zM10,15h8v1h-8zM6,16h16v1h-16zM6,17h16v1h-16zM6,18h16v1h-16zM2,19h8v1h-8zM18,19h8v1h-8zM2,20h8v1h-8zM18,20h8v1h-8zM2,21h8v1h-8zM18,21h8v1h-8zM2,22h4v1h-4zM22,22h4v1h-4zM2,23h4v1h-4zM22,23h4v1h-4zM2,24h4v1h-4zM22,24h4v1h-4z" />
                        <path fill="var(--mc-icon-shadow)"
                            d="M26,7h4v1h-4zM26,8h4v1h-4zM26,9h4v1h-4zM22,10h8v1h-8zM22,11h8v1h-8zM22,12h8v1h-8zM18,13h8v1h-8zM18,14h8v1h-8zM18,15h8v1h-8zM10,19h8v1h-8zM10,20h8v1h-8zM10,21h8v1h-8zM6,22h8v1h-8zM26,22h4v1h-4zM6,23h8v1h-8zM26,23h4v1h-4zM6,24h8v1h-8zM26,24h4v1h-4zM6,25h4v1h-4zM26,25h4v1h-4zM6,26h4v1h-4zM26,26h4v1h-4zM6,27h4v1h-4zM26,27h4v1h-4z" />
                    </svg>
                </button>
            </aside>
        }
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
        }

        .title-spotlight {
            position: relative;
            width: 100%;
            border-bottom: 1px solid color-mix(in srgb, var(--mat-sys-outline-variant) 80%, transparent);
            background: color-mix(in srgb, var(--mat-sys-surface-container) 88%, var(--mat-sys-primary) 12%);
        }

        .title-spotlight__link {
            display: flex;
            align-items: center;
            gap: 1rem;
            max-width: 1100px;
            margin: 0 auto;
            padding: 0.55rem 2.75rem 0.55rem 1.25rem;
            text-decoration: none;
            color: inherit;
            box-sizing: border-box;
            transition: background 0.15s ease;
        }

        .title-spotlight__link:hover,
        .title-spotlight__link:focus-visible {
            background: color-mix(in srgb, var(--mat-sys-surface-container-high) 85%, var(--mat-sys-primary) 15%);
            outline: none;
        }

        .title-spotlight__art {
            flex: 0 0 auto;
            width: 2.75rem;
            height: 4.125rem;
            object-fit: cover;
            border-radius: 6px;
            background: #111;
            box-shadow: var(--mat-sys-level1);
        }

        .title-spotlight__copy {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.1rem;
        }

        .title-spotlight__kicker {
            font-size: 0.7rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--mat-sys-primary);
        }

        .title-spotlight__name {
            font-size: 0.95rem;
            font-weight: 700;
            line-height: 1.2;
            color: var(--mat-sys-on-surface);
        }

        .title-spotlight__meta {
            font-size: 0.8rem;
            line-height: 1.35;
            color: var(--mat-sys-on-surface-variant);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .title-spotlight__cta {
            flex: 0 0 auto;
            font-size: 0.8rem;
            font-weight: 700;
            padding: 0.4rem 0.75rem;
            border-radius: 999px;
            background: var(--mat-sys-primary);
            color: var(--mat-sys-on-primary);
            white-space: nowrap;
        }

        .title-spotlight__dismiss {
            position: absolute;
            top: 50%;
            right: 0.35rem;
            transform: translateY(-50%);
            color: var(--mat-sys-on-surface);
        }

        /* Match navbar mat-icon-button mc glyphs (24px + shadow optical bias). */
        .title-spotlight__dismiss .mc-icon {
            width: 24px;
            height: 24px;
            display: block;
            transform: translate(1px, 1px);
        }

        @media (max-width: 600px) {
            .title-spotlight__link {
                padding: 0.5rem 2.5rem 0.5rem 0.75rem;
                gap: 0.7rem;
            }

            .title-spotlight__meta {
                -webkit-line-clamp: 2;
            }

            .title-spotlight__cta {
                padding: 0.35rem 0.6rem;
                font-size: 0.72rem;
            }
        }
    `],
})
export class TitleSpotlightComponent {
    readonly visible = signal(!this.isDismissed());

    constructor(private http: HttpClient) { }

    trackClick(): void {
        this.http.post(`/api/Promo/${PROMO_KEY}/click`, {}).subscribe({ error: () => { } });
    }

    dismiss(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch { }
        this.visible.set(false);
    }

    private isDismissed(): boolean {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }
}
