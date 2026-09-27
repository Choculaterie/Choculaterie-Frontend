import { Injectable, signal } from '@angular/core';
import { loadTranslations } from '@angular/localize';
import { environment } from '../../environments/environment';
import { getLocale, SOURCE_LOCALE } from './locale';

interface CatalogKey {
    id: string;
    sourceText: string;
}

const map = signal<Record<string, string>>({});

export function translateText(text: string): string {
    return map()[text] ?? text;
}

export async function loadTranslationMap(locale: string = getLocale()): Promise<void> {
    if (locale === SOURCE_LOCALE) {
        map.set({});
        return;
    }

    const [bundle, catalog] = await Promise.all([
        fetch(`${environment.apiBasePath}/api/Translations/bundle/${locale}`)
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})),
        fetch('/assets/i18n-messages.json')
            .then((r) => (r.ok ? r.json() : { keys: [] }))
            .catch(() => ({ keys: [] })),
    ]) as [Record<string, string>, { keys: CatalogKey[] }];

    const byText: Record<string, string> = {};
    for (const k of catalog.keys ?? []) {
        const translated = bundle[k.id];
        if (translated) byText[k.sourceText] = translated;
    }

    if (Object.keys(bundle).length) {
        try {
            loadTranslations(bundle);
        } catch {
        }
    }

    map.set(byText);
}

@Injectable({ providedIn: 'root' })
export class TranslationStore {
    load(locale: string = getLocale()): Promise<void> {
        return loadTranslationMap(locale);
    }
}
