import { Component, inject, signal, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RegisterService } from '../../../../api/register';
import { SessionService } from '../../../../core/services/session.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CaptchaComponent } from '../../../../shared/components/captcha/captcha.component';
import type { CaptchaPositionDto } from '../../../../api/generated.schemas';
import { AUTH } from '../../../../i18n/labels';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CaptchaComponent,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private registerApi = inject(RegisterService);
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  @ViewChild(CaptchaComponent) captcha!: CaptchaComponent;

  readonly step = signal<'register' | 'confirm'>('register');
  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly hidePassword = signal(true);
  readonly captchaData = signal<{ captchaId: string; captchaPositions: CaptchaPositionDto[] } | null>(null);

  registerForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    passwordConfirm: ['', Validators.required],
  }, { validators: [this.passwordMatchValidator] });

  confirmForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
  });

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const pw = control.get('password')?.value;
    const confirm = control.get('passwordConfirm')?.value;
    return pw && confirm && pw !== confirm ? { mismatch: true } : null;
  }

  hasUppercase = () => /[A-Z]/.test(this.registerForm.get('password')?.value ?? '');
  hasLowercase = () => /[a-z]/.test(this.registerForm.get('password')?.value ?? '');
  hasDigit = () => /\d/.test(this.registerForm.get('password')?.value ?? '');
  hasSpecial = () => /[^a-zA-Z0-9]/.test(this.registerForm.get('password')?.value ?? '');

  onCaptchaSolved(data: { captchaId: string; captchaPositions: CaptchaPositionDto[] }): void {
    this.captchaData.set(data);
  }

  submitRegister(): void {
    if (this.registerForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');

    const val = this.registerForm.getRawValue();
    const cd = this.captchaData();
    this.registerApi.postApiRegister({
      username: val.username,
      email: val.email,
      password: val.password,
      passwordConfirm: val.passwordConfirm,
      captchaId: cd?.captchaId ?? null,
      captchaPositions: cd?.captchaPositions ?? null,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.step.set('confirm');
        this.toast.info(AUTH.verificationCodeSent);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message ?? err.error?.detail ?? err.error?.title ?? AUTH.registrationFailed);
        this.captcha.resetChallenge();
        this.captchaData.set(null);
      },
    });
  }

  submitConfirm(): void {
    if (this.confirmForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');

    const reg = this.registerForm.getRawValue();
    this.registerApi.postApiRegisterConfirm({
      username: reg.username,
      email: reg.email,
      password: reg.password,
      passwordConfirm: reg.password,
      code: this.confirmForm.getRawValue().code,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.session.setSession(res);
        this.toast.success(AUTH.accountCreated);
        this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail ?? err.error?.title ?? AUTH.invalidOrExpiredCode);
      },
    });
  }
}
