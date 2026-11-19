import { Location } from '@angular/common';

function currentParams(): URLSearchParams {
    return typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
}

export function queryParam(name: string): string | null {
    return currentParams().get(name);
}

export function queryInt(name: string, fallback: number, allowed?: readonly number[]): number {
    const value = Number.parseInt(queryParam(name) ?? '', 10);
    if (Number.isNaN(value) || value < 0) return fallback;
    return allowed && !allowed.includes(value) ? fallback : value;
}

export function updateQuery(location: Location, patch: Record<string, string | number | boolean | null | undefined>): void {
    if (typeof window === 'undefined') return;
    const params = currentParams();
    for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '' || value === false) params.delete(key);
        else params.set(key, String(value));
    }
    const qs = params.toString();
    location.replaceState(window.location.pathname, qs);
}
