import { Component, OnDestroy, inject, signal, ViewChild } from '@angular/core';
import { TPipe } from '../../../../core/i18n/t.pipe';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../../api/auth';
import { SecurityKeysService } from '../../../../api/security-keys';
import { SessionService } from '../../../../core/services/session.service';
import { CaptchaComponent } from '../../../../shared/components/captcha/captcha.component';
import type { CaptchaPositionDto } from '../../../../api/generated.schemas';
import { ToastService } from '../../../../core/services/toast.service';
import { AUTH } from '../../../../i18n/labels';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [TPipe, 
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    CaptchaComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private apiAuth = inject(AuthService);
  private securityKeysApi = inject(SecurityKeysService);
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  get returnUrl(): string | null {
    return this.route.snapshot.queryParams['returnUrl'] ?? null;
  }

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
        if (!res.token) {
          // Backend requires email verification (returns 200 with message, no token)
          this.step.set('verify');
          this.scheduleSpamHint();
          return;
        }
        this.session.setSession(res);
        this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message ?? err.error?.detail ?? err.error?.title ?? AUTH.loginFailed);
        this.captcha.resetChallenge();
        this.captchaData.set(null);
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
        this.clearSpamHint();
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
      next: async (resp: any) => {
        try {
          // The backend returns { sessionId, options: { challenge, ... } }
          // or it may return { sessionId, challenge, ... } at the top level
          const sessionId = resp.sessionId;
          const opts = resp.options ?? resp;

          // Convert challenge from base64url to ArrayBuffer
          const publicKeyOptions: any = {
            ...opts,
            challenge: this.base64UrlToBuffer(opts.challenge),
          };

          // Convert allowCredentials[].id from base64url to ArrayBuffer
          if (opts.allowCredentials?.length) {
            publicKeyOptions.allowCredentials = opts.allowCredentials.map((c: any) => ({
              ...c,
              id: this.base64UrlToBuffer(c.id),
            }));
          }

          // Step 2: Call browser WebAuthn API
          const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions }) as any;
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

          this.securityKeysApi.postApiSecurityKeysLogin(response as any, { sessionId }).subscribe({
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

  private base64UrlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  private bufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  cancelVerify(): void { this.clearSpamHint(); this.step.set('login'); this.errorMsg.set(''); }

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
