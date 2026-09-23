import { Injectable, signal, computed, effect } from '@angular/core';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'theme-preference';

  private readonly _theme = signal<Theme>(this.getInitialTheme());
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    effect(() => {
      const theme = this._theme();
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      try {
        localStorage.setItem(this.storageKey, theme);
      } catch { /* empty */ }
    });
  }

  toggle(): void {
    this._theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }

  private getInitialTheme(): Theme {
    try {
      const saved = localStorage.getItem(this.storageKey) as Theme | null;
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* empty */ }
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
}
