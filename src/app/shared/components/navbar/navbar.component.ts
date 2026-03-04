import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { SessionService } from '../../../core/services/session.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { UsersService } from '../../../api/users';
import { AuthService as ApiAuthService } from '../../../api/auth';
import { AdminService } from '../../../api/admin';
import { UserImgPipe } from '../../pipes/image-url.pipe';
import { InboxDialogComponent } from '../inbox-dialog/inbox-dialog.component';

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
    ],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
    readonly session = inject(SessionService);
    readonly realtime = inject(RealtimeService);
    private router = inject(Router);
    private usersApi = inject(UsersService);
    private authApi = inject(ApiAuthService);
    private dialog = inject(MatDialog);

    readonly unreadNotifCount = computed(() =>
        this.realtime.adminNotifications().filter(n => !n.isRead).length
    );

    ngOnInit(): void {
        if (this.session.isAuthenticated() && !this.session.profile()) {
            this.usersApi.getApiUsersMe().subscribe((p) => this.session.setProfile(p));
        }
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

    openInbox(): void {
        this.dialog.open(InboxDialogComponent, {
            width: '520px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            panelClass: 'inbox-dialog-panel',
        });
    }
}
