import { Component, OnInit, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
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
        UserImgPipe,
        SkeletonImgComponent,
    ],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
    readonly session = inject(SessionService);
    readonly theme = inject(ThemeService);
    readonly realtime = inject(RealtimeService);
    private router = inject(Router);
    private usersApi = inject(UsersService);
    private authApi = inject(ApiAuthService);
    private dialog = inject(MatDialog);

    readonly unreadNotifCount = computed(() =>
        this.realtime.adminNotifications().filter(n => !n.isRead).length
    );

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
    }

    ngOnInit(): void {
        // Seed existing admin notifications from REST API on page load
        this.realtime.seedAdminNotifications();
    }

    logout(): void {
        const refreshToken = this.session.getRefreshToken();
        if (refreshToken) {
            this.authApi.postApiAuthRevoke({ refreshToken }).subscribe({
                error: () => { /* ignore revocation errors */ },
            });
        }
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
