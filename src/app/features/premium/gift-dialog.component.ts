import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LegalConsentComponent } from '../legal/legal-consent.component';
import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/services/toast.service';
import { BillingService, GiftLink, PremiumOffers } from '../../api/billing';

export interface GiftDialogData {
    offers: PremiumOffers | null;
    readyLink?: GiftLink | null;
}

@Component({
    selector: 'app-gift-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
        MatIconModule, MatTooltipModule, FormsModule, DatePipe, TPipe, LegalConsentComponent],
    template: `
<div mat-dialog-title class="dlg-title">
    <span>{{ 'Gift Premium' | t }}</span>
    <button mat-icon-button mat-dialog-close class="close-btn"><mat-icon svgIcon="mc:letters/X"></mat-icon></button>
</div>
<mat-dialog-content class="dlg-content">
    @if (data.readyLink; as r) {
    <div class="ready">
        <strong>{{ 'Your gift link is ready' | t }}</strong>
        <p>{{ 'Send it to anyone. It can be claimed once for' | t }} {{ r.months }} {{ (r.months === 1 ? 'month' : 'months') | t }} {{ 'of Premium.' | t }}</p>
        <div class="ready-row">
            <span class="ready-link">{{ r.link }}</span>
            <button mat-icon-button [matTooltip]="'Copy link' | t" (click)="copy(r.link)"><mat-icon svgIcon="mc:ui/overlapping_sheets"></mat-icon></button>
        </div>
    </div>
    }
    <p class="step">{{ 'Who is it for?' | t }}</p>
    <div class="targets">
        <button type="button" class="target" [class.selected]="mode() === 'user'" [attr.aria-pressed]="mode() === 'user'" (click)="mode.set('user')">
            <mat-icon svgIcon="mc:people/guy"></mat-icon>
            <span class="target-title">{{ 'A player I know' | t }}</span>
            <span class="target-note">{{ 'They get it right away' | t }}</span>
        </button>
        <button type="button" class="target" [class.selected]="mode() === 'link'" [attr.aria-pressed]="mode() === 'link'" (click)="mode.set('link')">
            <mat-icon svgIcon="mc:ui/heart"></mat-icon>
            <span class="target-title">{{ 'Anyone, with a link' | t }}</span>
            <span class="target-note">{{ 'You share the link' | t }}</span>
        </button>
    </div>

    @if (mode() === 'user') {
    <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'Their username' | t }}</mat-label>
        <input matInput required [(ngModel)]="username" (ngModelChange)="onUsername($event)" [matAutocomplete]="auto" maxlength="50" autocomplete="off" />
        <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pickUser($event.option.value)">
            @for (u of suggestions(); track u) {
            <mat-option [value]="u">{{ u }}</mat-option>
            }
        </mat-autocomplete>
    </mat-form-field>
    }

    <p class="step">{{ 'How long?' | t }}</p>
    <div class="plans">
        @for (g of offers()?.gifts ?? []; track g.months) {
        <button type="button" class="plan" [class.selected]="months() === g.months" (click)="months.set(g.months)">
            <span class="plan-months">{{ g.months }} {{ (g.months === 1 ? 'month' : 'months') | t }}</span>
            <span class="plan-price">{{ price(g.amountCents) }}</span>
            <span class="plan-note">{{ price(g.amountCents / g.months) }} {{ '/month' | t }}</span>
            @if (g.listAmountCents > g.amountCents) {
            <span class="plan-badge">{{ discount(g) }}% {{ 'off' | t }}</span>
            }
        </button>
        }
    </div>

    <button mat-flat-button color="primary" class="full pay" [disabled]="busy() || (mode() === 'user' && !username.trim())" (click)="pay()">
        @if (busy()) {<img src="loading.gif" alt="" aria-hidden="true" class="btn-loader" />}
        <span>{{ (mode() === 'link' ? 'Buy gift link' : 'Gift Premium') | t }} &middot; {{ price(selectedPrice()) }}</span>
    </button>

    <p class="legal-consent"><app-legal-consent action="pay" /></p>

    @if (links().length) {
    <h4 class="links-title">{{ 'Your gift links' | t }}</h4>
    @for (l of links(); track l.code) {
    <div class="link-row" [class.done]="l.claimedAt || l.voided">
        <div class="link-text">
            <span>{{ l.months }} {{ (l.months === 1 ? 'month' : 'months') | t }}</span>
            <span class="muted">
                @if (l.voided) { {{ 'Refunded' | t }} }
                @else if (l.claimedAt) { {{ 'Claimed by' | t }} {{ l.claimedBy ?? '?' }} {{ 'on' | t }} {{ l.claimedAt | date:'mediumDate' }} }
                @else { {{ 'Not claimed yet' | t }} }
            </span>
        </div>
        @if (!l.claimedAt && !l.voided) {
        <button mat-icon-button [matTooltip]="'Copy link' | t" (click)="copy(l.link)"><mat-icon svgIcon="mc:ui/overlapping_sheets"></mat-icon></button>
        }
    </div>
    }
    }
</mat-dialog-content>
`,
    styles: [`
        .dlg-title { display: flex; align-items: center; justify-content: space-between; }
        .close-btn { margin-right: -8px; }
        .dlg-content { display: flex; flex-direction: column; gap: 0; min-width: min(460px, 80vw); }
        .step { margin: 0 0 0.5rem; font-size: 0.85rem; opacity: 0.8; }
        .targets { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 20px; }
        .target { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.8rem 0.5rem;
            border: 2px solid var(--mat-sys-outline-variant); border-radius: 12px; background: transparent; color: inherit;
            cursor: pointer; font: inherit; text-align: center; }
        .target:hover { border-color: color-mix(in srgb, var(--mat-sys-primary) 60%, transparent); }
        .target.selected { border-color: var(--mat-sys-primary); background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent); }
        .target mat-icon { width: 24px; height: 24px; margin-bottom: 0.15rem; }
        .target-title { font-size: 0.95rem; }
        .target-note { font-size: 0.75rem; opacity: 0.65; }
        .full { width: 100%; }
        mat-form-field.full { margin-bottom: 20px; }
        .ready { padding: 0.9rem 1rem; margin-bottom: 1.25rem; border-radius: 12px;
            background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
            border: 1px solid color-mix(in srgb, var(--mat-sys-primary) 45%, transparent); }
        .ready p { margin: 0.3rem 0 0.6rem; font-size: 0.85rem; opacity: 0.8; }
        .ready-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
            padding: 0.2rem 0.25rem 0.2rem 0.75rem; border-radius: 10px; background: var(--mat-sys-surface-container-high); }
        .ready-link { font-size: 0.85rem; overflow-wrap: anywhere; }
        .plans { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 20px; padding-top: 10px; }
        @media (max-width: 480px) { .plans { grid-template-columns: repeat(2, 1fr); } }
        .plan { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.75rem 0.25rem;
            border: 2px solid var(--mat-sys-outline-variant); border-radius: 12px; background: transparent; color: inherit;
            cursor: pointer; font: inherit; }
        .plan:hover { border-color: color-mix(in srgb, var(--mat-sys-primary) 60%, transparent); }
        .plan.selected { border-color: var(--mat-sys-primary); background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent); }
        .plan-months { font-size: 0.78rem; opacity: 0.8; }
        .plan-price { font-size: 1.2rem; }
        .plan { position: relative; padding-top: 1.05rem; }
        .plan-note { font-size: 0.72rem; opacity: 0.65; }
        .plan-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); padding: 0.1rem 0.5rem;
            border-radius: 999px; font-size: 0.7rem; white-space: nowrap;
            background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
        .pay { margin-bottom: 0.5rem; }
        .legal-consent { margin: 0.25rem 0 0.5rem; font-size: 0.75rem; text-align: center; color: color-mix(in srgb, var(--mat-sys-on-surface) 65%, transparent); }
        .btn-loader { width: 16px; height: 16px; }
        .links-title { margin: 1rem 0 0.5rem; font-size: 0.85rem; font-weight: 500; }
        .link-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0;
            border-top: 1px solid color-mix(in srgb, var(--mat-sys-outline-variant) 50%, transparent); }
        .link-row.done { opacity: 0.6; }
        .link-text { display: flex; flex-direction: column; font-size: 0.85rem; }
        .muted { color: var(--mat-sys-on-surface-variant); font-size: 0.78rem; }
    `],
})
export class GiftDialogComponent implements OnDestroy {
    readonly data = inject<GiftDialogData>(MAT_DIALOG_DATA);
    private dialogRef = inject(MatDialogRef<GiftDialogComponent>);
    private billing = inject(BillingService);
    private toast = inject(ToastService);

    readonly mode = signal<'user' | 'link'>('user');
    readonly months = signal(1);
    readonly busy = signal(false);
    readonly suggestions = signal<string[]>([]);
    readonly links = signal<GiftLink[]>([]);
    username = '';
    private searchTimer?: ReturnType<typeof setTimeout>;

    readonly offers = signal<PremiumOffers | null>(this.data.offers);
    readonly selectedPrice = computed(() => this.offers()?.gifts.find((g) => g.months === this.months())?.amountCents ?? 0);

    constructor() {
        if (!this.offers()) this.billing.getOffers().subscribe({ next: (o) => this.offers.set(o), error: () => void 0 });
        this.billing.getGiftLinks().subscribe({ next: (l) => this.links.set(l), error: () => void 0 });
    }

    ngOnDestroy(): void {
        clearTimeout(this.searchTimer);
    }

    price(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`;
    }

    discount(g: { amountCents: number; listAmountCents: number }): number {
        return Math.round((1 - g.amountCents / g.listAmountCents) * 100);
    }

    onUsername(q: string): void {
        clearTimeout(this.searchTimer);
        const query = q.trim();
        if (query.length < 2) {
            this.suggestions.set([]);
            return;
        }
        this.searchTimer = setTimeout(() => {
            this.billing.searchUsernames(query).subscribe({ next: (r) => this.suggestions.set(r), error: () => this.suggestions.set([]) });
        }, 250);
    }

    pickUser(name: string): void {
        this.username = name;
        this.suggestions.set([]);
    }

    pay(): void {
        const asLink = this.mode() === 'link';
        const name = this.username.trim();
        if (!asLink && !name) return;
        this.busy.set(true);
        this.billing.createGiftCheckout(asLink ? null : name, this.months(), asLink).subscribe({
            next: (res) => { window.location.href = res.url; },
            error: (err) => {
                this.busy.set(false);
                this.toast.error(err?.error?.message || 'Could not start checkout. Please try again.');
            },
        });
    }

    async copy(link: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(link);
            this.toast.success('Link copied');
        } catch {
            this.toast.error('Could not copy to the clipboard.');
        }
    }

    close(): void {
        this.dialogRef.close();
    }
}
