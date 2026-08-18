export enum Role {
    User = 'user',
    Moderator = 'moderator',
    Admin = 'admin',
}

import { BADGES_ROLES } from '../../i18n/labels';

export const ROLE_LABELS: Record<string, string> = {
    [Role.User]: BADGES_ROLES.user,
    [Role.Moderator]: BADGES_ROLES.moderator,
    [Role.Admin]: BADGES_ROLES.admin,
};
