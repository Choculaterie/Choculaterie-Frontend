import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getLocale } from '../../core/i18n/locale';

const TEXT = {
    en: { register: 'By creating an account, you agree to the', pay: 'By paying, you agree to the', terms: 'Terms of Service', and: 'and the', privacy: 'Privacy Policy' },
    fr: { register: 'En créant un compte, vous acceptez les', pay: 'En payant, vous acceptez les', terms: "Conditions d'utilisation", and: 'et la', privacy: 'Politique de confidentialité' },
};

export const LEGAL_LINK_LABELS = {
    terms: getLocale() === 'fr' ? 'Conditions' : 'Terms',
    privacy: getLocale() === 'fr' ? 'Confidentialité' : 'Privacy',
};

@Component({
    selector: 'app-legal-consent',
    standalone: true,
    imports: [RouterLink],
    template: `{{ t[action()] }} <a routerLink="/terms" target="_blank">{{ t.terms }}</a> {{ t.and }} <a routerLink="/privacy" target="_blank">{{ t.privacy }}</a>.`,
    styles: [`a { color: var(--mat-sys-primary); text-decoration: none; } a:hover { text-decoration: underline; }`],
})
export class LegalConsentComponent {
    readonly action = input<'register' | 'pay'>('pay');
    readonly t = getLocale() === 'fr' ? TEXT.fr : TEXT.en;
}
