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

export interface MoneroPlan {
    months: number;
    usdCents: number;
    listUsdCents: number;
    discountPercent: number;
}

export interface MoneroInvoice {
    id: string;
    months: number;
    usdCents: number;
    xmr: string;
    atomicXmr: number;
    usdPerXmr: number;
    address: string;
    paymentUri: string;
    status: 'Pending' | 'Confirming' | 'Paid' | 'Expired' | 'Underpaid';
    receivedXmr: string;
    receivedAtomic: number;
    confirmations: number;
    confirmationsToGrant: number;
    confirmationsShown: number;
    createdAt: string;
    expiresAt: string;
    paidAt: string | null;
    isPaid: boolean;
    premiumUntil: string | null;
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

    getMoneroPlans(): Observable<MoneroPlan[]> {
        return this.http.get<MoneroPlan[]>('/api/Billing/monero/plans');
    }

    createMoneroInvoice(months: number): Observable<MoneroInvoice> {
        return this.http.post<MoneroInvoice>('/api/Billing/monero/invoice', { months });
    }

    getMoneroInvoice(id: string): Observable<MoneroInvoice> {
        return this.http.get<MoneroInvoice>(`/api/Billing/monero/invoice/${id}`);
    }
}
