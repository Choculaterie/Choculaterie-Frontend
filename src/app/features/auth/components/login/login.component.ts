import { Component, inject, signal, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../../api/auth';
import { SecurityKeysService } from '../../../../api/security-keys';
import { SessionService } from '../../../../core/services/session.service';
import { CaptchaComponent } from '../../../../shared/components/captcha/captcha.component';
import type { CaptchaPositionDto } from '../../../../api/generated.schemas';
import { AUTH } from '../../../../i18n/labels';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    CaptchaComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private apiAuth = inject(AuthService);
  private securityKeysApi = inject(SecurityKeysService);
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild(CaptchaComponent) captcha!: CaptchaComponent;

  readonly step = signal<'login' | 'verify'>('login');
  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly hidePassword = signal(true);
  readonly captchaData = signal<{ captchaId: string; captchaPositions: CaptchaPositionDto[] } | null>(null);

  loginForm = this.fb.nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  verifyForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
  });

  onCaptchaSolved(data: { captchaId: string; captchaPositions: CaptchaPositionDto[] }): void {
    this.captchaData.set(data);
  }

  submitLogin(): void {
    if (this.loginForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');
    const { identifier, password } = this.loginForm.getRawValue();
    const cd = this.captchaData();
    this.apiAuth.postApiAuthLogin({
      login: identifier,
      password,
      captchaId: cd?.captchaId ?? null,
      captchaPositions: cd?.captchaPositions ?? null,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.session.setSession(res);
        this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.step.set('verify');
        } else {
          this.errorMsg.set(err.error?.message ?? err.error?.detail ?? err.error?.title ?? AUTH.loginFailed);
          this.captcha.resetChallenge();
          this.captchaData.set(null);
        }
      },
    });
  }

  submitVerify(): void {
    if (this.verifyForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');
    this.apiAuth.postApiAuthVerifyLogin({
      login: this.loginForm.getRawValue().identifier,
      code: this.verifyForm.getRawValue().code,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.session.setSession(res);
        this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail ?? err.error?.title ?? AUTH.invalidOrExpiredCode);
      },
    });
  }

  loginWithSecurityKey(): void {
    this.loading.set(true);
    this.errorMsg.set('');

    // Step 1: Get login challenge options
    this.securityKeysApi.postApiSecurityKeysLoginOptions({}).subscribe({
      next: async (options: any) => {
        try {
          // Step 2: Call browser WebAuthn API
          const assertion = await navigator.credentials.get({ publicKey: options }) as any;
          if (!assertion) { this.loading.set(false); return; }

          // Step 3: Send assertion to server
          const response = {
            id: assertion.id,
            rawId: this.bufferToBase64Url(assertion.rawId),
            type: assertion.type,
            response: {
              authenticatorData: this.bufferToBase64Url(assertion.response.authenticatorData),
              clientDataJSON: this.bufferToBase64Url(assertion.response.clientDataJSON),
              signature: this.bufferToBase64Url(assertion.response.signature),
              userHandle: assertion.response.userHandle ? this.bufferToBase64Url(assertion.response.userHandle) : null,
            },
            extensions: assertion.getClientExtensionResults?.() ?? {},
            clientExtensionResults: assertion.getClientExtensionResults?.() ?? {},
          };

          this.securityKeysApi.postApiSecurityKeysLogin(response as any, { sessionId: options.sessionId }).subscribe({
            next: (res) => {
              this.loading.set(false);
              this.session.setSession(res);
              this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
            },
            error: (err) => {
              this.loading.set(false);
              this.errorMsg.set(err.error?.detail ?? AUTH.securityKeyLoginFailed);
            },
          });
        } catch {
          this.loading.set(false);
          this.errorMsg.set(AUTH.securityKeyCancelledOrFailed);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail ?? AUTH.failedToStartSecurityKeyLogin);
      },
    });
  }

  private bufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
