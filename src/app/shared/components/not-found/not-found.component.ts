import { Component } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-not-found',
    standalone: true,
    imports: [MatIconModule, TPipe, RouterLink, MatButtonModule],
    template: `
    <div class="not-found">
        <mat-icon svgIcon="mc:ui/forbidden_circle" class="big-icon"></mat-icon>
        <h1>404</h1>
        <p>{{ "The page you're looking for doesn't exist or has been moved." | t }}</p>
        <a mat-flat-button routerLink="/">
            <mat-icon svgIcon="mc:arrows/arrow_left" matButtonIcon></mat-icon> {{ 'Back to Home' | t }}
        </a>
    </div>
    `,
    styles: [`
        .not-found {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            gap: 0.75rem;
        }
        .big-icon {
            font-size: 96px;
            --icon-size: 132px;
            width: var(--icon-size);
            height: var(--icon-size);
            color: var(--mat-sys-on-surface-variant);
        }
        h1 {
            font: var(--mat-sys-display-large);
            margin: 0;
            color: var(--mat-sys-primary);
        }
        p {
            color: var(--mat-sys-on-surface-variant);
            max-width: 400px;
        }
    `],
})
export class NotFoundComponent { }
