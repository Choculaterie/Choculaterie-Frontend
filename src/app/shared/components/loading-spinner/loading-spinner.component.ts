import { Component, input } from '@angular/core';

@Component({
    selector: 'app-loading-spinner',
    standalone: true,
    imports: [],
    template: `
        <div class="loading-container">
            <img src="loading.gif" alt="Loading…" class="loading-gif"
                 [style.width.px]="diameter()" [style.height.px]="diameter()" />
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
        .loading-gif {
            object-fit: contain;
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
