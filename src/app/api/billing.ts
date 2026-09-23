import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BillingSubscription {
    id: string;
    provider: string;
    status: string;
    externalId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}

export interface OwnSubscriptionResponse {
    isPremium: boolean;
    premiumUntil: string | null;
    subscription: BillingSubscription | null;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
    private http = inject(HttpClient);

    createStripeCheckout(): Observable<{ url: string }> {
        return this.http.post<{ url: string }>('/api/Billing/checkout/stripe', null);
    }

    getSubscription(): Observable<OwnSubscriptionResponse> {
        return this.http.get<OwnSubscriptionResponse>('/api/Billing/subscription');
    }

    cancelSubscription(): Observable<{ message: string }> {
        return this.http.post<{ message: string }>('/api/Billing/cancel', null);
    }

    resumeSubscription(): Observable<{ message: string }> {
        return this.http.post<{ message: string }>('/api/Billing/resume', null);
    }

    adminResetPremiumForTesting(userId: string): Observable<{ message: string; cancelledSubscriptions: string[] }> {
        return this.http.post<{ message: string; cancelledSubscriptions: string[] }>(
            `/api/Admin/users/${userId}/premium/reset-for-testing`, null);
    }
}
