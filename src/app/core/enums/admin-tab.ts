export const ADMIN_TAB = {
    users: 0,
    schematics: 1,
    liveMessages: 2,
    modMessages: 3,
    promotions: 4,
    plugins: 5,
    storage: 6,
    tags: 7,
    versions: 8,
    faq: 9,
    tickets: 10,
    serverLogs: 11,
} as const;

export type AdminTab = (typeof ADMIN_TAB)[keyof typeof ADMIN_TAB];
