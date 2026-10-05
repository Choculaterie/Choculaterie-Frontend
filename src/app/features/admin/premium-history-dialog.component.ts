import { Component, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
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

export interface PremiumHistoryData {
    userId: string;
    username: string;
    billing: AdminUserBilling | null;
}

interface HistoryRow {
    when: string;
    kind: string;
    source: string;
    amount: string;
    description: string | null;
    grant: AdminPremiumGrant | null;
}

@Component({
    selector: 'app-premium-history-dialog',
    standalone: true,
    imports: [
        MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
        MatTooltipModule, DatePipe, TPipe,
    ],
    template: `
<div mat-dialog-title class="premium-dlg-title">
    <button mat-icon-button [mat-dialog-close]="'back'" class="back-btn" [matTooltip]="'Back' | t">
        <img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" />
    </button>
    <span>{{ data.username }}</span>
</div>

<mat-dialog-content class="premium-dlg-content">
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
                <th>{{ 'When' | t }}</th>
                <th>{{ 'Action' | t }}</th>
                <th>{{ 'Source' | t }}</th>
                <th>{{ 'Amount' | t }}</th>
                <th>{{ 'Description' | t }}</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            @for (r of rows(); track $index) {
            <tr [class.spent]="r.kind === 'Revoked'">
                <td class="col-when">{{ r.when | date:'medium' }}</td>
                <td>{{ r.kind }}</td>
                <td><span class="src src-{{ r.source.toLowerCase() }}">{{ r.source }}</span></td>
                <td class="col-amount">{{ r.amount }}</td>
                <td class="muted">{{ r.description }}</td>
                <td class="col-action">
                    @if (r.grant; as g) {
                    <button mat-button [disabled]="revoking() === g.id" (click)="revoke(g)">{{ 'Revoke' | t }}</button>
                    } @else if (r.kind === 'Granted' && r.source !== 'Admin') {
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
    }
</mat-dialog-content>

`,
    styles: [`
        .premium-dlg-title { display: flex; align-items: center; gap: 0.25rem; font-size: 1rem; }
        .back-btn { margin-left: -8px; flex-shrink: 0; }
        .premium-dlg-content { max-height: 70vh; font-size: 0.85rem; padding-bottom: 1rem; }
        .muted { color: var(--mat-sys-on-surface-variant); }
        .status-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 1.75rem; }
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
        .col-action { text-align: right; white-space: nowrap; }
        .src { padding: 1px 6px; border-radius: 999px; font-size: 0.72rem; background: var(--mat-sys-surface-container-high); }
        .src-stripe { background: color-mix(in srgb, var(--mat-sys-primary) 20%, transparent); }
        .src-monero { background: color-mix(in srgb, var(--mat-sys-tertiary) 22%, transparent); }
        .paid { font-size: 0.75rem; }
    `],
})
export class PremiumHistoryDialogComponent {
    readonly data = inject<PremiumHistoryData>(MAT_DIALOG_DATA);
    readonly dialogRef = inject(MatDialogRef<PremiumHistoryDialogComponent>);
    private billingApi = inject(BillingService);
    private toast = inject(ToastService);
    private confirmDlg = inject(MatDialog);

    readonly billing = signal<AdminUserBilling | null>(this.data.billing);
    readonly loading = signal(false);
    readonly grantMonths = signal<number>(1);
    readonly grantReason = signal<string>('');
    readonly granting = signal(false);
    readonly revoking = signal<string | null>(null);

    constructor() {
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

        for (const g of b.grants) {
            out.push({
                when: g.createdAt,
                kind: 'Granted',
                source: g.source,
                amount: `${g.days} days`,
                description: g.reason,
                grant: g.source === 'Admin' && !g.revokedAt ? g : null,
            });
            if (g.revokedAt) {
                out.push({
                    when: g.revokedAt,
                    kind: 'Revoked',
                    source: g.source,
                    amount: `${g.days} days`,
                    description: g.reason,
                    grant: null,
                });
            }
        }

        for (const p of b.payments) {
            const amount = p.amountCents != null
                ? `$${(p.amountCents / 100).toFixed(2)} ${(p.currency ?? '').toUpperCase()}`
                : '';
            out.push({
                when: p.processedAt,
                kind: 'Payment',
                source: p.provider,
                amount: [amount, p.grantedDays ? `${p.grantedDays} days` : ''].filter(Boolean).join(' · '),
                description: p.eventType,
                grant: null,
            });
        }

        return out.sort((a, b2) => new Date(b2.when).getTime() - new Date(a.when).getTime());
    });

    private load(): void {
        if (!this.billing()) this.loading.set(true);
        this.billingApi.adminGetUserBilling(this.data.userId).subscribe({
            next: (b) => { this.billing.set(b); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }

    grant(): void {
        const months = this.grantMonths();
        if (months < 1) return;
        this.granting.set(true);
        this.billingApi.adminGrantPremium(this.data.userId, months, this.grantReason().trim() || null).subscribe({
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
