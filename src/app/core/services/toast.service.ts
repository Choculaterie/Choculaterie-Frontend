import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
    private snackBar = inject(MatSnackBar);

    /**
     * Show a success toast. If an `onUndo` callback is provided, the action
     * button reads "Undo" and executes the callback when clicked.
     */
    success(message: string, options?: { duration?: number; onUndo?: () => void }): MatSnackBarRef<TextOnlySnackBar> {
        const duration = options?.duration ?? 5000;
        const action = options?.onUndo ? 'Undo' : undefined;
        const ref = this.snackBar.open(message, action, {
            duration,
            panelClass: ['toast-success'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
        if (options?.onUndo) {
            const undoFn = options.onUndo;
            ref.onAction().subscribe(() => undoFn());
        }
        return ref;
    }

    error(message: string, duration = 5000): MatSnackBarRef<TextOnlySnackBar> {
        return this.snackBar.open(message, 'Dismiss', {
            duration,
            panelClass: ['toast-error'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
    }

    info(message: string, duration = 3000): MatSnackBarRef<TextOnlySnackBar> {
        return this.snackBar.open(message, 'Dismiss', {
            duration,
            panelClass: ['toast-info'],
            horizontalPosition: 'start',
            verticalPosition: 'bottom',
        });
    }
}
