import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TimeoutError, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { ToastService } from '../services/toast.service';

const REQUEST_TIMEOUT_MS = 30_000;

export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
    const toast = inject(ToastService);

    return next(req).pipe(
        timeout(REQUEST_TIMEOUT_MS),
        catchError((err) => {
            if (err instanceof TimeoutError) {
                toast.error('Request timed out. Please try again.');
            }
            return throwError(() => err);
        }),
    );
};
