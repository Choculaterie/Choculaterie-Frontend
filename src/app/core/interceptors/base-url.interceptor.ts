import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/qs/') || req.url.startsWith('/images/') || req.url.startsWith('/files/')) {
        return next(req.clone({ url: `${environment.apiBasePath}${req.url}` }));
    }
    return next(req);
};
