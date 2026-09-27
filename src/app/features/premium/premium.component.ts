import { Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, inject, signal, computed, viewChild } from '@angular/core';
import { Router } from '@angular/router';
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
    private toast = inject(ToastService);
    private router = inject(Router);
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
    readonly now = signal(Date.now());

    private pollTimer?: ReturnType<typeof setInterval>;
    private clockTimer?: ReturnType<typeof setInterval>;

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

        if (!this.isAuthenticated()) return;
        this.loadingSubscription.set(true);
        this.billing.getSubscription().subscribe({
            next: (s) => { this.subscription.set(s); this.loadingSubscription.set(false); },
            error: () => this.loadingSubscription.set(false),
        });
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    goBack(): void {
        this.location.back();
    }

    subscribe(): void {
        if (!this.requireLogin()) return;
        this.checkingOut.set(true);
        this.billing.createStripeCheckout().subscribe({
            next: (res) => { window.location.href = res.url; },
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
            this.toast.success('Payment confirmed. Premium is active.');
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
}
