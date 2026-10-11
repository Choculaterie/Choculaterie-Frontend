import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { McIconPipe } from '../../pipes/mc-icon.pipe';

@Component({
    selector: 'app-empty-state',
    standalone: true,
    imports: [MatIconModule, McIconPipe],
    template: `
        <div class="empty-state">
            <mat-icon [svgIcon]="icon() | mcIcon" class="empty-icon"></mat-icon>
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
            animation: settle-in 220ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
            .empty-state { animation: none; }
        }
        .empty-icon {
            --icon-size: 84px;
            opacity: 0.5;
        }
        h3 { margin: 0; color: var(--mat-sys-on-surface); font: var(--mat-sys-title-medium); }
        p { margin: 0; color: var(--mat-sys-on-surface-variant); font-size: 0.9rem; }
    `],
})
export class EmptyStateComponent {
    icon = input('/icons/ui/question_mark!.svg');
    title = input('Nothing here');
    subtitle = input('');
}
