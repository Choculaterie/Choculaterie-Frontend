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

export interface AdminPremiumGrant {
    id: string;
    source: string;
    days: number;
    createdAt: string;
    revokedAt: string | null;
    grantedByUserId: string | null;
    reason: string | null;
}

export interface AdminUserBilling {
    isPremium: boolean;
    premiumUntil: string | null;
    subscription: BillingSubscription | null;
    grants: AdminPremiumGrant[];
    payments: {
        id: string; provider: string; eventType: string; amountCents: number | null;
        currency: string | null; grantedDays: number; providerRef: string | null; processedAt: string;
    }[];
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

    adminGetUserBilling(userId: string): Observable<AdminUserBilling> {
        return this.http.get<AdminUserBilling>(`/api/Admin/users/${userId}/billing`);
    }

    adminGrantPremium(userId: string, months: number, reason: string | null): Observable<AdminPremiumGrant> {
        return this.http.post<AdminPremiumGrant>(`/api/Admin/users/${userId}/premium`, { months, reason });
    }

    adminRevokeGrant(grantId: string): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`/api/Admin/premium-grants/${grantId}`);
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
