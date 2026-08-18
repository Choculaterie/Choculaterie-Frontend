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

// Angular ships CLDR data for English only; without registering a locale every
// `| date` binding throws. Add an entry when a language goes live.
const LOCALE_DATA: Record<string, () => Promise<{ default: unknown }>> = {
    fr: () => import('@angular/common/locales/fr'),
};

/** Registers date/number formats for `locale`, or falls back to English formats. */
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

    const [{ bootstrapApplication }, { appConfig }, { App }, { loadTranslationMap }] = await Promise.all([
        import('@angular/platform-browser'),
        import('./app/app.config'),
        import('./app/app'),
        import('./app/core/i18n/translation.store'),
    ]);

    // Brief wait so a translated page does not flash English, but never let the
    // bundle hold up first paint. Both caps start now, so the wait stays bounded.
    const cap = () => new Promise((r) => setTimeout(r, 400));
    const ready = loadTranslationMap(locale).catch(() => undefined);
    const formats = Promise.race([useLocaleFormats(locale), cap().then(() => SOURCE_LOCALE)]);
    const settled = Promise.race([ready, cap()]);

    const formatLocale = await formats;
    await settled;

    // If the map lost the race it lands later and the signal re-renders.
    await bootstrapApplication(App, {
        ...appConfig,
        providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: formatLocale }],
    });
}

main().catch((err) => console.error(err));
