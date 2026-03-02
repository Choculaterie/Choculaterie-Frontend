export enum Badge {
    Admin = 0,
    Moderator = 1,
    Translator = 2,
    Dev = 3,
}

export const BADGE_LABELS: Record<number, string> = {
    [Badge.Admin]: 'Admin',
    [Badge.Moderator]: 'Moderator',
    [Badge.Translator]: 'Translator',
    [Badge.Dev]: 'Developer',
};

export const BADGE_ICONS: Record<number, string> = {
    [Badge.Admin]: 'shield',
    [Badge.Moderator]: 'security',
    [Badge.Translator]: 'translate',
    [Badge.Dev]: 'code',
};

export const BADGE_COLORS: Record<number, string> = {
    [Badge.Admin]: '#e53935',
    [Badge.Moderator]: '#1e88e5',
    [Badge.Translator]: '#43a047',
    [Badge.Dev]: '#8e24aa',
};

/** Maps a badge name string (e.g. "Dev") to its numeric enum value. */
const BADGE_NAME_TO_NUM: Record<string, number> = Object.fromEntries(
    Object.entries(Badge).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v as number]),
);

/** Resolve a badge value from the API (number, string name, or string number) to its enum number. */
export function resolveBadge(badge: unknown): number | undefined {
    if (badge == null) return undefined;
    const n = Number(badge);
    if (!isNaN(n) && n in BADGE_LABELS) return n;
    if (typeof badge === 'string' && badge in BADGE_NAME_TO_NUM) return BADGE_NAME_TO_NUM[badge];
    return undefined;
}
