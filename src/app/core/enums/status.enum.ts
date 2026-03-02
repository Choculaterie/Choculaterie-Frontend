export enum Status {
    Active = 'active',
    Suspended = 'suspended',
    Banned = 'banned',
}

export const STATUS_LABELS: Record<string, string> = {
    [Status.Active]: 'Active',
    [Status.Suspended]: 'Suspended',
    [Status.Banned]: 'Banned',
};
