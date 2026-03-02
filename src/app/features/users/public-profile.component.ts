import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, Location } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, AsyncValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { of, timer } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { UserBrowseService } from '../../api/user-browse';
import { UsersService } from '../../api/users';
import { SchematicsService } from '../../api/schematics';
import { ReportsService } from '../../api/reports';
import { SecurityKeysService } from '../../api/security-keys';
import { SaveManagerService } from '../../api/save-manager';
import { PasswordResetService } from '../../api/password-reset';
import { LinkingService } from '../../api/linking';
import type {
    OwnProfileResponse, PublicProfileResponse, UserProfileResponse,
    SchematicListItemResponse, PublicUserListItemResponse,
    SecurityKeyResponse, SaveListItemResponse, SaveQuotaResponse,
} from '../../api/generated.schemas';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { SchematicCardComponent } from '../../shared/components/schematic-card/schematic-card.component';
import { UserCardComponent } from '../../shared/components/user-card/user-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ReportDialogComponent, ReportDialogData, ReportDialogResult } from '../../shared/components/report-dialog/report-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PasswordDialogComponent, PasswordDialogData } from '../../shared/components/password-dialog/password-dialog.component';
import { ImageCropperDialogComponent, CropperDialogData, CropperDialogResult } from '../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { UserImgPipe } from '../../shared/pipes/image-url.pipe';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { BADGE_LABELS, BADGE_ICONS, BADGE_COLORS, ROLE_LABELS, resolveBadge } from '../../core/enums';
import { PROFILE, USERS, DIALOGS, AUTH, COMMON } from '../../i18n/labels';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
    simpleYoutube, simpleTwitch, simpleDiscord, simpleGithub,
    simpleReddit, simpleInstagram, simpleTiktok, simpleMatrix,
    simpleFacebook, simpleX, simpleFirefoxbrowser,
} from '@ng-icons/simple-icons';
import { matfMinecraftColored } from '@ng-icons/material-file-icons/colored';

@Component({
    selector: 'app-public-profile',
    standalone: true,
    imports: [
        DatePipe,
        RouterLink,
        FormsModule,
        ReactiveFormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatDividerModule,
        MatTabsModule,
        MatTableModule,
        MatTooltipModule,
        MatSelectModule,
        CdkDrag,
        CdkDropList,
        CdkDragHandle,
        LoadingSpinnerComponent,
        SchematicCardComponent,
        UserCardComponent,
        EmptyStateComponent,
        UserImgPipe,
        FileSizePipe,
        MarkdownPipe,
        NgIconComponent,
    ],
    viewProviders: [provideIcons({
        simpleYoutube, simpleTwitch, simpleDiscord, simpleGithub,
        simpleReddit, simpleInstagram, simpleTiktok, simpleMatrix,
        simpleFacebook, simpleX, simpleFirefoxbrowser,
        matfMinecraftColored,
    })],
    templateUrl: './public-profile.component.html',
    styleUrl: './public-profile.component.scss',
})
export class PublicProfileComponent implements OnInit, OnDestroy {
    private fb = inject(FormBuilder);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private usersApi = inject(UsersService);
    private userBrowseApi = inject(UserBrowseService);
    private schematicsApi = inject(SchematicsService);
    private reportsApi = inject(ReportsService);
    private securityKeysApi = inject(SecurityKeysService);
    private saveManagerApi = inject(SaveManagerService);
    private passwordResetApi = inject(PasswordResetService);
    private linkingApi = inject(LinkingService);
    private dialog = inject(MatDialog);
    private toast = inject(ToastService);
    private location = inject(Location);
    session = inject(SessionService);

    // ── Helpers ──
    badgeLabel(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_LABELS[n] : ''; }
    badgeIcon(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_ICONS[n] : 'star'; }
    badgeColor(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_COLORS[n] : '#888'; }
    roleLabel(role: unknown): string { return ROLE_LABELS[role as string] ?? String(role ?? ''); }

    private static readonly BRAND_ICONS: Record<string, string> = {
        youtube: 'simpleYoutube', discord: 'simpleDiscord', twitter: 'simpleX', x: 'simpleX',
        twitch: 'simpleTwitch', github: 'simpleGithub', matrix: 'simpleMatrix',
        reddit: 'simpleReddit', instagram: 'simpleInstagram',
        tiktok: 'simpleTiktok', facebook: 'simpleFacebook',
        website: 'simpleFirefoxbrowser',
    };
    socialIcon(platform: string): string {
        return PublicProfileComponent.BRAND_ICONS[platform.toLowerCase()] ?? '';
    }
    isBrandIcon(platform: string): boolean {
        return !!PublicProfileComponent.BRAND_ICONS[platform.toLowerCase()];
    }

    // ── State ──
    readonly isOwnProfile = signal(false);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly selectedTab = signal(0);

    // Public profile data
    readonly quickProfile = signal<PublicProfileResponse | null>(null);
    readonly enrichedProfile = signal<UserProfileResponse | null>(null);

    // Own profile data
    readonly ownProfile = signal<OwnProfileResponse | null>(null);

    // Unified display profile
    readonly displayProfile = computed<any>(() => {
        if (this.isOwnProfile()) return this.ownProfile();
        return this.enrichedProfile() ?? this.quickProfile();
    });

    // Content (shared)
    readonly loadingContent = signal(true);
    readonly schematics = signal<SchematicListItemResponse[]>([]);
    readonly likedSchematics = signal<SchematicListItemResponse[]>([]);
    readonly likedUsers = signal<PublicUserListItemResponse[]>([]);

    // ── Own Profile: Validators ──
    private usernameAvailableValidator(): AsyncValidatorFn {
        return (control) => {
            const value = control.value?.trim();
            if (!value || value === this.ownProfile()?.username) return of(null);
            return timer(300).pipe(
                switchMap(() => this.usersApi.getApiUsersCheckUsernameUsername(value)),
                map((res: any) => res.isAvailable ? null : { usernameTaken: true }),
                catchError(() => of(null)),
            );
        };
    }

    private emailAvailableValidator(): AsyncValidatorFn {
        return (control) => {
            const value = control.value?.trim();
            if (!value || value === this.ownProfile()?.email) return of(null);
            return timer(300).pipe(
                switchMap(() => this.usersApi.getApiUsersCheckEmailEmail(value)),
                map((res: any) => res.isAvailable ? null : { emailTaken: true }),
                catchError(() => of(null)),
            );
        };
    }

    // ── Own Profile: Email Update ──
    readonly editStep = signal<'form' | 'confirm'>('form');
    readonly editLoading = signal(false);
    readonly pendingEmail = signal<string | null>(null);
    emailForm = this.fb.nonNullable.group({
        email: this.fb.nonNullable.control('', {
            validators: [Validators.required, Validators.email],
            asyncValidators: [this.emailAvailableValidator()],
        }),
    });
    confirmForm = this.fb.nonNullable.group({ code: ['', Validators.required] });

    // ── Own Profile: Security Keys ──
    readonly securityKeys = signal<SecurityKeyResponse[]>([]);
    readonly loadingKeys = signal(true);
    readonly registeringKey = signal(false);
    newKeyName = '';
    secKeyColumns = ['keyName', 'dateAdded', 'lastUsed', 'useCount', 'actions'];

    // ── Own Profile: Save Manager ──
    readonly saves = signal<SaveListItemResponse[]>([]);
    readonly saveQuota = signal<SaveQuotaResponse | null>(null);
    readonly loadingSaves = signal(true);
    readonly saveVerified = signal(false);
    readonly verifyingSave = signal(false);
    saveColumns = ['worldName', 'fileSizeBytes', 'createdAt', 'updatedAt', 'actions'];

    // ── Own Profile: Password Reset ──
    readonly resetStep = signal<'request' | 'confirm'>('request');
    readonly resetLoading = signal(false);
    readonly hideResetPassword = signal(true);
    resetForm = this.fb.nonNullable.group({
        code: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', Validators.required],
    }, { validators: [this.passwordMatchValidator] });

    private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
        const pw = control.get('newPassword')?.value;
        const confirm = control.get('confirmPassword')?.value;
        return pw && confirm && pw !== confirm ? { mismatch: true } : null;
    }

    pwHasUppercase = () => /[A-Z]/.test(this.resetForm.get('newPassword')?.value ?? '');
    pwHasLowercase = () => /[a-z]/.test(this.resetForm.get('newPassword')?.value ?? '');
    pwHasDigit = () => /\d/.test(this.resetForm.get('newPassword')?.value ?? '');
    pwHasSpecial = () => /[^a-zA-Z0-9]/.test(this.resetForm.get('newPassword')?.value ?? '');

    // ── Own Profile: Linking ──
    readonly mcLinkData = signal<any>(null);
    readonly mcLoading = signal(false);
    readonly mcTimerSeconds = signal(0);
    private mcTimerHandle: ReturnType<typeof setInterval> | null = null;
    readonly dcLinkData = signal<any>(null);
    readonly dcLoading = signal(false);
    readonly dcTimerSeconds = signal(0);
    private dcTimerHandle: ReturnType<typeof setInterval> | null = null;

    // ── Own Profile: Editing ──
    readonly profileSaving = signal(false);
    readonly picUploading = signal(false);
    readonly coverUploading = signal(false);
    readonly editSocialLinks = signal<{ platform: string; url: string }[]>([]);
    readonly socialLinksDirty = signal(false);
    readonly socialSaving = signal(false);
    readonly hasEmptyUrls = computed(() => this.editSocialLinks().some(l => !l.url.trim()));

    // Reactive signals for async validator pending state
    readonly usernameChecking = signal(false);
    readonly emailChecking = signal(false);

    profileForm = this.fb.nonNullable.group({
        username: this.fb.nonNullable.control('', {
            validators: [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_-]+$/)],
            asyncValidators: [this.usernameAvailableValidator()],
            updateOn: 'change',
        }),
        bio: [''],
    });

    constructor() {
        this.profileForm.get('username')!.statusChanges.subscribe(
            status => this.usernameChecking.set(status === 'PENDING'),
        );
        this.emailForm.get('email')!.statusChanges.subscribe(
            status => this.emailChecking.set(status === 'PENDING'),
        );
    }

    isAdmin(): boolean {
        return this.session.isAdminOrMod();
    }

    // ══════════════════════════════════════════
    // Lifecycle
    // ══════════════════════════════════════════

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const username = params.get('username')!;
            this.resetState();
            const currentUser = this.session.user()?.username;
            this.isOwnProfile.set(!!currentUser && currentUser.toLowerCase() === username.toLowerCase());

            const tabParam = parseInt(this.route.snapshot.queryParams['tab'], 10);
            if (!isNaN(tabParam)) this.selectedTab.set(tabParam);

            if (this.isOwnProfile()) {
                this.loadOwnProfile(username);
            } else {
                this.loadPublicProfile(username);
            }
        });
    }

    private resetState(): void {
        this.loading.set(true);
        this.error.set('');
        this.loadingContent.set(true);
        this.quickProfile.set(null);
        this.enrichedProfile.set(null);
        this.ownProfile.set(null);
        this.schematics.set([]);
        this.likedSchematics.set([]);
        this.likedUsers.set([]);
        this.selectedTab.set(0);
    }

    private loadOwnProfile(username: string): void {
        const cached = this.session.profile();
        if (cached) {
            this.applyOwnProfile(cached);
        } else {
            this.usersApi.getApiUsersMe().subscribe({
                next: (p) => this.applyOwnProfile(p),
                error: (err) => {
                    this.loading.set(false);
                    this.error.set(err.error?.detail ?? 'Failed to load profile.');
                },
            });
        }

        this.schematicsApi.getApiSchematicsUserUsernameContent(username).subscribe({
            next: (res) => {
                this.schematics.set(res.schematics);
                this.likedSchematics.set(res.likedSchematics);
                this.likedUsers.set(res.likedUsers);
                this.loadingContent.set(false);
            },
            error: () => this.loadingContent.set(false),
        });

        this.securityKeysApi.getApiSecurityKeys().subscribe({
            next: (keys) => { this.securityKeys.set(keys); this.loadingKeys.set(false); },
            error: () => this.loadingKeys.set(false),
        });

        this.saveManagerApi.getApiSaveManager().subscribe({
            next: (saves) => { this.saves.set(saves); this.loadingSaves.set(false); },
            error: () => this.loadingSaves.set(false),
        });
        this.saveManagerApi.getApiSaveManagerQuota().subscribe({
            next: (q) => this.saveQuota.set(q),
            error: () => { },
        });
    }

    private applyOwnProfile(p: OwnProfileResponse): void {
        this.ownProfile.set(p);
        this.session.setProfile(p);
        this.loading.set(false);
        this.emailForm.patchValue({ email: p.email });
        this.profileForm.patchValue({ username: p.username ?? '', bio: p.biographie ?? '' });
        this.editSocialLinks.set((p.socialLinks ?? []).map(l => ({ platform: l.platform, url: l.url })));
        this.socialLinksDirty.set(false);
    }

    private loadPublicProfile(username: string): void {
        this.usersApi.getApiUsersUsername(username).subscribe({
            next: (res) => {
                this.quickProfile.set(res);
                this.schematics.set(res.schematics ?? []);
                this.likedSchematics.set(res.likedSchematics ?? []);
                this.likedUsers.set(res.likedUsers ?? []);
                this.loadingContent.set(false);
            },
            error: (err) => {
                this.loading.set(false);
                this.loadingContent.set(false);
                this.error.set(err.error?.detail ?? USERS.userNotFound);
            },
        });

        this.userBrowseApi.getApiUserBrowseUsernameProfile(username).subscribe({
            next: (res) => { this.enrichedProfile.set(res); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }

    // ══════════════════════════════════════════
    // Tabs
    // ══════════════════════════════════════════

    onTabChange(index: number): void {
        this.selectedTab.set(index);
        const params = new URLSearchParams(window.location.search);
        if (index) params.set('tab', String(index)); else params.delete('tab');
        const qs = params.toString();
        this.location.replaceState(window.location.pathname + (qs ? '?' + qs : ''));
    }

    // ══════════════════════════════════════════
    // Public: Like / Report
    // ══════════════════════════════════════════

    toggleLike(): void {
        if (!this.session.isAuthenticated()) { this.router.navigate(['/auth/register']); return; }
        const p = this.enrichedProfile()!;
        this.userBrowseApi.postApiUserBrowseUserIdLike(p.id).subscribe({
            next: (res) => this.enrichedProfile.set({ ...p, isLiked: res.isLiked }),
            error: (err) => this.toast.error(err.error?.detail ?? USERS.failedToToggleLike),
        });
    }

    reportUser(): void {
        if (!this.session.isAuthenticated()) { this.router.navigate(['/auth/register']); return; }
        const p = this.enrichedProfile()!;
        const dialogRef = this.dialog.open(ReportDialogComponent, {
            data: { type: 'user', targetId: p.id, targetName: p.username } as ReportDialogData,
            width: '400px',
        });
        dialogRef.afterClosed().subscribe((result: ReportDialogResult | undefined) => {
            if (result) {
                this.reportsApi.postApiReportsUser({ userId: p.id, reason: null }).subscribe({
                    next: () => this.toast.success(USERS.reportSubmitted),
                    error: (err) => this.toast.error(err.error?.detail ?? USERS.failedToReport),
                });
            }
        });
    }

    // ══════════════════════════════════════════
    // Own: Email Update
    // ══════════════════════════════════════════

    submitEmail(): void {
        if (this.emailForm.invalid) return;
        this.editLoading.set(true);
        const val = this.emailForm.getRawValue();
        this.usersApi.postApiUsersMeRequestUpdate({ email: val.email }).subscribe({
            next: () => { this.editLoading.set(false); this.pendingEmail.set(val.email); this.editStep.set('confirm'); },
            error: (err) => { this.editLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.profileUpdateFailed); },
        });
    }

    submitConfirm(): void {
        if (this.confirmForm.invalid || !this.pendingEmail()) return;
        this.editLoading.set(true);
        this.usersApi.postApiUsersMeConfirmUpdate({ code: this.confirmForm.getRawValue().code as string, email: this.pendingEmail()! }).subscribe({
            next: (updated) => {
                this.editLoading.set(false);
                this.ownProfile.set(updated); this.session.setProfile(updated);
                this.editStep.set('form'); this.pendingEmail.set(null);
                this.toast.success(PROFILE.emailUpdated); this.confirmForm.reset();
            },
            error: (err) => { this.editLoading.set(false); this.toast.error(err.error?.detail ?? AUTH.invalidOrExpiredCode); },
        });
    }

    cancelConfirm(): void { this.editStep.set('form'); this.pendingEmail.set(null); this.confirmForm.reset(); }

    // ══════════════════════════════════════════
    // Own: Security Keys
    // ══════════════════════════════════════════

    deleteKey(key: SecurityKeyResponse): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.deleteSecurityKey, message: DIALOGS.deleteSecurityKeyMsg(key.keyName), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.securityKeysApi.deleteApiSecurityKeysId(key.id as any).subscribe({
                    next: () => { this.securityKeys.update(keys => keys.filter(k => k.id !== key.id)); this.toast.success(PROFILE.securityKeyDeleted); },
                    error: (err) => this.toast.error(err.error?.detail ?? PROFILE.deleteFailed),
                });
            }
        });
    }

    registerSecurityKey(): void {
        if (!this.newKeyName) return;
        this.registeringKey.set(true);
        this.securityKeysApi.postApiSecurityKeysRegisterOptions({ keyName: this.newKeyName }).subscribe({
            next: async (options: any) => {
                try {
                    const credential = await navigator.credentials.create({ publicKey: options }) as any;
                    if (!credential) { this.registeringKey.set(false); return; }
                    const attestation = {
                        id: credential.id,
                        rawId: this.bufferToBase64Url(credential.rawId),
                        type: credential.type,
                        response: {
                            attestationObject: this.bufferToBase64Url(credential.response.attestationObject),
                            clientDataJSON: this.bufferToBase64Url(credential.response.clientDataJSON),
                        },
                        extensions: credential.getClientExtensionResults?.() ?? {},
                        clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
                    };
                    this.securityKeysApi.postApiSecurityKeysRegister(attestation as any, { sessionId: options.sessionId }).subscribe({
                        next: () => {
                            this.registeringKey.set(false); this.newKeyName = '';
                            this.toast.success(PROFILE.securityKeyRegistered);
                            this.securityKeysApi.getApiSecurityKeys().subscribe(keys => this.securityKeys.set(keys));
                        },
                        error: (err) => { this.registeringKey.set(false); this.toast.error(err.error?.detail ?? PROFILE.registrationFailed); },
                    });
                } catch {
                    this.registeringKey.set(false);
                    this.toast.error(PROFILE.securityKeyRegFailed);
                }
            },
            error: (err) => { this.registeringKey.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedToStartReg); },
        });
    }

    private bufferToBase64Url(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (const b of bytes) str += String.fromCharCode(b);
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // ══════════════════════════════════════════
    // Own: Save Manager
    // ══════════════════════════════════════════

    unlockSaveKey(): void {
        const dialogRef = this.dialog.open(PasswordDialogComponent, {
            data: { title: DIALOGS.unlockSaveKey, message: DIALOGS.unlockSaveKeyMsg, confirmText: COMMON.unlock } as PasswordDialogData,
            width: '400px',
        });
        dialogRef.afterClosed().subscribe((password) => {
            if (!password) return;
            this.verifyingSave.set(true);
            this.saveManagerApi.postApiSaveManagerVerifyPassword({ password }).subscribe({
                next: () => { this.verifyingSave.set(false); this.saveVerified.set(true); },
                error: (err) => { this.verifyingSave.set(false); this.toast.error(err.error?.detail ?? PROFILE.invalidPassword); },
            });
        });
    }

    downloadSave(save: SaveListItemResponse): void {
        this.saveManagerApi.getApiSaveManagerIdDownload<Blob>(save.id).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `${save.worldName}.zip`; a.click();
                URL.revokeObjectURL(url); this.toast.success(PROFILE.downloadStarted);
            },
            error: (err) => this.toast.error(err.error?.detail ?? PROFILE.downloadFailed),
        });
    }

    deleteSave(save: SaveListItemResponse): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.deleteSave, message: DIALOGS.deleteSaveMsg(save.worldName), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.saveManagerApi.deleteApiSaveManagerId(save.id).subscribe({
                    next: () => { this.saves.update(s => s.filter(x => x.id !== save.id)); this.toast.success(PROFILE.saveDeleted); },
                    error: (err) => this.toast.error(err.error?.detail ?? PROFILE.deleteFailed),
                });
            }
        });
    }

    regenerateKey(): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.regenerateSaveKey, message: DIALOGS.regenerateWarning, confirmText: COMMON.regenerate, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (!confirmed) return;
            this.saveManagerApi.postApiSaveManagerRegenerateKey().subscribe({
                next: () => this.toast.success(PROFILE.saveKeyRegenerated),
                error: (err) => this.toast.error(err.error?.detail ?? PROFILE.failedToRegenerateKey),
            });
        });
    }

    // ══════════════════════════════════════════
    // Own: Password Reset
    // ══════════════════════════════════════════

    requestPasswordReset(): void {
        this.resetLoading.set(true);
        const email = this.ownProfile()?.email;
        if (!email) return;
        this.passwordResetApi.postApiPasswordResetRequest({ email }).subscribe({
            next: () => { this.resetLoading.set(false); this.resetStep.set('confirm'); this.toast.info(PROFILE.passwordResetCodeSent); },
            error: (err) => { this.resetLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedPasswordReset); },
        });
    }

    confirmPasswordReset(): void {
        if (this.resetForm.invalid) return;
        this.resetLoading.set(true);
        const email = this.ownProfile()?.email;
        if (!email) return;
        const val = this.resetForm.getRawValue();
        this.passwordResetApi.postApiPasswordResetConfirm({ email, code: val.code, newPassword: val.newPassword }).subscribe({
            next: () => { this.resetLoading.set(false); this.resetStep.set('request'); this.resetForm.reset(); this.toast.success(PROFILE.passwordChangedSuccess); },
            error: (err) => { this.resetLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedToResetPassword); },
        });
    }

    // ══════════════════════════════════════════
    // Own: Profile Update
    // ══════════════════════════════════════════

    submitProfile(): void {
        if (this.profileForm.invalid) return;
        this.profileSaving.set(true);
        const val = this.profileForm.getRawValue();
        this.usersApi.putApiUsersMeProfile({ username: val.username || null, bio: val.bio || null }).subscribe({
            next: (updated) => {
                this.profileSaving.set(false);
                this.ownProfile.set(updated); this.session.setProfile(updated);
                this.toast.success(PROFILE.profileUpdated);
            },
            error: (err) => { this.profileSaving.set(false); this.toast.error(err.error?.detail ?? PROFILE.profileUpdateFailed); },
        });
    }

    // ══════════════════════════════════════════
    // Own: Profile Picture
    // ══════════════════════════════════════════

    onPictureSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0]; input.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { this.toast.error(PROFILE.imageTooLarge); return; }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { this.toast.error(PROFILE.imageFormatNotAllowed); return; }
        const dialogRef = this.dialog.open(ImageCropperDialogComponent, {
            data: { imageFile: file, aspectRatio: 1, roundCropper: true, format: 'png' } as CropperDialogData, width: '450px',
        });
        dialogRef.afterClosed().subscribe((result: CropperDialogResult | undefined) => { if (result) this.uploadProfilePicture(result.file); });
    }

    private uploadProfilePicture(file: File): void {
        this.picUploading.set(true);
        this.usersApi.putApiUsersMeProfilePicture({ file } as any).subscribe({
            next: (updated) => { this.picUploading.set(false); this.ownProfile.set(updated); this.session.setProfile(updated); this.toast.success(PROFILE.pictureUpdated); },
            error: (err) => { this.picUploading.set(false); this.toast.error(err.error?.detail ?? PROFILE.pictureUploadFailed); },
        });
    }

    removeProfilePicture(): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.removePicture, message: DIALOGS.removePictureMsg, confirmText: COMMON.remove, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.picUploading.set(true);
                this.usersApi.deleteApiUsersMeProfilePicture().subscribe({
                    next: (updated) => { this.picUploading.set(false); this.ownProfile.set(updated); this.session.setProfile(updated); this.toast.success(PROFILE.pictureRemoved); },
                    error: (err) => { this.picUploading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedToRemovePicture); },
                });
            }
        });
    }

    // ══════════════════════════════════════════
    // Own: Cover Image
    // ══════════════════════════════════════════

    onCoverSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0]; input.value = '';
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { this.toast.error(PROFILE.imageTooLarge); return; }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { this.toast.error(PROFILE.imageFormatNotAllowed); return; }
        const dialogRef = this.dialog.open(ImageCropperDialogComponent, {
            data: { imageFile: file, aspectRatio: 3, roundCropper: false, format: 'webp' } as CropperDialogData, width: '600px',
        });
        dialogRef.afterClosed().subscribe((result: CropperDialogResult | undefined) => { if (result) this.uploadCoverImage(result.file); });
    }

    private uploadCoverImage(file: File): void {
        this.coverUploading.set(true);
        this.usersApi.putApiUsersMeCoverImage({ file } as any).subscribe({
            next: (updated) => { this.coverUploading.set(false); this.ownProfile.set(updated); this.session.setProfile(updated); this.toast.success(PROFILE.coverImageUpdated); },
            error: (err) => { this.coverUploading.set(false); this.toast.error(err.error?.detail ?? PROFILE.coverImageFailed); },
        });
    }

    deleteCoverImage(): void {
        this.coverUploading.set(true);
        this.usersApi.deleteApiUsersMeCoverImage().subscribe({
            next: (updated) => { this.coverUploading.set(false); this.ownProfile.set(updated); this.session.setProfile(updated); this.toast.success(PROFILE.coverImageRemoved); },
            error: (err) => { this.coverUploading.set(false); this.toast.error(err.error?.detail ?? PROFILE.coverImageFailed); },
        });
    }

    // ══════════════════════════════════════════
    // Own: Social Links
    // ══════════════════════════════════════════

    addSocialLink(): void { this.editSocialLinks.update(links => [...links, { platform: 'website', url: '' }]); this.socialLinksDirty.set(true); }
    removeSocialLink(index: number): void { this.editSocialLinks.update(links => links.filter((_, i) => i !== index)); this.socialLinksDirty.set(true); }
    dropSocialLink(event: CdkDragDrop<void>): void {
        const links = [...this.editSocialLinks()];
        moveItemInArray(links, event.previousIndex, event.currentIndex);
        this.editSocialLinks.set(links);
        this.socialLinksDirty.set(true);
    }
    updateSocialLink(index: number, field: 'platform' | 'url', value: string): void {
        this.editSocialLinks.update(links => links.map((l, i) => i === index ? { ...l, [field]: value } : l));
        this.socialLinksDirty.set(true);
    }

    saveSocialLinks(): void {
        const links = this.editSocialLinks().filter(l => l.url.trim());
        this.socialSaving.set(true);
        this.usersApi.putApiUsersMeSocialLinks(links).subscribe({
            next: (updated) => {
                this.socialSaving.set(false); this.socialLinksDirty.set(false);
                const p = this.ownProfile();
                if (p) { const up = { ...p, socialLinks: updated as any }; this.ownProfile.set(up); this.session.setProfile(up); }
                this.toast.success(PROFILE.socialLinksUpdated);
            },
            error: (err) => { this.socialSaving.set(false); this.toast.error(err.error?.detail ?? PROFILE.socialLinksFailed); },
        });
    }

    // ══════════════════════════════════════════
    // Own: Minecraft Linking
    // ══════════════════════════════════════════

    copyLinkCode(code: string): void {
        navigator.clipboard.writeText(`/link ${code}`).then(
            () => this.toast.success(PROFILE.copiedLinkCommand),
            () => this.toast.error(PROFILE.failedToCopy),
        );
    }

    copyText(text: string): void {
        navigator.clipboard.writeText(text).then(
            () => this.toast.success(PROFILE.copiedLinkCommand),
            () => this.toast.error(PROFILE.failedToCopy),
        );
    }

    generateMcCode(): void {
        this.mcLoading.set(true);
        this.linkingApi.postApiLinkingMinecraftGenerateCode<any>().subscribe({
            next: (res) => {
                this.mcLoading.set(false);
                this.mcLinkData.set(res);
                this.startMcTimer((res.minutesRemaining ?? 5) * 60);
            },
            error: (err) => { this.mcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedMcGenerate); },
        });
    }

    private startMcTimer(seconds: number): void {
        this.clearMcTimer();
        this.mcTimerSeconds.set(seconds);
        this.mcTimerHandle = setInterval(() => {
            const s = this.mcTimerSeconds() - 1;
            if (s <= 0) { this.clearMcTimer(); this.mcTimerSeconds.set(0); }
            else { this.mcTimerSeconds.set(s); }
        }, 1000);
    }

    private clearMcTimer(): void {
        if (this.mcTimerHandle) { clearInterval(this.mcTimerHandle); this.mcTimerHandle = null; }
    }

    checkMcStatus(): void {
        this.mcLoading.set(true);
        this.linkingApi.getApiLinkingMinecraftStatus<any>().subscribe({
            next: (res) => {
                this.mcLoading.set(false);
                if (res?.isLinked || res?.minecraftUsername) {
                    this.mcLinkData.set(null); this.toast.success(PROFILE.mcLinked(res.minecraftUsername)); this.reloadOwnProfile();
                } else { this.toast.info(PROFILE.mcNotLinkedYet); }
            },
            error: (err) => { this.mcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedMcCheck); },
        });
    }

    unlinkMc(): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.unlinkMinecraft, message: DIALOGS.unlinkMinecraftMsg, confirmText: COMMON.unlink, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.mcLoading.set(true);
                this.linkingApi.postApiLinkingMinecraftUnlink().subscribe({
                    next: () => { this.mcLoading.set(false); this.mcLinkData.set(null); this.toast.success(PROFILE.mcUnlinked); this.reloadOwnProfile(); },
                    error: (err) => { this.mcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedMcUnlink); },
                });
            }
        });
    }

    // ══════════════════════════════════════════
    // Own: Discord Linking
    // ══════════════════════════════════════════

    generateDcCode(): void {
        this.dcLoading.set(true);
        this.linkingApi.postApiLinkingDiscordGenerateCode<any>().subscribe({
            next: (res) => {
                this.dcLoading.set(false);
                this.dcLinkData.set(res);
                this.startDcTimer((res.minutesRemaining ?? 5) * 60);
            },
            error: (err) => { this.dcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedDcGenerate); },
        });
    }

    private startDcTimer(seconds: number): void {
        this.clearDcTimer();
        this.dcTimerSeconds.set(seconds);
        this.dcTimerHandle = setInterval(() => {
            const s = this.dcTimerSeconds() - 1;
            if (s <= 0) { this.clearDcTimer(); this.dcTimerSeconds.set(0); }
            else { this.dcTimerSeconds.set(s); }
        }, 1000);
    }

    private clearDcTimer(): void {
        if (this.dcTimerHandle) { clearInterval(this.dcTimerHandle); this.dcTimerHandle = null; }
    }

    checkDcStatus(): void {
        this.dcLoading.set(true);
        this.linkingApi.getApiLinkingDiscordStatus<any>().subscribe({
            next: (res) => {
                this.dcLoading.set(false);
                if (res?.isLinked || res?.discordUsername) {
                    this.dcLinkData.set(null); this.toast.success(PROFILE.dcLinked(res.discordUsername)); this.reloadOwnProfile();
                } else { this.toast.info(PROFILE.dcNotLinkedYet); }
            },
            error: (err) => { this.dcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedDcCheck); },
        });
    }

    unlinkDc(): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.unlinkDiscord, message: DIALOGS.unlinkDiscordMsg, confirmText: COMMON.unlink, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.dcLoading.set(true);
                this.linkingApi.postApiLinkingDiscordUnlink().subscribe({
                    next: () => { this.dcLoading.set(false); this.dcLinkData.set(null); this.toast.success(PROFILE.dcUnlinked); this.reloadOwnProfile(); },
                    error: (err) => { this.dcLoading.set(false); this.toast.error(err.error?.detail ?? PROFILE.failedDcUnlink); },
                });
            }
        });
    }

    formatTimer(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    ngOnDestroy(): void {
        this.clearMcTimer();
        this.clearDcTimer();
    }

    private reloadOwnProfile(): void {
        this.usersApi.getApiUsersMe().subscribe((p) => { this.ownProfile.set(p); this.session.setProfile(p); });
    }
}
