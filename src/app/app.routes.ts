import { Routes } from '@angular/router';
import { authGuard } from './core/guards';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./features/home/components/home.component').then((m) => m.HomeComponent),
    },
    {
        path: 'auth',
        loadChildren: () =>
            import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
    },
    // Example protected route — uncomment and adapt as needed:
    // {
    //   path: 'dashboard',
    //   canActivate: [authGuard],
    //   loadComponent: () =>
    //     import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    // },
    {
        path: 'not-found',
        loadComponent: () =>
            import('./shared/components/not-found/not-found.component').then((m) => m.NotFoundComponent),
    },
    {
        path: '**',
        redirectTo: 'not-found',
    },
];
