import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { getLocale, SOURCE_LOCALE } from './locale';

interface CatalogKey {
    id: string;
    sourceText: string;
}

@Injectable({ providedIn: 'root' })
export class TranslationStore {
    private http = inject(HttpClient);

    readonly locale = signal(getLocale());
    private readonly map = signal<Record<string, string>>({});
    readonly revision = signal(0);

    load(locale: string = getLocale()): Promise<void> {
        this.locale.set(locale);
        if (locale === SOURCE_LOCALE) {
            this.map.set({});
            this.revision.update((n) => n + 1);
            return Promise.resolve();
        }

        return Promise.all([
            fetch(`${environment.apiBasePath}/api/Translations/bundle/${locale}`)
                .then((r) => (r.ok ? r.json() : {}))
                .catch(() => ({})),
            fetch('/assets/i18n-messages.json')
                .then((r) => (r.ok ? r.json() : { keys: [] }))
                .catch(() => ({ keys: [] })),
        ]).then(([bundle, catalog]: [Record<string, string>, { keys: CatalogKey[] }]) => {
            const byText: Record<string, string> = {};
            for (const k of catalog.keys ?? []) {
                const translated = bundle[k.id];
                if (translated) byText[k.sourceText] = translated;
            }
            this.map.set(byText);
            this.revision.update((n) => n + 1);
        });
    }

    translate(text: string): string {
        return this.map()[text] ?? text;
    }
}
