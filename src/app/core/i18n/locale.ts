export const SOURCE_LOCALE = 'en';
export const SUPPORTED_LOCALES = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

const STORAGE_KEY = 'choculaterie.locale';

export function getLocale(): string {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(stored)) return stored;
    } catch {
        return SOURCE_LOCALE;
    }

    try {
        const browser = navigator.language?.split('-')[0];
        if (browser && SUPPORTED_LOCALES.some((l) => l.code === browser)) return browser;
    } catch {
        return SOURCE_LOCALE;
    }

    return SOURCE_LOCALE;
}

export function persistLocale(code: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, code);
    } catch {
    }
}

export function setLocale(code: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, code);
    } catch {
    }
    location.reload();
}
