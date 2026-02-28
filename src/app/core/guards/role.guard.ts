import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const requiredRoles = route.data?.['roles'] as string[] | undefined;

    if (!requiredRoles || requiredRoles.length === 0) {
        return true;
    }

    const user = authService.user();
    if (!user) {
        router.navigate(['/auth/login']);
        return false;
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
        router.navigate(['/forbidden']);
        return false;
    }

    return true;
};
