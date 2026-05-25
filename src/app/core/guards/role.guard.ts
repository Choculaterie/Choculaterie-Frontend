import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SessionService } from '../services/session.service';

export const roleGuard: CanActivateFn = (route, state) => {
    const session = inject(SessionService);
    const router = inject(Router);

    const requiredRoles = route.data?.['roles'] as string[] | undefined;

    if (!requiredRoles || requiredRoles.length === 0) {
        return true;
    }

    const user = session.user();
    if (!user) {
        router.navigate(['/auth/login']);
        return false;
    }

    const hasRole = requiredRoles.some(r => r.toLowerCase() === user.role.toLowerCase());
    if (!hasRole) {
        router.navigate(['/forbidden']);
        return false;
    }

    return true;
};
