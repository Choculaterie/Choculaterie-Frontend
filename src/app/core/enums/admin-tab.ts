export const ADMIN_TAB = {
    users: 0,
    schematics: 1,
    storage: 2,
    videos: 3,
    promotions: 4,
    plugins: 5,
    liveMessages: 6,
    modMessages: 7,
    faq: 8,
    versions: 9,
    tags: 10,
    tickets: 11,
    serverLogs: 12,
} as const;

export type AdminTab = (typeof ADMIN_TAB)[keyof typeof ADMIN_TAB];
