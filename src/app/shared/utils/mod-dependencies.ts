import { ModListItemResponse } from '../../api/generated.schemas';
import { compareVersions } from './version-sort';

export interface ModDependency {
    title: string;
    version: string | null;
}

export function parseDependencies(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function parseDependency(entry: string): ModDependency {
    const at = entry.lastIndexOf('@');
    if (at > 0 && at < entry.length - 1) {
        return { title: entry.slice(0, at).trim(), version: entry.slice(at + 1).trim() };
    }
    return { title: entry.trim(), version: null };
}

export function dependencyKey(title: string, version: string | null | undefined): string {
    return version ? `${title}@${version}` : title;
}

export function formatModVersion(version: string | null | undefined): string {
    if (!version) return '';
    return /^[vV]\d/.test(version) ? version : `v${version}`;
}

export function dependencyLabel(entry: string): string {
    const { title, version } = parseDependency(entry);
    return version ? `${title} ${formatModVersion(version)}` : title;
}

export function modLabel(mod: ModListItemResponse): string {
    return dependencyLabel(dependencyKey(mod.title, mod.modVersion));
}

function sameTitle(a: string, b: string): boolean {
    return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0 || a.toLowerCase() === b.toLowerCase();
}

function gameVersionsOf(mod: ModListItemResponse): string[] {
    return mod.gameVersion.split(',').map(s => s.trim()).filter(Boolean);
}

export function dependencyOptions(mods: ModListItemResponse[], excludeTitle: string, selected: string[]): string[] {
    const keys = new Set<string>();
    for (const m of mods) {
        if (excludeTitle && sameTitle(m.title, excludeTitle)) continue;
        keys.add(dependencyKey(m.title, m.modVersion));
    }
    for (const d of selected) keys.add(d);
    return [...keys].sort((a, b) => {
        const da = parseDependency(a);
        const db = parseDependency(b);
        const byTitle = da.title.localeCompare(db.title);
        if (byTitle !== 0) return byTitle;
        return compareVersions(db.version ?? '', da.version ?? '');
    });
}

function bestCandidate(
    candidates: ModListItemResponse[], gameVersions: string[], platform: string,
): ModListItemResponse | null {
    if (!candidates.length) return null;
    const wanted = new Set(gameVersions);
    const score = (c: ModListItemResponse): number =>
        (gameVersionsOf(c).some(v => wanted.has(v)) ? 2 : 0) + (c.platform === platform ? 1 : 0);
    return [...candidates].sort((a, b) =>
        score(b) - score(a)
        || compareVersions(b.modVersion ?? '', a.modVersion ?? '')
        || Number(b.id) - Number(a.id),
    )[0];
}

export function pickDependency(
    mods: ModListItemResponse[], title: string, gameVersions: string[], platform: string,
): string {
    const match = bestCandidate(mods.filter(m => sameTitle(m.title, title)), gameVersions, platform);
    return match ? dependencyKey(match.title, match.modVersion) : title;
}

export function resolveDependencyMods(mod: ModListItemResponse, mods: ModListItemResponse[]): ModListItemResponse[] {
    const out: ModListItemResponse[] = [];
    for (const entry of parseDependencies(mod.dependencies)) {
        const { title, version } = parseDependency(entry);
        const byTitle = mods.filter(m => sameTitle(m.title, title));
        const pinned = version ? byTitle.filter(m => m.modVersion === version) : [];
        const match = bestCandidate(pinned.length ? pinned : byTitle, gameVersionsOf(mod), mod.platform);
        if (match) out.push(match);
    }
    return out;
}
