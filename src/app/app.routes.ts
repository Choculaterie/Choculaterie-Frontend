import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';

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
    {
        path: 'schematics',
        loadComponent: () =>
            import('./features/schematics/schematics-list.component').then((m) => m.SchematicsListComponent),
    },
    {
        path: 'schematics/:id',
        loadComponent: () =>
            import('./features/schematics/schematic-detail.component').then((m) => m.SchematicDetailComponent),
    },
    {
        path: 'mods',
        loadComponent: () =>
            import('./features/mods/mods.component').then((m) => m.ModsComponent),
    },
    {
        path: 'mods/:modName',
        loadComponent: () =>
            import('./features/mods/mod-detail.component').then((m) => m.ModDetailComponent),
    },
    {
        path: 'users/:username',
        loadComponent: () =>
            import('./features/users/public-profile.component').then((m) => m.PublicProfileComponent),
    },
    {
        path: 'profile',
        redirectTo: 'not-found',
    },
    {
        path: 'faq',
        loadComponent: () =>
            import('./features/faq/faq.component').then((m) => m.FaqComponent),
    },
    {
        path: 'admin',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['Admin', 'Mod'] },
        loadComponent: () =>
            import('./features/admin/admin.component').then((m) => m.AdminComponent),
    },
    {
        path: 'viewer',
        loadComponent: () =>
            import('./features/viewer/viewer.component').then((m) => m.ViewerComponent),
    },
    {
        path: 'save-manager/authorize/:flowId',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./features/save-manager/save-manager-authorize.component').then((m) => m.SaveManagerAuthorizeComponent),
    },
    {
        path: 'not-found',
        loadComponent: () =>
            import('./shared/components/not-found/not-found.component').then((m) => m.NotFoundComponent),
    },
    {
        path: 'qs/:id',
        loadComponent: () =>
            import('./features/redirect/short-url-redirect.component').then((m) => m.ShortUrlRedirectComponent),
    },
    {
        path: 'internal/icon-batch',
        loadComponent: () =>
            import('./features/internal/icon-batch-render.component').then((m) => m.IconBatchRenderComponent),
    },
    {
        path: 'internal/qs-render',
        loadComponent: () =>
            import('./features/internal/qs-render.component').then((m) => m.QsRenderComponent),
    },
    {
        path: '**',
        redirectTo: 'not-found',
    },
];
