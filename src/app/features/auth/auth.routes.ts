import { Routes } from '@angular/router';
import { guestGuard } from '../../core/guards';

export const AUTH_ROUTES: Routes = [
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () =>
            import('./components/login/login.component').then((m) => m.LoginComponent),
    },
    {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () =>
            import('./components/register/register.component').then((m) => m.RegisterComponent),
    },
    {
        path: 'reset-password',
        loadComponent: () =>
            import('./components/password-reset/password-reset.component').then((m) => m.PasswordResetComponent),
    },
];
