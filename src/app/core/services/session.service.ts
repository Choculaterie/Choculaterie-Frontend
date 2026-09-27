import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import type { LoginResponse, OwnProfileResponse } from '../../api/generated.schemas';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';
const IMPERSONATOR_KEY = 'auth_impersonator';

@Injectable({ providedIn: 'root' })
export class SessionService {
    private _user = signal<LoginResponse | null>(this.loadUser());
    private _profile = signal<OwnProfileResponse | null>(null);

    readonly user = this._user.asReadonly();
    readonly profile = this._profile.asReadonly();
    readonly isAuthenticated = computed(() => !!this._user());

    private _impersonating = signal(!!this.loadImpersonator());
    readonly isImpersonating = this._impersonating.asReadonly();
    readonly impersonator = computed(() => this.loadImpersonator());

    constructor(private router: Router) { }

    isAdminOrMod(): boolean {
        const role = this._user()?.role?.toLowerCase();
        return role === 'admin' || role === 'mod';
    }

    setSession(response: LoginResponse | Omit<LoginResponse, 'filePath'>, keepImpersonator = false): void {
        const session: LoginResponse = { filePath: null, ...response };
        localStorage.setItem(TOKEN_KEY, session.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(session));
        if (!keepImpersonator) {
            localStorage.removeItem(IMPERSONATOR_KEY);
            this._impersonating.set(false);
        }
        this._user.set(session);
        this._profile.set(null);
    }

    beginImpersonation(response: LoginResponse | Omit<LoginResponse, 'filePath'>): void {
        const current = this._user();
        if (current && !localStorage.getItem(IMPERSONATOR_KEY)) {
            localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(current));
        }
        this.setSession(response, true);
        this._impersonating.set(true);
    }

    stopImpersonation(): LoginResponse | null {
        const previous = this.loadImpersonator();
        if (!previous) return null;
        localStorage.removeItem(IMPERSONATOR_KEY);
        this._impersonating.set(false);
        this.setSession(previous);
        return previous;
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
        const restored = this.stopImpersonation();
        if (restored) {
            if (redirect) this.router.navigate(['/admin']);
            return;
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(IMPERSONATOR_KEY);
        this._impersonating.set(false);
        this._user.set(null);
        this._profile.set(null);
        if (redirect) this.router.navigate(['/auth/login']);
    }

    private loadImpersonator(): LoginResponse | null {
        try {
            const raw = localStorage.getItem(IMPERSONATOR_KEY);
            return raw ? (JSON.parse(raw) as LoginResponse) : null;
        } catch {
            return null;
        }
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
