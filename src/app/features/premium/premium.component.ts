import { SubscriptionActionsService } from '../../core/services/subscription-actions.service';
import { Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, inject, signal, computed, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TPipe } from '../../core/i18n/t.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Location } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { BillingService, MoneroInvoice, MoneroPlan, OwnSubscriptionResponse } from '../../api/billing';
import { toDataURL } from 'qrcode';

const CHECKOUT_HOP_KEY = 'premium-checkout-hop';

@Component({
    selector: 'app-premium',
    standalone: true,
    imports: [
        TPipe, DatePipe, MatCardModule, MatButtonModule, MatTooltipModule,
        MatProgressBarModule,
    ],
    templateUrl: './premium.component.html',
    styleUrl: './premium.component.scss',
})
export class PremiumComponent implements OnInit, OnDestroy {
    private session = inject(SessionService);
    private billing = inject(BillingService);
    readonly subscriptionActions = inject(SubscriptionActionsService);
    private toast = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private location = inject(Location);
    private injector = inject(Injector);

    readonly isAuthenticated = this.session.isAuthenticated;
    readonly subscription = signal<OwnSubscriptionResponse | null>(null);
    readonly loadingSubscription = signal(false);
    readonly checkingOut = signal(false);

    readonly showCrypto = signal(false);
    readonly plans = signal<MoneroPlan[]>([]);
    readonly selectedMonths = signal(1);
    readonly invoice = signal<MoneroInvoice | null>(null);
    readonly qr = signal<string | null>(null);
    readonly creatingInvoice = signal(false);
    readonly confirmingCheckout = signal(false);
    readonly celebrating = signal<'stripe' | 'monero' | null>(null);
    readonly now = signal(Date.now());

    private pollTimer?: ReturnType<typeof setInterval>;
    private clockTimer?: ReturnType<typeof setInterval>;
    private checkoutTimer?: ReturnType<typeof setTimeout>;
    private celebrateTimer?: ReturnType<typeof setTimeout>;

    readonly confirmProgress = computed(() => {
        const i = this.invoice();
        if (!i) return 0;
        return Math.min(100, (i.confirmations / i.confirmationsShown) * 100);
    });

    readonly minutesLeft = computed(() => {
        const i = this.invoice();
        if (!i) return 0;
        return Math.max(0, Math.ceil((new Date(i.expiresAt).getTime() - this.now()) / 60000));
    });

    readonly discountLabel = computed(() => {
        const percent = this.plans()[0]?.discountPercent ?? 0;
        return percent > 0 ? `${percent}% off` : '';
    });

    readonly selectedPlan = computed(() =>
        this.plans().find((p) => p.months === this.selectedMonths()) ?? null);

    private cryptoSection = viewChild('cryptoSection', { read: ElementRef<HTMLElement> });

    ngOnInit(): void {
        this.billing.getMoneroPlans().subscribe({
            next: (p) => this.plans.set(p),
            error: () => this.plans.set([]),
        });

        const fromCheckout = this.route.snapshot.queryParamMap.get('checkout') === 'success';
        if (fromCheckout) {
            this.router.navigate([], { queryParams: { checkout: null }, queryParamsHandling: 'merge', replaceUrl: true });
        }

        if (!this.isAuthenticated()) return;
        this.loadingSubscription.set(true);
        this.billing.getSubscription().subscribe({
            next: (s) => {
                this.subscription.set(s);
                this.loadingSubscription.set(false);
                if (fromCheckout) this.awaitCheckoutGrant(s, 15);
            },
            error: () => this.loadingSubscription.set(false),
        });
    }

    ngOnDestroy(): void {
        this.stopPolling();
        clearTimeout(this.checkoutTimer);
        clearTimeout(this.celebrateTimer);
    }

    private awaitCheckoutGrant(s: OwnSubscriptionResponse | null, attemptsLeft: number): void {
        if (s?.isPremium) {
            this.confirmingCheckout.set(false);
            this.toast.success('Payment confirmed. Premium is active.');
            this.celebrate('stripe');
            return;
        }
        if (attemptsLeft <= 0) {
            this.confirmingCheckout.set(false);
            this.toast.info('Your payment is still being processed. Premium will activate shortly.');
            return;
        }
        this.confirmingCheckout.set(true);
        this.checkoutTimer = setTimeout(() => {
            this.billing.getSubscription().subscribe({
                next: (next) => { this.subscription.set(next); this.awaitCheckoutGrant(next, attemptsLeft - 1); },
                error: () => this.awaitCheckoutGrant(null, attemptsLeft - 1),
            });
        }, 2000);
    }

    celebrate(source: 'stripe' | 'monero'): void {
        clearTimeout(this.celebrateTimer);
        this.celebrating.set(null);
        requestAnimationFrame(() => {
            this.celebrating.set(source);
            this.celebrateTimer = setTimeout(() => this.celebrating.set(null), 4000);
        });
    }

    goBack(): void {
        if (this.consumeCheckoutHop()) {
            this.router.navigateByUrl('/');
            return;
        }
        this.location.back();
    }

    private consumeCheckoutHop(): boolean {
        try {
            if (sessionStorage.getItem(CHECKOUT_HOP_KEY) === null) return false;
            sessionStorage.removeItem(CHECKOUT_HOP_KEY);
            return true;
        } catch {
            return false;
        }
    }

    subscribe(): void {
        if (!this.requireLogin()) return;
        this.checkingOut.set(true);
        this.billing.createStripeCheckout().subscribe({
            next: (res) => {
                try { sessionStorage.setItem(CHECKOUT_HOP_KEY, '1'); } catch { void 0; }
                window.location.href = res.url;
            },
            error: (err) => {
                this.checkingOut.set(false);
                this.toast.error(err?.error?.message || 'Could not start checkout. Please try again.');
            },
        });
    }

    toggleCrypto(): void {
        if (!this.requireLogin()) return;
        const opening = !this.showCrypto();
        this.showCrypto.set(opening);
        if (opening) this.scrollToCheckout('center');
    }

    selectMonths(months: number): void {
        if (this.invoice()) return;
        this.selectedMonths.set(months);
    }

    price(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`;
    }

    createInvoice(): void {
        if (!this.requireLogin()) return;
        this.creatingInvoice.set(true);
        this.billing.createMoneroInvoice(this.selectedMonths()).subscribe({
            next: (inv) => {
                this.creatingInvoice.set(false);
                this.applyInvoice(inv);
                this.startPolling();
                this.scrollToCheckout('start');
            },
            error: (err) => {
                this.creatingInvoice.set(false);
                this.toast.error(err?.error?.message || 'Could not create a payment. Please try again.');
            },
        });
    }

    cancelInvoice(): void {
        this.stopPolling();
        this.invoice.set(null);
        this.qr.set(null);
    }

    async copy(value: string, what: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(value);
            this.toast.success(`${what} copied`);
        } catch {
            this.toast.error('Could not copy to the clipboard.');
        }
    }

    private scrollToCheckout(block: ScrollLogicalPosition): void {
        afterNextRender({
            read: () => {
                const el = this.cryptoSection()?.nativeElement;
                if (el) el.scrollIntoView({ behavior: 'smooth', block });
            },
        }, { injector: this.injector });
    }

    private requireLogin(): boolean {
        if (this.isAuthenticated()) return true;
        this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/premium' } });
        return false;
    }

    private applyInvoice(inv: MoneroInvoice): void {
        const previous = this.invoice();
        this.invoice.set(inv);

        if (!previous || previous.paymentUri !== inv.paymentUri) {
            toDataURL(inv.paymentUri, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
                .then((url) => this.qr.set(url))
                .catch(() => this.qr.set(null));
        }

        if (inv.isPaid && !previous?.isPaid) {
            this.stopPolling();
            this.subscription.update((s) => ({ ...s, subscription: s?.subscription ?? null, isPremium: true, premiumUntil: inv.premiumUntil ?? s?.premiumUntil ?? null }));
            this.showCrypto.set(false);
            this.invoice.set(null);
            this.qr.set(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.toast.success('Payment confirmed. Premium is active.');
            this.celebrate('monero');
            this.billing.getSubscription().subscribe({
                next: (s) => this.subscription.set(s),
                error: () => { },
            });
        }
    }

    private startPolling(): void {
        this.stopPolling();
        this.now.set(Date.now());
        this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
        this.pollTimer = setInterval(() => {
            const current = this.invoice();
            if (!current) return;
            this.billing.getMoneroInvoice(current.id).subscribe({
                next: (inv) => this.applyInvoice(inv),
                error: () => { },
            });
        }, 5000);
    }

    private stopPolling(): void {
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.clockTimer) clearInterval(this.clockTimer);
        this.pollTimer = undefined;
        this.clockTimer = undefined;
    }

    cancelSubscription(): void {
        this.subscriptionActions.cancel().subscribe((s) => { if (s) this.subscription.set(s); });
    }

    resumeSubscription(): void {
        this.subscriptionActions.resume().subscribe((s) => { if (s) this.subscription.set(s); });
    }
}
