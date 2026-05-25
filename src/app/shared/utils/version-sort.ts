/**
 * Compare two version strings semantically.
 * Splits on '.' and compares each segment numerically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(s => parseInt(s, 10) || 0);
    const pb = b.split('.').map(s => parseInt(s, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

/**
 * Sort an array of objects with a `name` property by semantic version (descending).
 */
export function sortVersionsDesc<T extends { name: string }>(versions: T[]): T[] {
    return [...versions].sort((a, b) => compareVersions(b.name, a.name));
}
