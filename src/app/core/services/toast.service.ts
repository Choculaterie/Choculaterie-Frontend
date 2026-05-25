import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { ReconnectingToastComponent } from '../../shared/components/reconnecting-toast/reconnecting-toast.component';

@Injectable({ providedIn: 'root' })
export class ToastService {
    private snackBar = inject(MatSnackBar);
    private _muteNextSuccess = false;
    private _reconnectingRef: MatSnackBarRef<ReconnectingToastComponent> | null = null;
    private _reconnectingActive = false;
    private _reconnectingPending = false;

    /**
     * Show a success toast. If an `onUndo` callback is provided, the action
     * button reads "Undo" and executes the callback when clicked.
     * After undo is clicked, a plain "Action undone" toast is shown and the
     * next success() call is silently suppressed to prevent a double-toast.
     */
    success(message: string, options?: { duration?: number; onUndo?: () => void }): MatSnackBarRef<TextOnlySnackBar> {
        if (this._muteNextSuccess) {
            this._muteNextSuccess = false;
            return this.snackBar._openedSnackBarRef as unknown as MatSnackBarRef<TextOnlySnackBar>;
        }
        const duration = options?.duration ?? 5000;
        const action = options?.onUndo ? 'Undo' : 'Dismiss';
        this.suspendReconnecting();
        const ref = this.snackBar.open(message, action, {
            duration,
            panelClass: ['toast-success'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        ref.afterDismissed().subscribe(() => this.restoreReconnecting());
        if (options?.onUndo) {
            const undoFn = options.onUndo;
            ref.onAction().subscribe(() => {
                // Show "Action undone" immediately, mute the next success()
                // triggered by undoFn's async callback to prevent double-toast.
                this.snackBar.open('Action undone.', undefined, {
                    duration: 3000,
                    panelClass: ['toast-success'],
                    horizontalPosition: 'start',
                    verticalPosition: 'bottom',
                });
                this._muteNextSuccess = true;
                undoFn();
            });
        }
        return ref;
    }

    error(message: string, duration = 5000): MatSnackBarRef<TextOnlySnackBar> {
        this.suspendReconnecting();
        const ref = this.snackBar.open(message, 'Copy', {
            duration,
            panelClass: ['toast-error'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        ref.onAction().subscribe(() => {
            navigator.clipboard.writeText(message).catch(() => { });
        });
        ref.afterDismissed().subscribe(() => this.restoreReconnecting());
        return ref;
    }

    info(message: string, duration = 3000): MatSnackBarRef<TextOnlySnackBar> {
        this.suspendReconnecting();
        const ref = this.snackBar.open(message, 'Dismiss', {
            duration,
            panelClass: ['toast-info'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        ref.afterDismissed().subscribe(() => this.restoreReconnecting());
        return ref;
    }

    /** Persistent "check spam" toast – never auto-dismisses. Call dismissSpamHint() to clear. */
    private _spamRef: MatSnackBarRef<TextOnlySnackBar> | null = null;

    showSpamHint(): void {
        if (this._spamRef) return;
        this._spamRef = this.snackBar.open(
            $localize`Didn't receive it? Check your spam folder.`,
            'Dismiss',
            {
                duration: 0,
                panelClass: ['toast-info'],
                horizontalPosition: 'start',
                verticalPosition: 'bottom',
            },
        );
        this._spamRef.afterDismissed().subscribe(() => { this._spamRef = null; });
    }

    dismissSpamHint(): void {
        this._spamRef?.dismiss();
        this._spamRef = null;
    }

    /** Persistent reconnecting toast with loading gif. Only one at a time. */
    reconnecting(): void {
        this._reconnectingActive = true;
        if (this._reconnectingRef) return;
        this._showReconnectingToast();
    }

    /** Dismiss the reconnecting toast (called on reconnect). */
    dismissReconnecting(): void {
        this._reconnectingActive = false;
        this._reconnectingPending = false;
        this._reconnectingRef?.dismiss();
        this._reconnectingRef = null;
    }

    /** Actually open the reconnecting snackbar. */
    private _showReconnectingToast(): void {
        if (this._reconnectingRef) return;
        this._reconnectingPending = false;
        this._reconnectingRef = this.snackBar.openFromComponent(ReconnectingToastComponent, {
            panelClass: ['toast-error'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        this._reconnectingRef.afterDismissed().subscribe(() => {
            this._reconnectingRef = null;
            // If still disconnected, re-show after a brief delay
            if (this._reconnectingPending) {
                this._reconnectingPending = false;
                this._showReconnectingToast();
            }
        });
    }

    /** Temporarily hide reconnecting toast so another toast can show. */
    private suspendReconnecting(): void {
        if (!this._reconnectingActive || !this._reconnectingRef) return;
        this._reconnectingPending = true;
        this._reconnectingRef.dismiss();
        this._reconnectingRef = null;
    }

    /** Restore reconnecting toast after a normal toast dismissed. */
    private restoreReconnecting(): void {
        if (!this._reconnectingActive) return;
        // Small delay to not overlap with the outgoing toast animation
        setTimeout(() => {
            if (this._reconnectingActive && !this._reconnectingRef) {
                this._showReconnectingToast();
            }
        }, 300);
    }
}
