export const ADMIN_TAB = {
    users: 0,
    schematics: 1,
    liveMessages: 2,
    modMessages: 3,
    plugins: 4,
    storage: 5,
    tags: 6,
    versions: 7,
    faq: 8,
    tickets: 9,
    serverLogs: 10,
} as const;

export type AdminTab = (typeof ADMIN_TAB)[keyof typeof ADMIN_TAB];
