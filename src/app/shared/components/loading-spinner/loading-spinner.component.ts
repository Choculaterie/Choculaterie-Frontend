import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-loading-spinner',
    standalone: true,
    imports: [MatProgressSpinnerModule],
    template: `
        <div class="loading-container">
            <mat-spinner [diameter]="diameter()" />
            @if (message()) {
                <p class="loading-msg">{{ message() }}</p>
            }
        </div>
    `,
    styles: [`
        .loading-container {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 3rem; gap: 1rem;
        }
        .loading-msg {
            color: var(--mat-sys-on-surface-variant); font-size: 0.9rem; margin: 0;
        }
    `],
})
export class LoadingSpinnerComponent {
    diameter = input(48);
    message = input('');
}
