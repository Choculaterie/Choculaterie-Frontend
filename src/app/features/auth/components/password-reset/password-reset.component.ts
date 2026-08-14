import { Component, OnDestroy, inject, signal } from '@angular/core';
import { TPipe } from '../../../../core/i18n/t.pipe';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PasswordResetService } from '../../../../api/password-reset';
import { ToastService } from '../../../../core/services/toast.service';
import { AUTH } from '../../../../i18n/labels';

@Component({
    selector: 'app-password-reset',
    standalone: true,
    imports: [TPipe, 
        ReactiveFormsModule,
        RouterLink,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
    ],
    templateUrl: './password-reset.component.html',
    styleUrl: './password-reset.component.scss',
})
export class PasswordResetComponent implements OnDestroy {
    private fb = inject(FormBuilder);
    private passwordResetApi = inject(PasswordResetService);
    private toast = inject(ToastService);

    readonly step = signal<'request' | 'confirm' | 'done'>('request');
    readonly loading = signal(false);
    readonly hidePassword = signal(true);

    requestForm = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
    });

    confirmForm = this.fb.nonNullable.group({
        code: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
    });

    requestReset(): void {
        if (this.requestForm.invalid) return;
        this.loading.set(true);
        this.passwordResetApi.postApiPasswordResetRequest(this.requestForm.getRawValue()).subscribe({
            next: () => {
                this.loading.set(false);
                this.step.set('confirm');
                this.scheduleSpamHint();
            },
            error: () => {
                // Always show the same message for security (don't reveal if email exists)
                this.loading.set(false);
                this.step.set('confirm');
                this.scheduleSpamHint();
            },
        });
    }

    confirmReset(): void {
        if (this.confirmForm.invalid) return;
        this.loading.set(true);
        const val = this.confirmForm.getRawValue();
        this.passwordResetApi.postApiPasswordResetConfirm({
            email: this.requestForm.getRawValue().email,
            code: val.code,
            newPassword: val.newPassword,
        }).subscribe({
            next: () => {
                this.loading.set(false);
                this.clearSpamHint();
                this.step.set('done');
            },
            error: (err) => {
                this.loading.set(false);
                this.toast.error(err.error?.detail ?? AUTH.failedToResetPassword);
            },
        });
    }

    cancelConfirm(): void { this.clearSpamHint(); this.step.set('request'); }

    private _spamTimer: ReturnType<typeof setTimeout> | null = null;

    private scheduleSpamHint(): void {
        this.clearSpamHint();
        this._spamTimer = setTimeout(() => { this._spamTimer = null; this.toast.showSpamHint(); }, 15_000);
    }

    private clearSpamHint(): void {
        if (this._spamTimer !== null) { clearTimeout(this._spamTimer); this._spamTimer = null; }
        this.toast.dismissSpamHint();
    }

    ngOnDestroy(): void { this.clearSpamHint(); }
}
