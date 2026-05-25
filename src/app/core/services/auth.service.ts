import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthService as ApiAuthService } from '../../api/auth';
import { UsersService } from '../../api/users';
import type { LoginRequest, LoginResponse, OwnProfileResponse } from '../../api/generated.schemas';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private currentUser = signal<LoginResponse | null>(this.getStoredUser());
    private profile = signal<OwnProfileResponse | null>(null);

    readonly user = this.currentUser.asReadonly();
    readonly userProfile = this.profile.asReadonly();
    readonly isAuthenticated = computed(() => !!this.currentUser());

    constructor(
        private apiAuth: ApiAuthService,
        private usersApi: UsersService,
        private router: Router,
    ) { }

    login(credentials: LoginRequest): Observable<LoginResponse> {
        return this.apiAuth.postApiAuthLogin(credentials).pipe(
            tap((response) => this.handleAuthResponse(response)),
        );
    }

    loadProfile(): Observable<OwnProfileResponse> {
        return this.usersApi.getApiUsersMe().pipe(
            tap((p) => this.profile.set(p)),
        );
    }

    logout(): void {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        this.currentUser.set(null);
        this.profile.set(null);
        this.router.navigate(['/auth/login']);
    }

    getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    }

    private handleAuthResponse(response: LoginResponse): void {
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(USER_KEY, JSON.stringify(response));
        this.currentUser.set(response);
    }

    private getStoredUser(): LoginResponse | null {
        const json = localStorage.getItem(USER_KEY);
        if (json) {
            try {
                return JSON.parse(json) as LoginResponse;
            } catch {
                return null;
            }
        }
        return null;
    }
}
