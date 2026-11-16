import { SubscriptionActionsService } from '../../core/services/subscription-actions.service';
import { Component, ElementRef, Injector, OnDestroy, OnInit, TemplateRef, afterNextRender, inject, signal, computed, viewChild, viewChildren } from '@angular/core';
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
import { BillingService, GiftClaimInfo, GiftLink, MoneroInvoice, MoneroPlan, OwnSubscriptionResponse, PremiumOffers, ReferralInfo } from '../../api/billing';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { GiftDialogComponent } from './gift-dialog.component';
import { InviteDialogComponent } from './invite-dialog.component';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { toDataURL } from 'qrcode';
import { MatIconModule } from '@angular/material/icon';

const CHECKOUT_HOP_KEY = 'premium-checkout-hop';
const REFERRAL_KEY = 'chocu-referral-code';

@Component({
    selector: 'app-premium',
    standalone: true,
    imports: [MatIconModule, MatDialogModule, 
        TPipe, DatePipe, MatCardModule, MatButtonModule, MatTooltipModule,
        MatProgressBarModule, FormsModule, MatFormFieldModule, MatInputModule, RouterLink,
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

    readonly offers = signal<PremiumOffers | null>(null);
    referralCode = '';
    readonly startingTrial = signal(false);
    readonly myReferral = signal<ReferralInfo | null>(null);
    private dialog = inject(MatDialog);
    readonly showReferral = signal(false);
    readonly claimCode = signal<string | null>(null);
    readonly claimInfo = signal<GiftClaimInfo | null>(null);
    readonly claiming = signal(false);
    readonly giftLinkReady = signal<GiftLink | null>(null);
    readonly waitingGiftLink = signal(false);
    readonly ownProfilePath = computed(() => {
        const username = this.session.user()?.username;
        return username ? `/users/${username}` : '/profile';
    });
    readonly showTrial = computed(() => {
        if (this.loadingSubscription() || this.subscription()?.isPremium) return false;
        const o = this.offers();
        if (!o) return false;
        if (!this.isAuthenticated()) return true;
        return o.trialState === 'Available' || o.trialState === 'NeedsMinecraftLink';
    });
    readonly foundersLeft = computed(() => {
        const o = this.offers();
        return o ? Math.max(0, o.founderSlots - o.foundersTaken) : 0;
    });

    readonly plans = signal<MoneroPlan[]>([]);
    readonly selectedMonths = signal(1);
    readonly invoice = signal<MoneroInvoice | null>(null);
    readonly qr = signal<string | null>(null);
    readonly creatingInvoice = signal(false);
    readonly confirmingCheckout = signal(false);
    readonly celebrating = signal<'stripe' | 'monero' | null>(null);
    readonly fireworks = [
        { cls: 'ball-left', src: 'assets/fireworks/firework_ball.webm', delay: 0 },
        { cls: 'ball-right', src: 'assets/fireworks/firework_ball.webm', delay: 700 },
        { cls: 'star-left', src: 'assets/fireworks/firework_star.webm', delay: 1050 },
        { cls: 'creeper-right', src: 'assets/fireworks/firework_creeper.webm', delay: 1400 },
    ];
    private readonly fireworkEls = viewChildren<ElementRef<HTMLVideoElement>>('firework');
    readonly devTools = ['localhost', '127.0.0.1'].includes(location.hostname);
    private fireworkTimers: ReturnType<typeof setTimeout>[] = [];
    private beforeSimulation: OwnSubscriptionResponse | null = null;
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

    readonly selectedPlan = computed(() =>
        this.plans().find((p) => p.months === this.selectedMonths()) ?? null);

    private checkoutTpl = viewChild<TemplateRef<unknown>>('checkoutTpl');
    private checkoutRef: MatDialogRef<unknown> | null = null;

    readonly selectedCents = computed(() =>
        this.offers()?.plans.find((p) => p.months === this.selectedMonths())?.amountCents ?? 0);

    readonly cheapestMonthly = computed(() => {
        const plans = this.offers()?.plans ?? [];
        if (!plans.length) return this.offers()?.monthlyCents ?? 500;
        return Math.min(...plans.map((p) => Math.floor(p.amountCents / p.months)));
    });

    discount(p: { amountCents: number; listAmountCents: number }): number {
        return Math.round((1 - p.amountCents / p.listAmountCents) * 100);
    }

    syncReferral(code: string): void {
        const ref = code.trim().toUpperCase() || null;
        this.router.navigate([], { queryParams: { ref }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    openCheckout(): void {
        const tpl = this.checkoutTpl();
        if (!tpl || this.checkoutRef) return;
        this.checkoutRef = this.dialog.open(tpl, { width: '620px', maxWidth: '95vw', autoFocus: false });
        this.checkoutRef.afterClosed().subscribe(() => { this.checkoutRef = null; });
    }

    ngOnInit(): void {
        this.billing.getMoneroPlans().subscribe({
            next: (p) => this.plans.set(p),
            error: () => this.plans.set([]),
        });

        try { localStorage.removeItem(REFERRAL_KEY); } catch { void 0; }
        const ref = this.route.snapshot.queryParamMap.get('ref');
        if (ref) {
            this.referralCode = ref.toUpperCase();
            this.showReferral.set(true);
        }
        const claim = this.route.snapshot.queryParamMap.get('claim');
        if (claim) {
            this.claimCode.set(claim.toUpperCase());
            this.billing.getGiftClaim(claim).subscribe({
                next: (c) => this.claimInfo.set(c),
                error: (err) => this.toast.error(err?.error?.message || 'This gift link does not exist.'),
            });
        }
        const giftSession = this.route.snapshot.queryParamMap.get('giftlink');
        if (giftSession && this.isAuthenticated()) {
            this.router.navigate([], { queryParams: { giftlink: null }, queryParamsHandling: 'merge', replaceUrl: true });
            this.waitGiftLink(giftSession, 20);
        }
        if (this.route.snapshot.queryParamMap.get('gift') === 'success') {
            this.toast.success('Thank you! Your gift was sent.');
            this.router.navigate([], { queryParams: { gift: null }, queryParamsHandling: 'merge', replaceUrl: true });
        }
        this.loadOffers();

        const fromCheckout = this.route.snapshot.queryParamMap.get('checkout') === 'success';
        if (fromCheckout) {
            this.router.navigate([], { queryParams: { checkout: null }, queryParamsHandling: 'merge', replaceUrl: true });
        }

        const highlight = this.route.snapshot.queryParamMap.get('highlight');
        if (highlight) this.router.navigate([], { queryParams: { highlight: null }, queryParamsHandling: 'merge', replaceUrl: true });
        if (highlight === 'checkout' || highlight === 'status') {
            setTimeout(() => {
                if (highlight === 'checkout' && this.isAuthenticated() && !this.subscription()?.isPremium) return this.openCheckout();
                const el = document.querySelector(highlight === 'checkout' ? '.checkout-card' : '.status-card');
                if (!el) return;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('attention-flash');
                setTimeout(() => el.classList.remove('attention-flash'), 4000);
            }, 1200);
        }

        if (!this.isAuthenticated()) return;
        this.billing.getReferral().subscribe({
            next: (r) => {
                this.myReferral.set(r);
                if (highlight === 'invite') this.openInvite();
            },
            error: () => void 0,
        });
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

    simulateReturn(source: 'stripe' | 'monero'): void {
        const until = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        const fake: OwnSubscriptionResponse = {
            isPremium: true,
            premiumUntil: until,
            subscription: {
                id: 'local-test', provider: source === 'stripe' ? 'Stripe' : 'Monero', status: 'Active',
                externalId: null, currentPeriodEnd: until, cancelAtPeriodEnd: false,
            },
        };
        clearTimeout(this.checkoutTimer);
        if (this.subscription()?.subscription?.id !== 'local-test') this.beforeSimulation = this.subscription();
        const before = this.beforeSimulation;
        const land = () => {
            this.confirmingCheckout.set(false);
            this.checkoutRef?.close();
            this.subscription.set(fake);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.celebrate(source);
            this.checkoutTimer = setTimeout(() => {
                this.celebrating.set(null);
                this.subscription.set(before);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 5000);
        };
        if (source === 'stripe') {
            this.confirmingCheckout.set(true);
            this.checkoutTimer = setTimeout(land, 1500);
        } else {
            land();
        }
    }

    celebrate(source: 'stripe' | 'monero'): void {
        clearTimeout(this.celebrateTimer);
        this.fireworkTimers.forEach(clearTimeout);
        this.celebrating.set(null);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        requestAnimationFrame(() => {
            this.celebrating.set(source);
            this.celebrateTimer = setTimeout(() => this.celebrating.set(null), 4700);
            afterNextRender(() => {
                this.fireworkTimers = this.fireworkEls().map(({ nativeElement: v }) => setTimeout(() => {
                    v.muted = true;
                    v.play().catch(() => { /* autoplay refused: just skip it */ });
                }, Number(v.dataset['delay'] ?? 0)));
            }, { injector: this.injector });
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
        if (this.devTools) return this.simulateReturn('stripe');
        if (!this.requireLogin()) return;
        this.checkingOut.set(true);
        this.billing.createStripeCheckout(this.selectedMonths(), this.referralCode.trim() || null).subscribe({
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

    selectMonths(months: number): void {
        if (this.invoice()) return;
        this.selectedMonths.set(months);
    }

    price(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`;
    }

    createInvoice(): void {
        if (this.devTools) return this.simulateReturn('monero');
        if (!this.requireLogin()) return;
        this.creatingInvoice.set(true);
        this.billing.createMoneroInvoice(this.selectedMonths(), this.referralCode.trim() || null).subscribe({
            next: (inv) => {
                this.creatingInvoice.set(false);
                this.applyInvoice(inv);
                this.startPolling();
            },
            error: (err) => {
                this.creatingInvoice.set(false);
                this.toast.error(err?.error?.message || 'Could not create a payment. Please try again.');
            },
        });
    }

    private loadOffers(): void {
        this.billing.getOffers().subscribe({ next: (o) => this.offers.set(o), error: () => void 0 });
    }

    startTrial(): void {
        if (!this.requireLogin()) return;
        this.startingTrial.set(true);
        this.billing.startTrial().subscribe({
            next: () => {
                this.startingTrial.set(false);
                this.toast.success('Your 14 day Premium trial has started. Enjoy!');
                this.loadOffers();
                this.billing.getSubscription().subscribe({ next: (s) => this.subscription.set(s) });
            },
            error: (err) => {
                this.startingTrial.set(false);
                this.toast.error(err?.error?.message || 'Could not start the trial. Please try again.');
                this.loadOffers();
            },
        });
    }

    openGift(): void {
        if (!this.requireLogin()) return;
        this.dialog.open(GiftDialogComponent, { data: { offers: this.offers() }, width: '560px', maxWidth: '95vw' });
    }

    openInvite(): void {
        const r = this.myReferral();
        if (!r) return;
        this.dialog.open(InviteDialogComponent, { data: r, width: '520px', maxWidth: '95vw' });
    }

    claim(): void {
        const code = this.claimCode();
        if (!code || !this.requireLogin()) return;
        this.claiming.set(true);
        this.billing.claimGift(code).subscribe({
            next: () => {
                this.claiming.set(false);
                this.claimInfo.set(null);
                this.router.navigate([], { queryParams: { claim: null }, queryParamsHandling: 'merge', replaceUrl: true });
                this.billing.getSubscription().subscribe({ next: (s) => this.subscription.set(s) });
                this.loadOffers();
                this.celebrate('stripe');
                this.toast.success('Enjoy your Premium!');
            },
            error: (err) => {
                this.claiming.set(false);
                this.toast.error(err?.error?.message || 'Could not claim this gift. Please try again.');
            },
        });
    }

    private waitGiftLink(sessionId: string, attemptsLeft: number): void {
        this.waitingGiftLink.set(true);
        this.billing.getGiftForSession(sessionId).subscribe({
            next: (g) => {
                this.waitingGiftLink.set(false);
                this.giftLinkReady.set(g);
                this.dialog.open(GiftDialogComponent, { data: { offers: this.offers(), readyLink: g }, width: '560px', maxWidth: '95vw' });
            },
            error: () => {
                if (attemptsLeft <= 0) {
                    this.waitingGiftLink.set(false);
                    this.toast.error('Your gift link is taking longer than usual. It will appear in Gift Premium once ready.');
                    return;
                }
                this.checkoutTimer = setTimeout(() => this.waitGiftLink(sessionId, attemptsLeft - 1), 1500);
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
            this.checkoutRef?.close();
            this.invoice.set(null);
            this.qr.set(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
