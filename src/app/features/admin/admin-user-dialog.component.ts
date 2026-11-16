import { HttpClient } from '@angular/common/http';
import { Component, inject, signal, computed } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { AdminService } from '../../api/admin';
import { BillingService } from '../../api/billing';
import type { AdminUserBilling } from '../../api/billing';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PremiumManagePanelComponent } from './premium-manage-panel.component';
import { UserImgPipe } from '../../shared/pipes/image-url.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import type { AdminUserDetailResponse, AdminUserSchematicResponse } from '../../api/generated.schemas';
import { Badge, BADGE_ICONS, BADGE_LABELS, resolveBadge, Status } from '../../core/enums';
import { translateText } from '../../core/i18n/translation.store';
import { TPipe } from '../../core/i18n/t.pipe';
import { ADMIN, COMMON } from '../../i18n/labels';

export type AdminUserDialogData = AdminUserDetailResponse & { billing?: AdminUserBilling | null };

export function loadAdminUserDialogData(adminApi: AdminService, billingApi: BillingService, userId: string): Observable<AdminUserDialogData> {
    return forkJoin({
        user: adminApi.getApiAdminUsersId(userId),
        billing: billingApi.adminGetUserBilling(userId).pipe(catchError(() => of(null))),
    }).pipe(map(({ user, billing }) => ({ ...user, billing })));
}

export type AdminUserDialogResult = 'deleted' | null;

@Component({
    selector: 'app-admin-user-dialog',
    standalone: true,
    imports: [
        DatePipe,
        PremiumManagePanelComponent,
        RouterLink,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatTabsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatTableModule,
        MatTooltipModule,
        MatChipsModule,
        TPipe,
        UserImgPipe,
        NumberFormatPipe,
    ],
    template: `
<div mat-dialog-title class="user-dlg-title">
    <div class="title-info">
        @if (u.filePath) {
        <img [src]="u.filePath | userImg" alt="" class="dlg-avatar" />
        } @else {
        <mat-icon svgIcon="mc:people/guy" style="--icon-size: 32px;"></mat-icon>
        }
        <a [routerLink]="['/users', u.username]" mat-dialog-close class="username-link">{{ u.username }}</a>
        @for (b of savedBadges(); track b) {
        @if (badgeSvg(b); as icon) {
        <mat-icon [svgIcon]="icon" class="badge-icon" [matTooltip]="badgeLabel(b)"></mat-icon>
        }
        }
        @if (billing(); as b) {
        <img [src]="b.isPremium ? '/premium.png' : '/free.png'" alt="" aria-hidden="true" class="plan-icon"
            [matTooltip]="b.isPremium
                ? (('Premium until' | t) + ' ' + (b.premiumUntil | date:'mediumDate'))
                : ('Free plan' | t)" />
        } @else if (loadingBilling()) {
        <span class="plan-icon plan-skeleton media-loading" aria-hidden="true"></span>
        }
    </div>
    <button mat-icon-button mat-dialog-close class="close-btn">
        <mat-icon svgIcon="mc:letters/X"></mat-icon>
    </button>
</div>

<mat-dialog-content class="user-dlg-content">
    <mat-tab-group animationDuration="0ms" class="user-tabs" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab [label]="'Overview' | t">
            <ng-template matTabContent>
            <div class="tab-body">
    <div class="detail-grid">
        <div class="detail-item full-width"><span class="detail-label">{{ 'User ID' | t }}</span>
            <span class="detail-value"><span class="muted">{{ u.id }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.id)" [matTooltip]="'Copy ID' | t">
                    <mat-icon svgIcon="mc:ui/overlapping_sheets" class="copy-icon"></mat-icon>
                </button>
            </span>
        </div>
        <div class="detail-item full-width"><span class="detail-label">{{ 'Email' | t }}</span>
            <span class="detail-value">{{ u.email ?? '-' }}
                @if (u.email) {
                <button mat-icon-button class="copy-btn" (click)="copy(u.email)" [matTooltip]="'Copy email' | t">
                    <mat-icon svgIcon="mc:ui/overlapping_sheets" class="copy-icon"></mat-icon>
                </button>
                }
            </span>
        </div>
        <div class="detail-item"><span class="detail-label">{{ 'Role' | t }}</span><span class="detail-value">{{ user().role }}</span></div>
        <div class="detail-item"><span class="detail-label">{{ 'Status' | t }}</span><span class="detail-value">{{ u.status }}</span></div>
        <div class="detail-item"><span class="detail-label">{{ 'Registered' | t }}</span><span class="detail-value">{{ u.registrationDate | date:'medium' }}</span></div>
        <div class="detail-item"><span class="detail-label">{{ 'Reports' | t }}</span><span class="detail-value">{{ u.reportCount }}</span></div>
        <div class="detail-item fill-row"><span class="detail-label">{{ 'Plan' | t }}</span>
            <span class="detail-value">
                @if (billing(); as b) {
                @if (b.isPremium) { {{ 'Premium until' | t }} {{ b.premiumUntil | date:'mediumDate' }} } @else { <span class="muted">{{ 'Free' | t }}</span> }
                } @else { <span class="muted">{{ 'Loading' | t }}</span> }
            </span>
        </div>
        <div class="detail-item fill-row"><span class="detail-label">{{ 'Storage' | t }}</span>
            <span class="detail-value">{{ u.storageUsedMb | numFmt }} MB / {{ u.storageQuotaGb | numFmt }} GB ({{ u.saveCount }} saves)</span>
        </div>
        @if (u.biographie) {
        <div class="detail-item full-width"><span class="detail-label">{{ 'Bio' | t }}</span><span class="detail-value">{{ u.biographie }}</span></div>
        }
    </div>


    <div class="detail-actions">
        <mat-form-field appearance="outline" class="compact-select">
            <mat-label>{{ 'Badges' | t }}</mat-label>
            <mat-select multiple [value]="editBadges()"
                (selectionChange)="editBadges.set($event.value)">
                @for (b of badges; track b[1]) {
                <mat-option [value]="b[1]">{{ badgeLabels[b[1]] }}</mat-option>
                }
            </mat-select>
            <mat-icon svgIcon="mc:ui/start" matPrefix></mat-icon>
        </mat-form-field>

        @if (editBadges().includes(translatorBadge)) {
        <mat-form-field appearance="outline" class="compact-select">
            <mat-label>{{ 'Translator languages' | t }}</mat-label>
            <mat-select multiple [value]="editLocales()"
                (selectionChange)="editLocales.set($event.value)">
                @for (l of locales(); track l.code) {
                <mat-option [value]="l.code">{{ l.label }}</mat-option>
                }
            </mat-select>
            @if (!editLocales().length) {
            <mat-error>{{ 'Pick at least one language for the Translator badge.' | t }}</mat-error>
            }
        </mat-form-field>
        }

    </div>
    <div class="note-row">
        <mat-form-field appearance="outline" class="note-field">
            <mat-label>{{ 'Private note (admins only)' | t }}</mat-label>
            <textarea matInput rows="3" maxlength="2000" [value]="editNote()"
                (input)="editNote.set($any($event.target).value)"></textarea>
        </mat-form-field>
    </div>

            </div>
            </ng-template>
        </mat-tab>

        <mat-tab [label]="'Accounts' | t">
            <ng-template matTabContent>
            <div class="tab-body">
    <div class="detail-grid">
        <div class="detail-item full-width">
            <span class="detail-label">Minecraft</span>
            <span class="detail-value">
                @if (u.isMinecraftLinked) {
                {{ u.minecraftUsername }} · <span class="muted">{{ u.minecraftUUID }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.minecraftUUID)" [matTooltip]="'Copy UUID' | t">
                    <mat-icon svgIcon="mc:ui/overlapping_sheets" class="copy-icon"></mat-icon>
                </button>
                } @else { <span class="muted">{{ 'Not linked' | t }}</span> }
            </span>
        </div>
        @if (billing()?.minecraftAccounts?.length) {
        <div class="detail-item full-width">
            <span class="detail-label">{{ 'Minecraft history' | t }}</span>
            <span class="detail-value mc-history">
                @for (a of billing()!.minecraftAccounts!; track a.minecraftUUID + a.linkedAt) {
                <span>{{ a.minecraftUsername ?? a.minecraftUUID }} <span class="muted">{{ a.linkedAt | date:'mediumDate' }} to {{ a.unlinkedAt ? (a.unlinkedAt | date:'mediumDate') : ('now' | t) }}</span></span>
                }
            </span>
        </div>
        }
        <div class="detail-item full-width">
            <span class="detail-label">Discord</span>
            <span class="detail-value">
                @if (u.isDiscordLinked) {
                {{ u.discordUsername }} · <span class="muted">{{ u.discordId }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.discordId)" [matTooltip]="'Copy ID' | t">
                    <mat-icon svgIcon="mc:ui/overlapping_sheets" class="copy-icon"></mat-icon>
                </button>
                } @else { <span class="muted">{{ 'Not linked' | t }}</span> }
            </span>
        </div>
        <div class="detail-item">
            <span class="detail-label">{{ 'API Key' | t }}</span>
            <span class="detail-value">
                @if (user().hasApiKey) {
                {{ 'Active' | t }}
                <button mat-icon-button color="warn" (click)="deleteApiKey()" [matTooltip]="'Revoke API key' | t">
                    <mat-icon svgIcon="mc:ui/trash_can"></mat-icon>
                </button>
                } @else { <span class="muted">{{ 'None' | t }}</span> }
            </span>
        </div>
        <div class="detail-item">
            <span class="detail-label">{{ 'Save Key' | t }}</span>
            <span class="detail-value">
                @if (user().hasSaveKey) {
                {{ 'Active' | t }}
                <button mat-icon-button color="warn" (click)="deleteSaveKey()" [matTooltip]="'Revoke save key' | t">
                    <mat-icon svgIcon="mc:ui/trash_can"></mat-icon>
                </button>
                } @else { <span class="muted">{{ 'None' | t }}</span> }
            </span>
        </div>
    </div>
            </div>
            </ng-template>
        </mat-tab>

        <mat-tab [label]="'Premium & storage' | t">
            <ng-template matTabContent>
            <div class="tab-body">
    <div class="detail-grid">
        @if (billing(); as b) {
        <div class="detail-item full-width">
            <span class="detail-label">{{ 'Referrals' | t }}</span>
            <span class="detail-value">
                {{ 'Code' | t }}: {{ b.referralCode ?? '-' }}
                &middot; {{ 'Uses this year' | t }}: {{ usesThisYear(b) }} / {{ referralCap }}
            </span>
        </div>
        }
        <div class="detail-item fill-row">
            <span class="detail-label">{{ 'Storage' | t }}</span>
            <span class="detail-value">{{ u.storageUsedMb | numFmt }} MB / {{ u.storageQuotaGb | numFmt }} GB ({{ u.saveCount }} saves)</span>
        </div>
    </div>
    <div class="detail-actions">
        <mat-form-field appearance="outline" class="compact-input">
            <mat-label>{{ 'Quota (GB)' | t }}</mat-label>
            <input matInput type="number" [value]="editQuota()"
                (input)="editQuota.set(+$any($event.target).value)" min="0" step="0.5" />
        </mat-form-field>
    </div>
    <h4 class="premium-title">{{ 'Premium' | t }}</h4>
    <app-premium-manage-panel [userId]="u.id" [initialBilling]="billing()" (changed)="billing.set($event)"></app-premium-manage-panel>
            </div>
            </ng-template>
        </mat-tab>

        @if (u.schematics.length > 0) {
        <mat-tab [label]="('Schematics' | t) + ' (' + schematics().length + ')'">
            <ng-template matTabContent>
            <div class="tab-body">
    <div class="table-scroll">
        <table mat-table [dataSource]="schematics()" class="full-width schem-table">
            <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>{{ 'Name' | t }}</th>
                <td mat-cell *matCellDef="let s"><a [routerLink]="['/schematics', s.id]" mat-dialog-close>{{ s.name }}</a></td>
            </ng-container>
            <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>{{ 'Status' | t }}</th>
                <td mat-cell *matCellDef="let s">{{ s.status }}</td>
            </ng-container>
            <ng-container matColumnDef="visibility">
                <th mat-header-cell *matHeaderCellDef>{{ 'Visibility' | t }}</th>
                <td mat-cell *matCellDef="let s">{{ s.visibility }}</td>
            </ng-container>
            <ng-container matColumnDef="reportCount">
                <th mat-header-cell *matHeaderCellDef>{{ 'Reports' | t }}</th>
                <td mat-cell *matCellDef="let s">{{ s.reportCount }}</td>
            </ng-container>
            <ng-container matColumnDef="publishDate">
                <th mat-header-cell *matHeaderCellDef>{{ 'Published' | t }}</th>
                <td mat-cell *matCellDef="let s">{{ s.publishDate | date:'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let s" class="schem-actions">
                    <button mat-icon-button [matTooltip]="'Toggle status' | t" (click)="toggleSchematicStatus(s)">
                        <mat-icon [svgIcon]="s.status === 'active' ? 'mc:shapes/box_checked' : 'mc:shapes/box'"></mat-icon>
                    </button>
                    <button mat-icon-button [matTooltip]="'Reset reports' | t" (click)="resetSchematicReports(s)" [disabled]="!+s.reportCount" class="flag-btn">
                        <mat-icon svgIcon="mc:ui/flag"></mat-icon>
                    </button>
                    <button mat-icon-button color="warn" [matTooltip]="'Delete' | t" (click)="deleteSchematic(s)">
                        <mat-icon svgIcon="mc:ui/trash_can"></mat-icon>
                    </button>
                </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="schematicColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: schematicColumns;"></tr>
        </table>
    </div>
            </div>
            </ng-template>
        </mat-tab>
        }
    </mat-tab-group>
</mat-dialog-content>

<mat-dialog-actions align="end">
    <button mat-stroked-button mat-dialog-close>{{ 'Close' | t }}</button>
    <button mat-flat-button (click)="saveAll()">{{ 'Save' | t }}</button>
</mat-dialog-actions>
    `,
    styles: [`
        .user-dlg-content { min-width: 0; height: min(64vh, 640px); max-height: none; }
        .tab-body { padding: 1rem 0 0.25rem; }
        .tab-body .detail-actions { margin-top: 1rem; }
        .user-dlg-title {
            display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }
        .title-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .close-btn { margin-right: -8px; flex-shrink: 0; }
        .dlg-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
        .dlg-avatar-icon { font-size: 32px; --icon-size: 48px;
    width: var(--icon-size); height: var(--icon-size); }
        .badge-icon { --icon-size: 24px;
    width: var(--icon-size); height: var(--icon-size); flex-shrink: 0; }
        .username-link { color: inherit; text-decoration: none; &:hover { color: var(--mat-sys-primary); text-decoration: underline; } }
        .section-div { margin: 1rem 0 0.75rem; }
        .section-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 0.5rem; }
        .detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem 1rem; }
        @media (max-width: 600px) { .detail-grid { grid-template-columns: 1fr 1fr; } }
        .detail-item { display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
        .detail-label { font-size: 0.75rem; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
        .detail-value { font-size: 0.9rem; display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow-wrap: anywhere; word-break: break-all; }
        .detail-value.mc-history { flex-direction: column; align-items: flex-start; gap: 2px; word-break: normal; }
        .full-width { grid-column: 1 / -1; }
        .premium-title { margin: 0.5rem 0 0.75rem; font-size: 0.9rem; font-weight: 500; }
        .fill-row { grid-column: span 2; }
        .muted { opacity: 0.55; }
        .copy-btn {
            --mdc-icon-button-state-layer-size: 28px;
            --mdc-icon-button-icon-size: 16px;
            font-size: inherit;
            width: 28px !important; height: 28px !important; padding: 0 !important;
            display: inline-flex !important; align-items: center; justify-content: center;
            vertical-align: middle; flex-shrink: 0;
            .mat-icon { font-size: 16px; width: 16px; height: 16px; }
            .copy-icon { --icon-size: calc(var(--mc-em) * 1.5);
    width: var(--icon-size); height: var(--icon-size); flex-shrink: 0; }
        }

        .key-active { color: var(--mat-sys-primary); font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; }
        .detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding-bottom: 0.25rem; }
        .compact-select { max-width: 200px; }
        .compact-input { max-width: 120px; }
        .note-row { display: flex; padding-bottom: 0.25rem; }
        .note-field { flex: 1; }
        .note-field textarea { resize: vertical; }
        .table-scroll { overflow-x: auto; width: 100%; }
        .compact-table .mat-mdc-cell, .compact-table .mat-mdc-header-cell { padding: 4px 8px; font-size: 0.85rem; }
        .schem-table a { color: var(--mat-sys-primary); text-decoration: none; }
        .schem-table a:hover { text-decoration: underline; }
        .schem-actions { white-space: nowrap; text-align: right; }
        .plan-icon { --logo-size: 22px; width: 22px; height: 22px; flex-shrink: 0; }
        .plan-skeleton { display: inline-block; border-radius: 4px; }
    `],
})
export class AdminUserDialogComponent {
    constructor() {
        this.loadBadges();
        if (this.u.billing === undefined) this.loadBilling();
    }

    private adminApi = inject(AdminService);
    private toast = inject(ToastService);
    private confirmDlg = inject(MatDialog);
    readonly dialogRef = inject(MatDialogRef<AdminUserDialogComponent>);

    readonly schematicColumns = ['name', 'status', 'visibility', 'reportCount', 'publishDate', 'actions'];

    toggleSchematicStatus(s: AdminUserSchematicResponse): void {
        const newStatus = s.status === Status.Active ? Status.Removed : Status.Active;
        this.adminApi.postApiAdminSchematicsIdToggle(s.id, { status: newStatus }).subscribe({
            next: () => {
                this.schematics.update((list) => list.map((x) => x.id === s.id ? { ...x, status: newStatus } : x));
                this.toast.success(ADMIN.statusChanged(newStatus), {
                    onUndo: () => this.toggleSchematicStatus({ ...s, status: newStatus }),
                });
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    resetSchematicReports(s: AdminUserSchematicResponse): void {
        this.adminApi.postApiAdminSchematicsIdResetReports(s.id).subscribe({
            next: () => {
                this.schematics.update((list) => list.map((x) => x.id === s.id ? { ...x, reportCount: 0 } : x));
                this.toast.success(ADMIN.reportsReset);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    deleteSchematic(s: AdminUserSchematicResponse): void {
        const ref = this.confirmDlg.open(ConfirmDialogComponent, {
            data: { title: 'Delete Schematic', message: `Delete "${s.name}"? This cannot be undone.`, confirmText: 'Delete', warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (!ok) return;
            this.adminApi.deleteApiAdminSchematicsId(s.id).subscribe({
                next: () => {
                    this.schematics.update((list) => list.filter((x) => x.id !== s.id));
                    this.toast.success('Schematic deleted.');
                },
                error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
            });
        });
    }
    readonly u = inject<AdminUserDialogData>(MAT_DIALOG_DATA);
    readonly schematics = signal<AdminUserSchematicResponse[]>([...(this.u.schematics ?? [])]);

    readonly user = signal<AdminUserDetailResponse>({ ...this.u });
    private http = inject(HttpClient);
    readonly editBadges = signal<number[]>([]);
    readonly editLocales = signal<string[]>([]);
    readonly locales = signal<{ code: string; label: string }[]>([]);
    readonly translatorBadge = Badge.Translator;
    readonly savedBadges = signal<number[]>([]);
    badgeSvg(b: number): string | null {
        const path = BADGE_ICONS[b];
        return path?.startsWith('/icons/') && path.endsWith('.svg') ? 'mc:' + path.slice(7, -4) : null;
    }
    readonly editQuota = signal<number>(Number(this.u.storageQuotaGb));
    readonly editNote = signal<string>(this.u.adminNote ?? '');

    private billingApi = inject(BillingService);
    readonly billing = signal<AdminUserBilling | null>(this.u.billing ?? null);
    readonly loadingBilling = signal(false);

    private loadBilling(): void {
        this.loadingBilling.set(true);
        this.billingApi.adminGetUserBilling(this.u.id).subscribe({
            next: (b) => { this.billing.set(b); this.loadingBilling.set(false); },
            error: () => this.loadingBilling.set(false),
        });
    }

    
    readonly referralCap = 12;

    usesThisYear(b: AdminUserBilling): number {
        const since = Date.now() - 365 * 86400000;
        return (b.referralsGiven ?? []).filter((r) => r.status === 'Rewarded' && r.rewardedAt && new Date(r.rewardedAt).getTime() >= since).length;
    }

    readonly badges = (Object.entries(Badge).filter(([, v]) => typeof v === 'number') as [string, number][])
        .filter(([, v]) => v !== Badge.Premium);
    readonly badgeLabels = BADGE_LABELS;

    badgeLabel(b: unknown): string { const n = resolveBadge(b); return n != null ? translateText(BADGE_LABELS[n]) : ''; }

    private loadBadges(): void {
        this.http.get<{ badge: number; locale: string | null }[]>(
            `/api/Translations/admin/user-badges/${this.u.id}`).subscribe({
            next: (rows) => {
                this.editBadges.set([...new Set((rows ?? []).map((r) => r.badge))]);
                this.savedBadges.set(this.editBadges());
                this.editLocales.set((rows ?? []).filter((r) => r.locale).map((r) => r.locale!));
            },
            error: () => { this.editBadges.set([]); this.editLocales.set([]); },
        });
        this.http.get<{ code: string; label: string }[]>('/api/Translations/locales').subscribe({
            next: (r) => this.locales.set(r ?? []),
            error: () => this.locales.set([]),
        });
    }

    copy(val: unknown): void {
        navigator.clipboard.writeText(String(val ?? '')).then(
            () => this.toast.success(ADMIN.copied),
            () => this.toast.error(ADMIN.failed),
        );
    }

    badgeError(): boolean {
        return this.editBadges().includes(this.translatorBadge) && !this.editLocales().length;
    }

    saveAll(): void {
        if (this.badgeError()) {
            this.toast.error('Pick at least one language for the Translator badge.');
            return;
        }
        const newQuota = this.editQuota();
        const newNote = this.editNote().trim() || null;

        const grants: { badge: number; locale: string | null }[] = [];
        for (const b of this.editBadges()) {
            if (b === this.translatorBadge) {
                for (const loc of this.editLocales()) grants.push({ badge: b, locale: loc });
            } else {
                grants.push({ badge: b, locale: null });
            }
        }

        forkJoin([
            this.http.put<{ count: number; role: string }>(`/api/Translations/admin/user-badges/${this.u.id}`, { badges: grants }),
            this.adminApi.postApiAdminUsersIdQuota(this.u.id, { quotaGb: newQuota }),
            this.adminApi.postApiAdminUsersIdNote(this.u.id, { note: newNote }),
        ]).subscribe({
            next: ([badgeResult]) => {
                const first = this.editBadges()[0];
                this.user.update(prev => ({
                    ...prev, badge: first != null ? String(first) : null, storageQuotaGb: newQuota, adminNote: newNote,
                    role: badgeResult?.role ?? prev.role,
                }));
                this.toast.success(ADMIN.changesSaved);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    deleteApiKey(): void {
        const ref = this.confirmDlg.open(ConfirmDialogComponent, {
            data: { title: ADMIN.deleteApiKey, message: ADMIN.deleteApiKeyMsg(this.u.username), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminUsersIdApiKey(this.u.id).subscribe({
                    next: () => {
                        this.user.update(prev => ({ ...prev, hasApiKey: false }));
                        this.toast.success(ADMIN.apiKeyDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
                });
            }
        });
    }

    deleteSaveKey(): void {
        const ref = this.confirmDlg.open(ConfirmDialogComponent, {
            data: { title: ADMIN.deleteSaveKey, message: ADMIN.deleteSaveKeyMsg(this.u.username), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminUsersIdSaveKey(this.u.id).subscribe({
                    next: () => {
                        this.user.update(prev => ({ ...prev, hasSaveKey: false }));
                        this.toast.success(ADMIN.saveKeyDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
                });
            }
        });
    }
}
