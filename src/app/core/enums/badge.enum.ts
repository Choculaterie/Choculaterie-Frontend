export enum Badge {
    Admin = 0,
    Moderator = 1,
    Translator = 2,
    Dev = 3,
}

import { BADGES_ROLES } from '../../i18n/labels';

export const BADGE_LABELS: Record<number, string> = {
    [Badge.Admin]: BADGES_ROLES.admin,
    [Badge.Moderator]: BADGES_ROLES.moderator,
    [Badge.Translator]: BADGES_ROLES.translator,
    [Badge.Dev]: BADGES_ROLES.developer,
};

export const BADGE_ICONS: Record<number, string> = {
    [Badge.Admin]: '/icons/ui/shield_empty.svg',
    [Badge.Moderator]: '/icons/weapons/sword.svg',
    [Badge.Translator]: '/icons/letters/T.svg',
    [Badge.Dev]: '/icons/weapons/pickaxe.svg',
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
