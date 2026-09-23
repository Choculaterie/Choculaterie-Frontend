import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TPipe } from '../../core/i18n/t.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Location } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { BillingService, OwnSubscriptionResponse } from '../../api/billing';

@Component({
    selector: 'app-premium',
    standalone: true,
    imports: [TPipe, DatePipe, MatCardModule, MatButtonModule, MatTooltipModule],
    templateUrl: './premium.component.html',
    styleUrl: './premium.component.scss',
})
export class PremiumComponent implements OnInit {
    private session = inject(SessionService);
    private billing = inject(BillingService);
    private toast = inject(ToastService);
    private router = inject(Router);
    private location = inject(Location);

    readonly isAuthenticated = this.session.isAuthenticated;
    readonly subscription = signal<OwnSubscriptionResponse | null>(null);
    readonly loadingSubscription = signal(false);
    readonly checkingOut = signal(false);

    ngOnInit(): void {
        if (!this.isAuthenticated()) return;
        this.loadingSubscription.set(true);
        this.billing.getSubscription().subscribe({
            next: (s) => { this.subscription.set(s); this.loadingSubscription.set(false); },
            error: () => this.loadingSubscription.set(false),
        });
    }

    goBack(): void {
        this.location.back();
    }

    subscribe(): void {
        if (!this.isAuthenticated()) {
            this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/premium' } });
            return;
        }
        this.checkingOut.set(true);
        this.billing.createStripeCheckout().subscribe({
            next: (res) => { window.location.href = res.url; },
            error: (err) => {
                this.checkingOut.set(false);
                this.toast.error(err?.error?.message || 'Could not start checkout. Please try again.');
            },
        });
    }
}
