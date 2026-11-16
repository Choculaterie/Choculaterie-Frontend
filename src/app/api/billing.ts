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
    minecraftAccounts?: { minecraftUUID: string; minecraftUsername: string | null; linkedAt: string; unlinkedAt: string | null; linkMethod: string }[];
    referralCode?: string | null;
    referralsGiven?: ReferralSummary[];
    referredBy?: ReferralSummary | null;
    payments: {
        id: string; provider: string; eventType: string; amountCents: number | null;
        currency: string | null; grantedDays: number; providerRef: string | null; processedAt: string; details?: string | null;
    }[];
}

export interface ReferralSummary {
    userName: string | null;
    status: string;
    createdAt: string;
    rewardedAt: string | null;
}

export type TrialState = 'Available' | 'NeedsMinecraftLink' | 'AlreadyPremium' | 'MinecraftAccountUsed';

export interface PremiumOffers {
    currency: string;
    monthlyCents: number;
    yearlyCents: number;
    yearlyDiscountPercent: number;
    gifts: { months: number; amountCents: number; listAmountCents: number }[];
    plans: { months: number; amountCents: number; listAmountCents: number }[];
    trialDays: number;
    trialState: TrialState | null;
    founderSlots: number;
    foundersTaken: number;
}

export interface GiftLink {
    code: string;
    link: string;
    months: number;
    createdAt: string;
    claimedBy: string | null;
    claimedAt: string | null;
    voided: boolean;
}

export interface GiftClaimInfo {
    months: number;
    from: string | null;
    claimed: boolean;
    voided: boolean;
}

export interface ReferralInfo {
    code: string;
    link: string;
    rewarded: number;
    pending: number;
    rewardsThisYear: number;
    rewardsPerYear: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
    private http = inject(HttpClient);

    createStripeCheckout(months = 1, referralCode: string | null = null): Observable<{ url: string }> {
        return this.http.post<{ url: string }>('/api/Billing/checkout/stripe', { months, referralCode: referralCode || null });
    }

    getOffers(): Observable<PremiumOffers> {
        return this.http.get<PremiumOffers>('/api/Billing/offers');
    }

    startTrial(): Observable<{ premiumUntil: string }> {
        return this.http.post<{ premiumUntil: string }>('/api/Billing/trial', null);
    }

    getReferral(): Observable<ReferralInfo> {
        return this.http.get<ReferralInfo>('/api/Billing/referral');
    }

    createGiftCheckout(username: string | null, months: number, asLink = false): Observable<{ url: string }> {
        return this.http.post<{ url: string }>('/api/Billing/gift/stripe', { username, months, asLink });
    }

    getGiftLinks(): Observable<GiftLink[]> {
        return this.http.get<GiftLink[]>('/api/Billing/gift/links');
    }

    getGiftForSession(sessionId: string): Observable<GiftLink> {
        return this.http.get<GiftLink>(`/api/Billing/gift/session/${encodeURIComponent(sessionId)}`);
    }

    getGiftClaim(code: string): Observable<GiftClaimInfo> {
        return this.http.get<GiftClaimInfo>(`/api/Billing/gift/claim/${encodeURIComponent(code)}`);
    }

    claimGift(code: string): Observable<{ months: number; premiumUntil: string }> {
        return this.http.post<{ months: number; premiumUntil: string }>(`/api/Billing/gift/claim/${encodeURIComponent(code)}`, null);
    }

    searchUsernames(q: string): Observable<string[]> {
        return this.http.get<string[]>('/api/UserBrowse/search', { params: { q } });
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

    createMoneroInvoice(months: number, referralCode: string | null = null): Observable<MoneroInvoice> {
        return this.http.post<MoneroInvoice>('/api/Billing/monero/invoice', { months, referralCode: referralCode || null });
    }

    getMoneroInvoice(id: string): Observable<MoneroInvoice> {
        return this.http.get<MoneroInvoice>(`/api/Billing/monero/invoice/${id}`);
    }
}
