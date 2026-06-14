import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from './shared/components/footer/footer.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { AdminService } from './api/admin';
import { RealtimeService } from './core/services/realtime.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, MatIconModule],
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

      // Home page shows siteName
      if (!first) {
        this.titleService.setTitle(this.siteName);
        return;
      }

      // Detail pages (schematics/:id, users/:username, qs/:id) are handled by their components
      // Don't override their title here - let them set it themselves
      const isDetailPage = this.selfTitledRoutes.has(first) && segments.length > 1;
      if (isDetailPage) {
        return;
      }

      // For main list pages (schematics, mods, faq, etc), show the page name
      const mainListRoutes = new Set(['schematics', 'mods', 'faq', 'admin']);
      if (mainListRoutes.has(first)) {
        const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
        this.titleService.setTitle(label);
        return;
      }

      // Everything else defaults to siteName as fallback
      this.titleService.setTitle(this.siteName);
    });
  }
}
