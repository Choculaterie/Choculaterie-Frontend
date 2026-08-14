/// <reference types="@angular/localize" />

import { loadTranslations } from '@angular/localize';
import { LOCALE_ID } from '@angular/core';
import { environment } from './app/environments/environment';
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

async function applyTranslations(locale: string): Promise<void> {
    if (locale === SOURCE_LOCALE) return;
    try {
        const res = await fetch(`${environment.apiBasePath}/api/Translations/bundle/${locale}`);
        if (!res.ok) return;
        const map = await res.json();
        if (map && typeof map === 'object') loadTranslations(map);
    } catch {
    }
}

async function main(): Promise<void> {
    installStorageFallback();

    let locale = SOURCE_LOCALE;
    try {
        locale = getLocale();
        await applyTranslations(locale);
    } catch {
        locale = SOURCE_LOCALE;
    }

    const { bootstrapApplication } = await import('@angular/platform-browser');
    const { appConfig } = await import('./app/app.config');
    const { App } = await import('./app/app');

    const ref = await bootstrapApplication(App, {
        ...appConfig,
        providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: locale }],
    });

    const { TranslationStore } = await import('./app/core/i18n/translation.store');
    await ref.injector.get(TranslationStore).load(locale);

}

main().catch((err) => console.error(err));
