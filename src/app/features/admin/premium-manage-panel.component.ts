import { Component, OnInit, inject, input, output, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TPipe } from '../../core/i18n/t.pipe';
import { translateText } from '../../core/i18n/translation.store';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { BillingService } from '../../api/billing';
import type { AdminPremiumGrant, AdminUserBilling } from '../../api/billing';

interface HistoryRow {
    when: string;
    kind: string;
    source: string;
    amount: string;
    description: string | null;
    full: string | null;
    grant: AdminPremiumGrant | null;
    paid: boolean;
    revoked: boolean;
}

const EVENT_LABELS: Record<string, string> = {
    'checkout.session.completed': 'Subscribed',
    'invoice.paid': 'Paid',
    'customer.subscription.updated': 'Changed',
    'customer.subscription.deleted': 'Ended',
    'invoice.payment_failed': 'Payment failed',
    'charge.refunded': 'Refunded',
    'charge.dispute.created': 'Disputed',
};

const GRANT_LABELS: Record<string, string> = {
    Admin: 'Granted by admin',
    Trial: 'Free trial',
    Referral: 'Referral reward',
    Gift: 'Gift received',
    Stripe: 'Paid time',
    Monero: 'Paid time',
};

function shortDetails(details: string | null): string | null {
    if (!details) return null;
    const period = details.match(/^Paid .* \((.+)\)$/);
    if (period) return period[1];
    const cancel = details.match(/^Set to cancel at the end of the period \((.+)\)$/);
    if (cancel) return `Won't renew, ends ${cancel[1]}`;
    const monero = details.match(/^Paid \$[\d.]+ in Monero for (.+)$/);
    if (monero) return monero[1];
    if (details === 'Subscribed with card') return null;
    return details;
}

@Component({
    selector: 'app-premium-manage-panel',
    standalone: true,
    imports: [
        MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
        MatTooltipModule, DatePipe, TPipe,
    ],
    template: `
<div class="premium-panel">
    @if (billing(); as b) {

    <div class="status-row">
        @if (b.isPremium) {
        <span class="status-on">{{ 'Active until' | t }} {{ b.premiumUntil | date:'mediumDate' }}</span>
        <span class="muted">({{ daysLeft() }} {{ 'days left' | t }})</span>
        } @else {
        <span class="muted">{{ 'No premium' | t }}</span>
        }
    </div>

    <div class="grant-row">
        <mat-form-field appearance="outline" class="months-input">
            <mat-label>{{ 'Months' | t }}</mat-label>
            <input matInput type="number" min="1" step="1" [value]="grantMonths()"
                (input)="grantMonths.set(+$any($event.target).value)" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="reason-input">
            <mat-label>{{ 'Reason (optional)' | t }}</mat-label>
            <input matInput maxlength="500" [value]="grantReason()"
                (input)="grantReason.set($any($event.target).value)" />
        </mat-form-field>
        <button mat-flat-button color="primary" [disabled]="granting() || grantMonths() < 1" (click)="grant()">
            {{ 'Grant' | t }}
        </button>
    </div>

    <h4 class="section-title">{{ 'History' | t }}</h4>
    @if (!rows().length) {
    <p class="muted">{{ 'Nothing recorded yet.' | t }}</p>
    } @else {
    <table class="history-table">
        <thead>
            <tr>
                <th>{{ 'Date' | t }}</th>
                <th>{{ 'Event' | t }}</th>
                <th>{{ 'Amount' | t }}</th>
                <th>{{ 'Details' | t }}</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            @for (r of rows(); track $index) {
            <tr [class.spent]="r.revoked">
                <td class="col-when" [matTooltip]="(r.when | date:'medium') ?? ''">{{ r.when | date:'mediumDate' }}</td>
                <td class="col-event">{{ r.kind | t }} <span class="src src-{{ r.source.toLowerCase() }}">{{ r.source }}</span></td>
                <td class="col-amount">{{ r.amount }}</td>
                <td class="muted" [matTooltip]="r.description && r.full && r.full !== r.description ? r.full : ''">{{ r.description }}</td>
                <td class="col-action">
                    @if (r.grant; as g) {
                    <button mat-button [disabled]="revoking() === g.id" (click)="revoke(g)">{{ 'Revoke' | t }}</button>
                    } @else if (r.paid) {
                    <span class="muted paid" [matTooltip]="(r.source === 'Monero'
                        ? 'Paid time cannot be revoked. Monero payments can only be refunded manually from the Choculaterie wallet.'
                        : 'Paid time cannot be revoked. Refund in Stripe instead.') | t">{{ 'paid' | t }}</span>
                    }
                </td>
            </tr>
            }
        </tbody>
    </table>
    }
    } @else {
    <p class="muted">{{ 'Loading' | t }}</p>
    }
</div>

`,
    styles: [`
        :host { display: block; }
        .premium-panel { font-size: 0.85rem; }
        .muted { color: var(--mat-sys-on-surface-variant); }
        .status-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 1.25rem; }
        .status-on { color: var(--mat-sys-primary); }
        .section-title { margin: 1.25rem 0 0.5rem; font-size: 0.85rem; font-weight: 500; }
        .grant-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
        .months-input { width: 110px; }
        .reason-input { flex: 1 1 220px; min-width: 160px; }
        .history-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .history-table th {
            text-align: left; font-weight: 500; padding: 4px 10px 4px 0;
            color: var(--mat-sys-on-surface-variant); border-bottom: 1px solid var(--mat-sys-outline-variant);
        }
        .history-table td { padding: 4px 10px 4px 0; vertical-align: middle; }
        .history-table tbody tr + tr td { border-top: 1px solid color-mix(in srgb, var(--mat-sys-outline-variant) 50%, transparent); }
        .history-table tr.spent { opacity: 0.5; }
        .col-when { white-space: nowrap; color: var(--mat-sys-on-surface-variant); }
        .col-amount { white-space: nowrap; }
        .col-event { white-space: nowrap; }
        .col-event .src { margin-left: 4px; }
        .col-action { text-align: right; white-space: nowrap; }
        .src { padding: 1px 6px; border-radius: 999px; font-size: 0.72rem; background: var(--mat-sys-surface-container-high); }
        .src-stripe { background: color-mix(in srgb, var(--mat-sys-primary) 20%, transparent); }
        .src-monero { background: color-mix(in srgb, var(--mat-sys-tertiary) 22%, transparent); }
        .paid { font-size: 0.75rem; }
    `],
})
export class PremiumManagePanelComponent implements OnInit {
    readonly userId = input.required<string>();
    readonly initialBilling = input<AdminUserBilling | null>(null);
    readonly changed = output<AdminUserBilling>();
    private billingApi = inject(BillingService);
    private toast = inject(ToastService);
    private confirmDlg = inject(MatDialog);

    readonly billing = signal<AdminUserBilling | null>(null);
    readonly loading = signal(false);
    readonly grantMonths = signal<number>(1);
    readonly grantReason = signal<string>('');
    readonly granting = signal(false);
    readonly revoking = signal<string | null>(null);

    ngOnInit(): void {
        this.billing.set(this.initialBilling());
        this.load();
    }

    readonly daysLeft = computed(() => {
        const until = this.billing()?.premiumUntil;
        if (!until) return 0;
        return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86400000));
    });

    readonly rows = computed<HistoryRow[]>(() => {
        const b = this.billing();
        if (!b) return [];
        const out: HistoryRow[] = [];
        const paidEvents = b.payments.filter((p) => p.eventType === 'invoice.paid' && p.grantedDays > 0);
        const matchesPayment = (g: AdminPremiumGrant) => paidEvents.some((p) =>
            p.provider === g.source && p.grantedDays === g.days
            && Math.abs(new Date(p.processedAt).getTime() - new Date(g.createdAt).getTime()) < 120000);

        for (const g of b.grants) {
            const paidGrant = g.source === 'Stripe' || g.source === 'Monero' || g.source === 'Gift';
            if (!g.revokedAt && (g.source === 'Stripe' || g.source === 'Monero') && matchesPayment(g)) continue;
            const reason = g.source === 'Referral' ? null : g.reason;
            out.push({
                when: g.createdAt,
                kind: GRANT_LABELS[g.source] ?? 'Granted',
                source: g.source,
                amount: `+${g.days} days`,
                description: reason,
                full: reason,
                grant: !paidGrant && !g.revokedAt ? g : null,
                paid: paidGrant && !g.revokedAt,
                revoked: false,
            });
            if (g.revokedAt) {
                out.push({
                    when: g.revokedAt,
                    kind: 'Revoked',
                    source: g.source,
                    amount: `-${g.days} days`,
                    description: reason,
                    full: reason,
                    grant: null,
                    paid: false,
                    revoked: true,
                });
            }
        }

        for (const p of b.payments) {
            const money = p.amountCents != null && p.amountCents > 0 ? `$${(p.amountCents / 100).toFixed(2)}` : '';
            const isPaid = p.eventType === 'invoice.paid' && p.grantedDays > 0;
            out.push({
                when: p.processedAt,
                kind: EVENT_LABELS[p.eventType] ?? p.eventType,
                source: p.provider,
                amount: [money, isPaid ? `+${p.grantedDays} days` : ''].filter(Boolean).join(' · '),
                description: shortDetails(p.details ?? null),
                full: p.details ?? p.eventType,
                grant: null,
                paid: isPaid,
                revoked: false,
            });
        }

        const rank = (r: HistoryRow) => ['Subscribed', 'Paid', 'Paid time', 'Changed', 'Payment failed', 'Ended', 'Refunded', 'Disputed', 'Revoked'].indexOf(r.kind);
        return out.sort((a, b2) => {
            const diff = new Date(b2.when).getTime() - new Date(a.when).getTime();
            if (Math.abs(diff) < 60000 && rank(a) !== rank(b2)) return rank(b2) - rank(a);
            return diff;
        });
    });

    private load(): void {
        if (!this.billing()) this.loading.set(true);
        this.billingApi.adminGetUserBilling(this.userId()).subscribe({
            next: (b) => { this.billing.set(b); this.loading.set(false); this.changed.emit(b); },
            error: () => this.loading.set(false),
        });
    }

    grant(): void {
        const months = this.grantMonths();
        if (months < 1) return;
        this.granting.set(true);
        this.billingApi.adminGrantPremium(this.userId(), months, this.grantReason().trim() || null).subscribe({
            next: () => {
                this.granting.set(false);
                this.grantReason.set('');
                this.toast.success(translateText('Premium granted.'));
                this.load();
            },
            error: (err) => {
                this.granting.set(false);
                this.toast.error(err?.error?.message ?? translateText('Could not grant premium.'));
            },
        });
    }

    revoke(g: AdminPremiumGrant): void {
        const dialogData: ConfirmDialogData = {
            title: translateText('Revoke this grant?'),
            message: `${translateText('This removes')} ${g.days} ${translateText('days granted on')} `
                + `${new Date(g.createdAt).toLocaleString()}. ${translateText('Their expiry is recalculated from what remains.')}`,
            confirmText: translateText('Revoke'),
            warn: true,
        };
        this.confirmDlg.open(ConfirmDialogComponent, { data: dialogData }).afterClosed().subscribe((ok) => {
            if (!ok) return;
            this.revoking.set(g.id);
            this.billingApi.adminRevokeGrant(g.id).subscribe({
                next: () => {
                    this.revoking.set(null);
                    this.toast.success(translateText('Grant revoked.'));
                    this.load();
                },
                error: (err) => {
                    this.revoking.set(null);
                    this.toast.error(err?.error?.message ?? translateText('Could not revoke that grant.'));
                },
            });
        });
    }
}
