import { Component, effect, input, signal } from '@angular/core';

@Component({
    selector: 'app-skeleton-img',
    standalone: true,
    host: {
        '[style.border-radius]': 'borderRadius()',
    },
    template: `
        @if (!loaded()) {
        <div class="skeleton-placeholder" [style.height]="height()" [style.border-radius]="borderRadius()"></div>
        }
        <img
            [src]="src()"
            [alt]="alt()"
            [class.loaded]="loaded()"
            [style.height]="height()"
            [style.object-fit]="objectFit()"
            [attr.fetchpriority]="fetchPriority()"
            (load)="loaded.set(true)"
            (error)="loaded.set(true)"
        />
    `,
    styles: [`
        :host { display: block; position: relative; overflow: hidden; }

        .skeleton-placeholder {
            width: 100%;
            overflow: hidden;
            animation: shimmer 1.5s infinite;
            background: linear-gradient(
                90deg,
                var(--mat-sys-surface-variant) 25%,
                var(--mat-sys-surface-container-highest) 50%,
                var(--mat-sys-surface-variant) 75%
            );
            background-size: 200% 100%;
        }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        img {
            display: block;
            width: 100%;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        img.loaded {
            opacity: 1;
        }
    `],
})
export class SkeletonImgComponent {
    src = input.required<string>();
    alt = input('');
    height = input('160px');
    borderRadius = input('inherit');
    objectFit = input('cover');
    fetchPriority = input<'high' | 'low' | 'auto'>('auto');

    readonly loaded = signal(false);

    constructor() {
        effect(() => {
            this.src();
            this.loaded.set(false);
        });
    }
}
