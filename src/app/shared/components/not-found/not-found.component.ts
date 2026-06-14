import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-not-found',
    standalone: true,
    imports: [RouterLink, MatButtonModule],
    template: `
    <div class="not-found">
        <img src="/icons/ui/forbidden_circle.svg" alt="" aria-hidden="true" class="mc-icon big-icon" />
        <h1>404</h1>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <a mat-flat-button routerLink="/">
            <img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" matButtonIcon class="mc-icon" /> Back to Home
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
            width: 96px;
            height: 96px;
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
