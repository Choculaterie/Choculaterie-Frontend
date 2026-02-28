import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private currentUser = signal<User | null>(this.getStoredUser());

    readonly user = this.currentUser.asReadonly();
    readonly isAuthenticated = computed(() => !!this.currentUser());

    constructor(
        private api: ApiService,
        private router: Router,
    ) { }

    login(credentials: LoginRequest): Observable<AuthResponse> {
        return this.api.post<AuthResponse>('auth/login', credentials).pipe(
            tap((response) => this.handleAuthResponse(response)),
        );
    }

    register(data: RegisterRequest): Observable<AuthResponse> {
        return this.api.post<AuthResponse>('auth/register', data).pipe(
            tap((response) => this.handleAuthResponse(response)),
        );
    }

    logout(): void {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        this.currentUser.set(null);
        this.router.navigate(['/auth/login']);
    }

    refreshToken(): Observable<AuthResponse> {
        const refreshToken = this.getRefreshToken();
        return this.api
            .post<AuthResponse>('auth/refresh', { refreshToken })
            .pipe(tap((response) => this.handleAuthResponse(response)));
    }

    getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    }

    getRefreshToken(): string | null {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    private handleAuthResponse(response: AuthResponse): void {
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        this.currentUser.set(response.user);
    }

    private getStoredUser(): User | null {
        const userJson = localStorage.getItem(USER_KEY);
        if (userJson) {
            try {
                return JSON.parse(userJson) as User;
            } catch {
                return null;
            }
        }
        return null;
    }
}
