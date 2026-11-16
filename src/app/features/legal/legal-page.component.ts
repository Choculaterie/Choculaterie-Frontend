import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getLocale } from '../../core/i18n/locale';
import { TERMS_EN, TERMS_FR, TERMS_UPDATED } from './terms.content';
import { PRIVACY_EN, PRIVACY_FR, PRIVACY_UPDATED } from './privacy.content';

type LegalDoc = 'terms' | 'privacy';
type LegalLang = 'en' | 'fr';

const TITLES: Record<LegalDoc, Record<LegalLang, string>> = {
    terms: { en: 'Terms of Service', fr: "Conditions d'utilisation" },
    privacy: { en: 'Privacy Policy', fr: 'Politique de confidentialité' },
};

@Component({
    selector: 'app-legal-page',
    standalone: true,
    imports: [RouterLink],
    template: `
<article class="legal-page">
    <header class="legal-head">
        <h1>{{ title() }}</h1>
        <p class="updated">{{ lang() === 'fr' ? 'Dernière mise à jour : ' : 'Last updated: ' }}{{ updated() }}</p>
        <nav class="legal-nav">
            <button type="button" class="text-link" [class.active]="lang() === 'en'" (click)="lang.set('en')">English</button>
            <span class="dot">&middot;</span>
            <button type="button" class="text-link" [class.active]="lang() === 'fr'" (click)="lang.set('fr')">Français</button>
            <span class="sep"></span>
            @if (doc() === 'terms') {
            <a routerLink="/privacy" class="text-link">{{ titles.privacy[lang()] }}</a>
            } @else {
            <a routerLink="/terms" class="text-link">{{ titles.terms[lang()] }}</a>
            }
        </nav>
    </header>
    <div class="legal-body" [innerHTML]="body()"></div>
</article>
`,
    styles: [`
        :host { display: block; }
        .legal-page { max-width: 820px; margin: 0 auto; padding: 2rem 1rem 4rem; line-height: 1.65; }
        .legal-head { margin-bottom: 2rem; }
        h1 { font: var(--mat-sys-headline-large); margin: 0 0 0.35rem; }
        .updated { margin: 0 0 0.75rem; opacity: 0.65; font-size: 0.85rem; }
        .legal-nav { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.9rem; }
        .legal-nav .dot { opacity: 0.5; }
        .legal-nav .sep { flex: 1; }
        .text-link { font: inherit; color: var(--mat-sys-primary); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: none; }
        .text-link:hover { text-decoration: underline; }
        .text-link.active { color: var(--mat-sys-on-surface); cursor: default; text-decoration: none; }
        .legal-body { font-size: 0.95rem; }
        .legal-body ::ng-deep .lead { font-size: 1rem; }
        .legal-body ::ng-deep h2 { font-size: 1.25rem; margin: 2rem 0 0.6rem; }
        .legal-body ::ng-deep h3 { font-size: 1.05rem; margin: 1.25rem 0 0.4rem; }
        .legal-body ::ng-deep p { margin: 0 0 0.8rem; }
        .legal-body ::ng-deep ul { margin: 0 0 0.8rem; padding-left: 1.3rem; }
        .legal-body ::ng-deep li { margin-bottom: 0.35rem; }
        .legal-body ::ng-deep a { color: var(--mat-sys-primary); }
        .legal-body ::ng-deep table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.9rem; }
        .legal-body ::ng-deep th, .legal-body ::ng-deep td { text-align: left; vertical-align: top; padding: 0.6rem 0.75rem;
            border: 1px solid var(--mat-sys-outline-variant); }
        .legal-body ::ng-deep th { background: var(--mat-sys-surface-container); }
        @media (max-width: 600px) {
            .legal-body ::ng-deep table, .legal-body ::ng-deep tbody, .legal-body ::ng-deep tr, .legal-body ::ng-deep td { display: block; width: 100%; }
            .legal-body ::ng-deep thead { display: none; }
            .legal-body ::ng-deep td { border-bottom: 0; }
            .legal-body ::ng-deep tr { border-bottom: 1px solid var(--mat-sys-outline-variant); margin-bottom: 0.75rem; }
        }
    `],
})
export class LegalPageComponent {
    private route = inject(ActivatedRoute);

    readonly titles = TITLES;
    readonly doc = signal<LegalDoc>(this.route.snapshot.data['doc'] === 'privacy' ? 'privacy' : 'terms');
    readonly lang = signal<LegalLang>(getLocale() === 'fr' ? 'fr' : 'en');

    readonly title = computed(() => TITLES[this.doc()][this.lang()]);
    readonly updated = computed(() => this.doc() === 'terms' ? TERMS_UPDATED : PRIVACY_UPDATED);
    readonly body = computed(() => {
        if (this.doc() === 'terms') return this.lang() === 'fr' ? TERMS_FR : TERMS_EN;
        return this.lang() === 'fr' ? PRIVACY_FR : PRIVACY_EN;
    });

    constructor() {
        this.route.data.subscribe((d) => this.doc.set(d['doc'] === 'privacy' ? 'privacy' : 'terms'));
    }
}
