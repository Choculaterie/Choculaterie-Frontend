import { Component, OnInit, inject, DestroyRef, effect, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from './shared/components/footer/footer.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { TitleSpotlightComponent } from './shared/components/title-spotlight/title-spotlight.component';
import { AdminService } from './api/admin';
import { RealtimeService } from './core/services/realtime.service';
import { ThemeService } from './core/services/theme.service';
import { translateText } from './core/i18n/translation.store';
import { PAGE_TITLES } from './i18n/labels';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, TitleSpotlightComponent, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private adminApi = inject(AdminService);
  private router = inject(Router);
  private titleService = inject(Title);
  private destroyRef = inject(DestroyRef);
  readonly realtime = inject(RealtimeService);
  // Injecting ThemeService here bootstraps it and applies data-theme to <html> immediately
  private _theme = inject(ThemeService);

  private readonly siteName = 'Choculaterie';

  /** Routes whose components set their own page title via OgMetaService */
  private readonly selfTitledRoutes = new Set(['schematics', 'users', 'qs']);

  // Expose announcements from the shared realtime service
  readonly announcements = this.realtime.announcements;

  /** Current tab title in English, or null when the page sets its own. */
  private readonly titleLabel = signal<string | null>(null);

  constructor() {
    // Reads translateText, so it re-runs on a language change as well as on
    // navigation. Returning before that read leaves a self-titled page alone.
    effect(() => {
      const label = this.titleLabel();
      if (label === null) return;
      this.titleService.setTitle(translateText(label));
    });
  }

  ngOnInit(): void {
    // Seed initial announcements via HTTP, then poll for changes every 10s
    this.adminApi.getApiAdminLiveMessages().subscribe({
      next: (res) => this.realtime.seedAnnouncements(res),
    });
    this.realtime.startLiveMessagePolling();

    // Set page title from the first URL segment
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((e) => {
      const segments = e.urlAfterRedirects.split('?')[0].split('/').filter(Boolean);
      const first = segments[0];

      // Detail pages set their own title; null means leave it alone.
      if (first && this.selfTitledRoutes.has(first) && segments.length > 1) {
        this.titleLabel.set(null);
        return;
      }

      // siteName is not in the catalog, so it passes through untranslated.
      this.titleLabel.set(PAGE_TITLES[first as keyof typeof PAGE_TITLES] ?? this.siteName);
    });
  }
}
