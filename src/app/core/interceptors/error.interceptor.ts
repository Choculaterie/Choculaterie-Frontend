import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            switch (error.status) {
                case 401:
                    authService.logout();
                    break;
                case 403:
                    router.navigate(['/forbidden']);
                    break;
                case 404:
                    router.navigate(['/not-found']);
                    break;
                case 500:
                    console.error('Server error:', error.message);
                    break;
                default:
                    console.error('HTTP error:', error.status, error.message);
                    break;
            }

            return throwError(() => error);
        }),
    );
};
