import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { translateText } from '../i18n/translation.store';
import { COMMON } from '../../i18n/labels';

@Injectable({ providedIn: 'root' })
export class ToastService {
    private snackBar = inject(MatSnackBar);

    private t(message: string): string {
        return translateText(message);
    }
    private _muteNextSuccess = false;

    success(message: string, options?: { duration?: number; onUndo?: () => void }): MatSnackBarRef<TextOnlySnackBar> {
        message = this.t(message);
        if (this._muteNextSuccess) {
            this._muteNextSuccess = false;
            return this.snackBar._openedSnackBarRef as unknown as MatSnackBarRef<TextOnlySnackBar>;
        }
        const duration = options?.duration ?? 5000;
        const action = options?.onUndo ? 'Undo' : 'Dismiss';
        const ref = this.snackBar.open(message, action, {
            duration,
            panelClass: ['toast-success'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        if (options?.onUndo) {
            const undoFn = options.onUndo;
            ref.onAction().subscribe(() => {

                this.snackBar.open(this.t(COMMON.actionUndone), undefined, {
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
        message = this.t(message);
        const ref = this.snackBar.open(message, 'Copy', {
            duration,
            panelClass: ['toast-error'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        ref.onAction().subscribe(() => {
            navigator.clipboard.writeText(message).catch(() => { });
        });
        return ref;
    }

    info(message: string, duration = 3000): MatSnackBarRef<TextOnlySnackBar> {
        message = this.t(message);
        const ref = this.snackBar.open(message, 'Dismiss', {
            duration,
            panelClass: ['toast-info'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        return ref;
    }

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
}
