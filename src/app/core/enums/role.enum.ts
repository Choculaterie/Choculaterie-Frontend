export enum Role {
    User = 'user',
    Moderator = 'moderator',
    Admin = 'admin',
}

export const ROLE_LABELS: Record<string, string> = {
    [Role.User]: 'User',
    [Role.Moderator]: 'Moderator',
    [Role.Admin]: 'Admin',
};
