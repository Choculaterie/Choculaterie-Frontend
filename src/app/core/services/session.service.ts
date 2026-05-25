import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import type { LoginResponse, OwnProfileResponse } from '../../api/generated.schemas';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

/**
 * Manages session state only (token + user signals).
 * HTTP calls belong to the generated API services in src/app/api.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
    private _user = signal<LoginResponse | null>(this.loadUser());
    private _profile = signal<OwnProfileResponse | null>(null);

    readonly user = this._user.asReadonly();
    readonly profile = this._profile.asReadonly();
    readonly isAuthenticated = computed(() => !!this._user());

    constructor(private router: Router) { }

    isAdminOrMod(): boolean {
        const role = this._user()?.role?.toLowerCase();
        return role === 'admin' || role === 'mod';
    }

    setSession(response: LoginResponse | Omit<LoginResponse, 'filePath'>): void {
        const session: LoginResponse = { filePath: null, ...response };
        localStorage.setItem(TOKEN_KEY, session.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(session));
        this._user.set(session);
        this._profile.set(null); // clear cached profile so fresh data is fetched
    }

    setProfile(profile: OwnProfileResponse): void {
        this._profile.set(profile);
    }

    getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    }

    getRefreshToken(): string | null {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    clear(redirect = true): void {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        this._user.set(null);
        this._profile.set(null);
        if (redirect) this.router.navigate(['/auth/login']);
    }

    private loadUser(): LoginResponse | null {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? (JSON.parse(raw) as LoginResponse) : null;
        } catch {
            return null;
        }
    }
}
