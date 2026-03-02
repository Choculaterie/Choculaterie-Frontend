import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { SessionService } from '../../../core/services/session.service';
import { UsersService } from '../../../api/users';
import { AuthService as ApiAuthService } from '../../../api/auth';
import { UserImgPipe } from '../../pipes/image-url.pipe';

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
        UserImgPipe,
    ],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
    constructor(
        public session: SessionService,
        private usersApi: UsersService,
        private authApi: ApiAuthService,
    ) { }

    ngOnInit(): void {
        if (this.session.isAuthenticated() && !this.session.profile()) {
            this.usersApi.getApiUsersMe().subscribe((p) => this.session.setProfile(p));
        }
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
}
