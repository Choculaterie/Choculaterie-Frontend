import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-empty-state',
    standalone: true,
    imports: [MatIconModule],
    template: `
        <div class="empty-state">
            <mat-icon>{{ icon() }}</mat-icon>
            <h3>{{ title() }}</h3>
            @if (subtitle()) {
                <p>{{ subtitle() }}</p>
            }
            <ng-content />
        </div>
    `,
    styles: [`
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 3rem; gap: 0.5rem; text-align: center;
        }
        mat-icon {
            font-size: 64px; width: 64px; height: 64px;
            color: var(--mat-sys-on-surface-variant); opacity: 0.5;
        }
        h3 { margin: 0; color: var(--mat-sys-on-surface); font: var(--mat-sys-title-medium); }
        p { margin: 0; color: var(--mat-sys-on-surface-variant); font-size: 0.9rem; }
    `],
})
export class EmptyStateComponent {
    icon = input('inbox');
    title = input('Nothing here');
    subtitle = input('');
}
