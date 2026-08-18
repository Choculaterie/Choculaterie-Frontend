import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { persistLocale, getLocale } from '../../../core/i18n/locale';
import { TPipe } from '../../../core/i18n/t.pipe';
import { TranslationStore } from '../../../core/i18n/translation.store';
import { Badge } from '../../../core/enums';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { SessionService } from '../../../core/services/session.service';
import { ThemeService } from '../../../core/services/theme.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { UsersService } from '../../../api/users';
import { AuthService as ApiAuthService } from '../../../api/auth';
import { AdminService } from '../../../api/admin';
import { UserImgPipe } from '../../pipes/image-url.pipe';
import { InboxDialogComponent } from '../inbox-dialog/inbox-dialog.component';
import { SkeletonImgComponent } from '../skeleton-img/skeleton-img.component';

@Component({
    selector: 'app-navbar',
    standalone: true,
    imports: [
        RouterLink,
        RouterLinkActive,
        MatToolbarModule,
        MatButtonModule,
        MatIconModule,
        MatMenuModule,
        MatDividerModule,
        MatTooltipModule,
        TPipe,
        UserImgPipe,
        SkeletonImgComponent,
    ],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
    private http = inject(HttpClient);
    readonly locales = signal<{ code: string; label: string }[]>([]);

    readonly currentCode = signal(getLocale().toUpperCase());

    chooseLocale(code: string): void {
        this.currentCode.set(code.toUpperCase());
        persistLocale(code);
        this.translations.load(code);
    }

    private translations = inject(TranslationStore);
    readonly session = inject(SessionService);
    readonly theme = inject(ThemeService);
    readonly realtime = inject(RealtimeService);
    private router = inject(Router);
    private usersApi = inject(UsersService);
    private authApi = inject(ApiAuthService);
    private dialog = inject(MatDialog);

    readonly unreadNotifCount = computed(() => this.realtime.unreadInboxCount());

    get returnUrl(): string | null {
        const url = this.router.url;
        return url.startsWith('/auth') ? null : url;
    }

    private profileFetchPending = false;

    constructor() {
        // Re-fetch the profile whenever it's missing (initial load, or after a
        // token refresh clears the cached profile via setSession).
        effect(() => {
            if (this.session.isAuthenticated() && !this.session.profile() && !this.profileFetchPending) {
                this.profileFetchPending = true;
                this.usersApi.getApiUsersMe().subscribe({
                    next: (p) => { this.profileFetchPending = false; this.session.setProfile(p); },
                    error: () => { this.profileFetchPending = false; },
                });
            }
        });

        // Seed / refresh inbox when auth state becomes true (login or page load)
        effect(() => {
            if (this.session.isAuthenticated()) {
                this.realtime.seedInbox();
            } else {
                this.realtime.clearUserNotifications();
            }
        });
    }

    // A half finished language reads worse than English, so only offer one once the
    // website strings are at least half done. Mods are not in the catalog and so
    // cannot count toward it.
    /// Only people who can actually contribute see the entry point.
    canTranslate(): boolean {
        if (this.session.isAdminOrMod()) return true;
        const badges = (this.session.profile() as { badges?: { badge: number }[] } | null)?.badges ?? [];
        return badges.some((b) => b.badge === Badge.Translator || b.badge === Badge.Dev);
    }

    private loadLocales(): void {
        this.http.get<{ locales: { code: string; label: string; total: number; translated: number }[] }>(
            '/api/Translations/progress').subscribe({
            next: (r) => {
                const ready = (r?.locales ?? []).filter(
                    (l) => l.total > 0 && l.translated / l.total >= 0.5);
                this.locales.set([{ code: 'en', label: 'English' }, ...ready]);
            },
            error: () => this.locales.set([]),
        });
    }

    ngOnInit(): void {
        this.loadLocales();

        // Roles can change while a session is open, so re-read the profile on each
        // navigation. Without it a newly granted badge stays invisible until logout.
        this.router.events
            .pipe(filter((e) => e instanceof NavigationEnd))
            .subscribe(() => {
                if (!this.session.isAuthenticated() || this.profileFetchPending) return;
                this.profileFetchPending = true;
                this.usersApi.getApiUsersMe().subscribe({
                    next: (p) => { this.profileFetchPending = false; this.session.setProfile(p); },
                    error: () => { this.profileFetchPending = false; },
                });
            });
        // Inbox seeding handled by auth effect above
    }

    logout(): void {
        const refreshToken = this.session.getRefreshToken();
        if (refreshToken) {
            this.authApi.postApiAuthRevoke({ refreshToken }).subscribe({
                error: () => { /* ignore revocation errors */ },
            });
        }
        this.realtime.clearUserNotifications();
        this.session.clear();
    }

    openInbox(event: MouseEvent): void {
        (event.currentTarget as HTMLElement).blur();
        this.dialog.open(InboxDialogComponent, {
            width: '520px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            panelClass: 'inbox-dialog-panel',
            autoFocus: false,
        });
    }
}
