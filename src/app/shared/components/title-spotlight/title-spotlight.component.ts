import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { TPipe } from '../../../core/i18n/t.pipe';
import type { PromotionResponse } from '../../../api/generated.schemas';
import { PromoImgPipe } from '../../pipes/image-url.pipe';
import { MatIconModule } from '@angular/material/icon';


const DISMISSED_PREFIX = 'chocu-title-spotlight-dismissed-';

@Component({
    selector: 'app-title-spotlight',
    standalone: true,
    imports: [MatIconModule, MatButtonModule, TPipe, PromoImgPipe],
    template: `
        @if (promo(); as p) {
            <aside class="title-spotlight" [attr.aria-label]="'Community title spotlight' | t">
                <a
                    class="title-spotlight__link"
                    [href]="p.linkUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    (click)="trackClick()"
                >
                    @if (p.imagePath) {
                    <img
                        class="title-spotlight__art"
                        [src]="p.imagePath | promoImg"
                        width="600"
                        height="900"
                        [alt]="p.imageAlt ?? p.title"
                        loading="lazy"
                        decoding="async"
                    />
                    }
                    <span class="title-spotlight__copy">
                        @if (p.kicker) {
                        <span class="title-spotlight__kicker">{{ p.kicker }}</span>
                        }
                        <span class="title-spotlight__name">{{ p.title }}</span>
                        @if (p.description) {
                        <span class="title-spotlight__meta">{{ p.description }}</span>
                        }
                    </span>
                    @if (p.ctaText) {
                    <span class="title-spotlight__cta">{{ p.ctaText }}</span>
                    }
                </a>
                <button
                    mat-icon-button
                    type="button"
                    class="title-spotlight__dismiss"
                    [attr.aria-label]="'Dismiss' | t"
                    (click)="dismiss($event)"
                >
                    <mat-icon svgIcon="mc:letters/X"></mat-icon>
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

        .title-spotlight__dismiss .mc-icon {
            --icon-size: 36px;
            width: var(--icon-size);
            height: var(--icon-size);
            display: block;
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
    readonly promo = signal<PromotionResponse | null>(null);

    constructor(private http: HttpClient) {
        this.http.get<PromotionResponse | null>('/api/Promo/active').subscribe({
            next: (p) => this.promo.set(p && !this.isDismissed(p.key) ? p : null),
            error: () => { },
        });
    }

    trackClick(): void {
        const p = this.promo();
        if (!p) return;
        this.http.post(`/api/Promo/${encodeURIComponent(p.key)}/click`, {}).subscribe({ error: () => { } });
    }

    dismiss(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        const p = this.promo();
        if (p) {
            try {
                localStorage.setItem(DISMISSED_PREFIX + p.key, '1');
            } catch { }
        }
        this.promo.set(null);
    }

    private isDismissed(key: string): boolean {
        try {
            return localStorage.getItem(DISMISSED_PREFIX + key) === '1';
        } catch {
            return false;
        }
    }
}
