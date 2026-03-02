import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { SessionService } from '../services/session.service';
import { ToastService } from '../services/toast.service';
import { AuthService as ApiAuthService } from '../../api/auth';
import { ERRORS } from '../../i18n/labels';

let isRefreshing = false;
const refreshToken$ = new BehaviorSubject<string | null>(null);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const session = inject(SessionService);
    const toast = inject(ToastService);
    const authApi = inject(ApiAuthService);

    return next(req).pipe(
        catchError((error) => {
            // Ignore non-HTTP errors (e.g. TimeoutError handled by timeoutInterceptor)
            if (!(error instanceof HttpErrorResponse)) {
                return throwError(() => error);
            }

            const msg = error.error?.detail ?? error.error?.title ?? error.message;

            switch (error.status) {
                case 0:
                    toast.error(ERRORS.cannotConnect);
                    break;
                case 401: {
                    // Don't refresh on auth-related requests (login, refresh itself)
                    if (req.url.includes('/api/Auth/')) {
                        return throwError(() => error);
                    }

                    if (!session.isAuthenticated()) {
                        return throwError(() => error);
                    }

                    const storedRefresh = session.getRefreshToken();
                    if (!storedRefresh) {
                        session.clear();
                        toast.error(ERRORS.sessionExpired);
                        return throwError(() => error);
                    }

                    if (!isRefreshing) {
                        isRefreshing = true;
                        refreshToken$.next(null);

                        return authApi.postApiAuthRefresh({ refreshToken: storedRefresh }).pipe(
                            switchMap((res) => {
                                isRefreshing = false;
                                session.setSession(res);
                                refreshToken$.next(res.token);
                                // Retry original request with new token
                                return next(req.clone({
                                    setHeaders: { Authorization: `Bearer ${res.token}` },
                                }));
                            }),
                            catchError((refreshErr) => {
                                isRefreshing = false;
                                refreshToken$.next(null);
                                session.clear();
                                toast.error(ERRORS.sessionExpired);
                                return throwError(() => refreshErr);
                            }),
                        );
                    }

                    // Another request is already refreshing — wait for the new token
                    return refreshToken$.pipe(
                        filter((token) => token !== null),
                        take(1),
                        switchMap((token) =>
                            next(req.clone({
                                setHeaders: { Authorization: `Bearer ${token}` },
                            })),
                        ),
                    );
                }
                case 403:
                    router.navigate(['/forbidden']);
                    toast.error(ERRORS.noPermission);
                    break;
                case 500:
                case 502:
                case 503:
                    toast.error(msg ?? ERRORS.serverError(error.status));
                    break;
            }

            return throwError(() => error);
        }),
    );
};
