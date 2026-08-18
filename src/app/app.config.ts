import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslatedPaginatorIntl } from './core/i18n/paginator-intl';
import { ErrorStateMatcher, ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';

import { routes } from './app.routes';
import { baseUrlInterceptor } from './core/interceptors/base-url.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { timeoutInterceptor } from './core/interceptors/timeout.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([baseUrlInterceptor, authInterceptor, errorInterceptor, timeoutInterceptor])),
    provideAnimationsAsync(),
    { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
    { provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher },
    // Focus the dialog container on open instead of the first tabbable control
    // (e.g. a close/download icon button), which otherwise renders with a
    // "stuck" focus/active style until the user clicks elsewhere.
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { autoFocus: 'dialog' } },
  ],
};
