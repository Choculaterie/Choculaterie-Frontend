import { unzipSync, strFromU8 } from 'fflate';
import { compareVersions } from './version-sort';

const BUILTIN_DEP_IDS = new Set([
    'minecraft',
    'java',
    'fabricloader',
    'fabric-loader',
    'fabric',
    'fabric-api',
    'fabricapi',
    'quilt_loader',
    'quilt-loader',
    'quilted_fabric_api',
    'qsl',
    'forge',
    'neoforge',
    'neoform',
]);

export interface ParsedModJar {
    modId: string | null;
    name: string | null;
    description: string | null;
    platform: string | null;
    gameVersions: string[];
    dependencyIds: string[];
    dependencyTitles: string[];
    unresolvedDependencies: string[];
    iconFile: File | null;
}

export interface ParseModJarOptions {
    allowedGameVersions: string[];
    siteModTitles: string[];
}

export async function parseModJar(file: File, options: ParseModJarOptions): Promise<ParsedModJar | null> {
    try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const files = unzipSync(buf);

        const fabricKey = Object.keys(files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('fabric.mod.json'));
        const quiltKey = Object.keys(files).find(k => k.replace(/\\/g, '/').toLowerCase().endsWith('quilt.mod.json'));
        const metaKey = fabricKey ?? quiltKey;
        if (!metaKey) return null;

        const meta = JSON.parse(strFromU8(files[metaKey])) as FabricModJson;
        const platform = fabricKey ? 'Fabric' : 'Quilt';
        const depends = meta.depends ?? {};
        const mcConstraint = depends['minecraft'];
        const gameVersions = matchMinecraftVersions(
            typeof mcConstraint === 'string' ? mcConstraint : Array.isArray(mcConstraint) ? mcConstraint.join(' ') : null,
            options.allowedGameVersions,
        );

        const dependencyIds = Object.keys(depends)
            .filter(id => !BUILTIN_DEP_IDS.has(id.toLowerCase()));

        const { titles, unresolved } = resolveDependencyTitles(dependencyIds, options.siteModTitles);

        let iconFile: File | null = null;
        if (meta.icon) {
            const iconPath = meta.icon.replace(/\\/g, '/');
            const iconKey = Object.keys(files).find(k => k.replace(/\\/g, '/') === iconPath)
                ?? Object.keys(files).find(k => k.replace(/\\/g, '/').toLowerCase() === iconPath.toLowerCase());
            if (iconKey) {
                const bytes = files[iconKey];
                const ext = iconPath.includes('.') ? iconPath.slice(iconPath.lastIndexOf('.')) : '.png';
                const mime = ext.toLowerCase() === '.png' ? 'image/png'
                    : ext.toLowerCase() === '.jpg' || ext.toLowerCase() === '.jpeg' ? 'image/jpeg'
                    : 'application/octet-stream';
                iconFile = new File([bytes], `icon${ext}`, { type: mime });
            }
        }

        return {
            modId: meta.id ?? null,
            name: meta.name ?? null,
            description: meta.description ?? null,
            platform,
            gameVersions,
            dependencyIds,
            dependencyTitles: titles,
            unresolvedDependencies: unresolved,
            iconFile,
        };
    } catch {
        return null;
    }
}

interface FabricModJson {
    id?: string;
    name?: string;
    description?: string;
    icon?: string;
    depends?: Record<string, string | string[]>;
}

function normalizeId(s: string): string {
    return s.toLowerCase().replace(/[\s_+]+/g, '-').replace(/[^a-z0-9.-]/g, '');
}

function resolveDependencyTitles(ids: string[], siteTitles: string[]): { titles: string[]; unresolved: string[] } {
    const byNorm = new Map(siteTitles.map(t => [normalizeId(t), t]));
    const titles: string[] = [];
    const unresolved: string[] = [];
    for (const id of ids) {
        const match = byNorm.get(normalizeId(id));
        if (match) titles.push(match);
        else unresolved.push(id);
    }
    return { titles: [...new Set(titles)], unresolved: [...new Set(unresolved)] };
}

export function matchMinecraftVersions(constraint: string | null | undefined, allowed: string[]): string[] {
    if (!constraint?.trim() || allowed.length === 0) return [];
    const c = constraint.trim();
    if (c === '*') return [...allowed];

    const matched = allowed.filter(v => versionSatisfies(v, c));
    if (matched.length > 0) return matched;

    const tokens = c.match(/\d+(?:\.\d+)*/g) ?? [];
    const fallback = new Set<string>();
    for (const t of tokens) {
        for (const a of allowed) {
            if (a === t || a.startsWith(t + '.') || t.startsWith(a + '.')) fallback.add(a);
        }
    }
    return [...fallback];
}

function versionSatisfies(version: string, range: string): boolean {
    const parts = range.trim().split(/\s+/).filter(Boolean);
    return parts.every(part => satisfiesAtom(version, part));
}

function satisfiesAtom(version: string, atom: string): boolean {
    if (atom === '*') return true;

    const tilde = atom.match(/^~(.+)$/);
    if (tilde) {
        const base = tilde[1];
        const segs = base.split('.');
        if (segs.length === 1) {
            return version === base || version.startsWith(base + '.');
        }
        const upper = segs.length === 2
            ? `${segs[0]}.${(parseInt(segs[1], 10) || 0) + 1}`
            : `${segs[0]}.${(parseInt(segs[1], 10) || 0) + 1}.0`;
        return compareVersions(version, base) >= 0 && compareVersions(version, upper) < 0;
    }

    const caret = atom.match(/^\^(.+)$/);
    if (caret) {
        const base = caret[1];
        const segs = base.split('.');
        const upper = `${(parseInt(segs[0], 10) || 0) + 1}.0`;
        return compareVersions(version, base) >= 0 && compareVersions(version, upper) < 0;
    }

    const op = atom.match(/^(>=|<=|>|<|=)(.+)$/);
    if (op) {
        const [, operator, raw] = op;
        const target = raw.trim();
        const cmp = compareVersions(version, target);
        switch (operator) {
            case '>=': return cmp >= 0;
            case '<=': return cmp <= 0;
            case '>': return cmp > 0;
            case '<': return cmp < 0;
            case '=': return cmp === 0;
        }
    }

    if (version === atom) return true;
    if (version.startsWith(atom + '.')) return true;
    return false;
}
