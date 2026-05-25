import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button class="theme-toggle" (click)="theme.toggle()" [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
      <img [src]="theme.isDark() ? '/icons/weather/sun.png' : '/icons/weather/moon.png'" alt="" aria-hidden="true" />
    </button>
  `,
  styles: [`
    .theme-toggle {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 1000;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      background: var(--mat-sys-surface-container-high);
      box-shadow: var(--mat-sys-level2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: box-shadow 0.2s, transform 0.15s;
      padding: 0;

      &:hover {
        box-shadow: var(--mat-sys-level3);
        transform: scale(1.08);
      }

      &:active {
        transform: scale(0.95);
      }

      img {
      }
    }
  `],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
