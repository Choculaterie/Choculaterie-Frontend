/// <reference types="@angular/localize" />

import { LOCALE_ID } from '@angular/core';
import { getLocale, SOURCE_LOCALE } from './app/core/i18n/locale';

function installStorageFallback(): void {
    try {
        window.localStorage.getItem('__probe');
        return;
    } catch {
        const data = new Map<string, string>();
        const memory: Storage = {
            getItem: (k) => data.get(k) ?? null,
            setItem: (k, v) => { data.set(k, String(v)); },
            removeItem: (k) => { data.delete(k); },
            clear: () => data.clear(),
            key: (i) => [...data.keys()][i] ?? null,
            get length() { return data.size; },
        };
        Object.defineProperty(window, 'localStorage', { value: memory, configurable: true });
    }
}

const LOCALE_DATA: Record<string, () => Promise<{ default: unknown }>> = {
    fr: () => import('@angular/common/locales/fr'),
};

async function useLocaleFormats(locale: string): Promise<string> {
    const load = LOCALE_DATA[locale.split('-')[0]];
    if (!load) return SOURCE_LOCALE;
    try {
        const [{ registerLocaleData }, data] = await Promise.all([import('@angular/common'), load()]);
        registerLocaleData(data.default);
        return locale;
    } catch {
        return SOURCE_LOCALE;
    }
}

async function main(): Promise<void> {
    installStorageFallback();

    let locale = SOURCE_LOCALE;
    try {
        locale = getLocale();
    } catch {
        locale = SOURCE_LOCALE;
    }

    const [{ bootstrapApplication }, { appConfig }, { App }, { loadTranslationMap }, { dropStaleRendererCaches }] = await Promise.all([
        import('@angular/platform-browser'),
        import('./app/app.config'),
        import('./app/app'),
        import('./app/core/i18n/translation.store'),
        import('./app/shared/components/litematic-viewer/resource-pack'),
    ]);

    const cachesFresh = dropStaleRendererCaches().catch(() => undefined);

    const cap = () => new Promise((r) => setTimeout(r, 400));
    const ready = loadTranslationMap(locale).catch(() => undefined);
    const formats = Promise.race([useLocaleFormats(locale), cap().then(() => SOURCE_LOCALE)]);
    const settled = Promise.race([ready, cap()]);

    const formatLocale = await formats;
    await settled;
    await cachesFresh;

    await bootstrapApplication(App, {
        ...appConfig,
        providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: formatLocale }],
    });
}

main().catch((err) => console.error(err));
