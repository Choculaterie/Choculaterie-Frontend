import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SessionService } from '../services/session.service';

export const authGuard: CanActivateFn = (route, state) => {
    const session = inject(SessionService);
    const router = inject(Router);

    if (session.isAuthenticated()) {
        return true;
    }

    router.navigate(['/auth/register'], { queryParams: { returnUrl: state.url } });
    return false;
};
