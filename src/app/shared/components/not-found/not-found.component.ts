import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-not-found',
    standalone: true,
    imports: [RouterLink, MatButtonModule, MatIconModule],
    template: `
    <div class="not-found">
        <mat-icon class="big-icon">explore_off</mat-icon>
        <h1>404</h1>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <a mat-flat-button routerLink="/">
            <mat-icon>home</mat-icon> Back to Home
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
