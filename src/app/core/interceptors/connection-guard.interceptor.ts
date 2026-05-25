import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY } from 'rxjs';
import { RealtimeService } from '../services/realtime.service';

/**
 * Blocks mutation requests (POST, PUT, PATCH, DELETE) when SignalR is
 * disconnected or reconnecting - the server is likely restarting.
 * Auth-related and hub-negotiation requests are always allowed through.
 */
export const connectionGuardInterceptor: HttpInterceptorFn = (req, next) => {
    const realtime = inject(RealtimeService);

    const state = realtime.connectionState();

    // Only guard when we know the connection was lost (not on initial load)
    if (state !== 'reconnecting' && state !== 'disconnected') {
        return next(req);
    }

    // Allow GET / HEAD / OPTIONS (read-only)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next(req);
    }

    // Allow auth endpoints through (login, refresh, revoke)
    if (req.url.includes('/api/Auth/')) {
        return next(req);
    }

    // Allow SignalR negotiation
    if (req.url.includes('/hubs/')) {
        return next(req);
    }

    // Block the request silently - the reconnecting toast is already visible
    return EMPTY;
};
