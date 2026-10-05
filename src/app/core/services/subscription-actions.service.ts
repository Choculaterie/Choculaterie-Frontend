import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { EMPTY, Observable, catchError, filter, finalize, of, switchMap, tap } from 'rxjs';
import { BillingService, OwnSubscriptionResponse } from '../../api/billing';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SubscriptionActionsService {
    private dialog = inject(MatDialog);
    private billing = inject(BillingService);
    private toast = inject(ToastService);

    readonly cancelling = signal(false);
    readonly resuming = signal(false);

    cancel(): Observable<OwnSubscriptionResponse | null> {
        return this.confirmThen({
            title: 'Cancel Premium subscription?',
            message: 'Here is what happens if you cancel:',
            bullets: [
                'You keep every Premium perk until the end of your current billing period.',
                'You will not be charged again after that.',
                'Your worlds and files are never deleted.',
                'You can resubscribe at any time.',
            ],
            confirmText: 'Cancel subscription',
            cancelText: 'Keep subscription',
            warn: true,
        }, this.cancelling, () => this.billing.cancelSubscription(),
            'Your subscription will end at the end of the current period.',
            'Could not cancel your subscription.');
    }

    resume(): Observable<OwnSubscriptionResponse | null> {
        return this.confirmThen({
            title: 'Renew Premium subscription?',
            message: 'Here is what happens if you renew:',
            bullets: [
                'Billing continues as normal, so you will be charged again next month.',
                'You keep every Premium perk without interruption.',
                'You can cancel again at any time.',
            ],
            confirmText: 'Renew subscription',
            cancelText: 'Not now',
        }, this.resuming, () => this.billing.resumeSubscription(),
            'Your subscription will renew as normal.',
            'Could not renew your subscription.');
    }

    private confirmThen(
        data: ConfirmDialogData, busy: ReturnType<typeof signal<boolean>>, action: () => Observable<unknown>,
        success: string, failure: string,
    ): Observable<OwnSubscriptionResponse | null> {
        return this.dialog.open(ConfirmDialogComponent, { data }).afterClosed().pipe(
            filter((confirmed) => !!confirmed),
            tap(() => busy.set(true)),
            switchMap(() => action().pipe(
                tap(() => this.toast.success(success)),
                switchMap(() => this.billing.getSubscription().pipe(catchError(() => of(null)))),
                catchError((err) => {
                    this.toast.error(err?.error?.message ?? failure);
                    return EMPTY;
                }),
                finalize(() => busy.set(false)),
            )),
        );
    }
}
