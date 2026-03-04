import { Component, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { AdminService } from '../../api/admin';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserImgPipe } from '../../shared/pipes/image-url.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import type { AdminUserDetailResponse } from '../../api/generated.schemas';
import { Badge, BADGE_LABELS, BADGE_ICONS, BADGE_COLORS, resolveBadge } from '../../core/enums';
import { ADMIN, COMMON } from '../../i18n/labels';

export type AdminUserDialogResult = 'deleted' | null;

@Component({
    selector: 'app-admin-user-dialog',
    standalone: true,
    imports: [
        DatePipe,
        RouterLink,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatTableModule,
        MatTooltipModule,
        MatChipsModule,
        UserImgPipe,
        NumberFormatPipe,
    ],
    template: `
<div mat-dialog-title class="user-dlg-title">
    <div class="title-info">
        @if (u.filePath) {
        <img [src]="u.filePath | userImg" alt="" class="dlg-avatar" />
        } @else {
        <mat-icon class="dlg-avatar-icon">account_circle</mat-icon>
        }
        <span>{{ u.username }}</span>
        @if (u.badge != null) {
        <mat-icon class="badge-icon" [style.color]="badgeColor(u.badge)"
            [matTooltip]="badgeLabel(u.badge)">{{ badgeIcon(u.badge) }}</mat-icon>
        }
    </div>
    <button mat-icon-button mat-dialog-close class="close-btn">
        <mat-icon>close</mat-icon>
    </button>
</div>

<mat-dialog-content class="user-dlg-content">
    <!-- Info grid -->
    <div class="detail-grid">
        <div class="detail-item full-width"><span class="detail-label">User ID</span>
            <span class="detail-value"><span class="muted">{{ u.id }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.id)" matTooltip="Copy ID">
                    <mat-icon>content_copy</mat-icon>
                </button>
            </span>
        </div>
        <div class="detail-item full-width"><span class="detail-label">Email</span>
            <span class="detail-value">{{ u.email ?? '—' }}
                @if (u.email) {
                <button mat-icon-button class="copy-btn" (click)="copy(u.email)" matTooltip="Copy email">
                    <mat-icon>content_copy</mat-icon>
                </button>
                }
            </span>
        </div>
        <div class="detail-item"><span class="detail-label">Role</span><span class="detail-value">{{ u.role }}</span></div>
        <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">{{ u.status }}</span></div>
        <div class="detail-item"><span class="detail-label">Registered</span><span class="detail-value">{{ u.registrationDate | date:'medium' }}</span></div>
        <div class="detail-item"><span class="detail-label">Reports</span><span class="detail-value">{{ u.reportCount }}</span></div>
        @if (u.biographie) {
        <div class="detail-item full-width"><span class="detail-label">Bio</span><span class="detail-value">{{ u.biographie }}</span></div>
        }
    </div>

    <mat-divider class="section-div" />

    <!-- Linking -->
    <h4 class="section-title">Linking</h4>
    <div class="detail-grid">
        <div class="detail-item full-width">
            <span class="detail-label">Minecraft</span>
            <span class="detail-value">
                @if (u.isMinecraftLinked) {
                {{ u.minecraftUsername }} · <span class="muted">{{ u.minecraftUUID }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.minecraftUUID)" matTooltip="Copy UUID">
                    <mat-icon>content_copy</mat-icon>
                </button>
                } @else { <span class="muted">Not linked</span> }
            </span>
        </div>
        <div class="detail-item full-width">
            <span class="detail-label">Discord</span>
            <span class="detail-value">
                @if (u.isDiscordLinked) {
                {{ u.discordUsername }} · <span class="muted">{{ u.discordId }}</span>
                <button mat-icon-button class="copy-btn" (click)="copy(u.discordId)" matTooltip="Copy ID">
                    <mat-icon>content_copy</mat-icon>
                </button>
                } @else { <span class="muted">Not linked</span> }
            </span>
        </div>
    </div>

    <mat-divider class="section-div" />

    <!-- Keys & Storage -->
    <h4 class="section-title">Keys &amp; Storage</h4>
    <div class="detail-grid">
        <div class="detail-item">
            <span class="detail-label">API Key</span>
            <span class="detail-value">
                @if (user().hasApiKey) {
                <mat-icon class="key-active">check_circle</mat-icon> Active
                <button mat-icon-button color="warn" (click)="deleteApiKey()" matTooltip="Revoke API key">
                    <mat-icon>delete</mat-icon>
                </button>
                } @else { <span class="muted">None</span> }
            </span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Save Key</span>
            <span class="detail-value">
                @if (user().hasSaveKey) {
                <mat-icon class="key-active">check_circle</mat-icon> Active
                <button mat-icon-button color="warn" (click)="deleteSaveKey()" matTooltip="Revoke save key">
                    <mat-icon>delete</mat-icon>
                </button>
                } @else { <span class="muted">None</span> }
            </span>
        </div>
        <div class="detail-item fill-row">
            <span class="detail-label">Storage</span>
            <span class="detail-value">{{ u.storageUsedMb | numFmt }} MB / {{ u.storageQuotaGb | numFmt }} GB ({{ u.saveCount }} saves)</span>
        </div>
    </div>

    <mat-divider class="section-div" />

    <!-- Actions -->
    <h4 class="section-title">Actions</h4>
    <div class="detail-actions">
        <mat-form-field appearance="outline" class="compact-select">
            <mat-label>Badge</mat-label>
            <mat-select [value]="editBadge()" (selectionChange)="editBadge.set($event.value)">
                <mat-option value="">None</mat-option>
                @for (b of badges; track b[1]) {
                <mat-option [value]="b[0]">{{ badgeLabels[b[1]] }}</mat-option>
                }
            </mat-select>
            <mat-icon matPrefix>workspace_premium</mat-icon>
        </mat-form-field>
        <button mat-stroked-button (click)="saveBadge()"><mat-icon>save</mat-icon> Save badge</button>

        <mat-form-field appearance="outline" class="compact-input">
            <mat-label>Quota (GB)</mat-label>
            <input matInput type="number" [value]="editQuota()"
                (input)="editQuota.set(+$any($event.target).value)" min="0" step="0.5" />
        </mat-form-field>
        <button mat-stroked-button (click)="saveQuota()"><mat-icon>save</mat-icon> Save quota</button>
    </div>

    <!-- Schematics -->
    @if (u.schematics.length > 0) {
    <mat-divider class="section-div" />
    <h4 class="section-title">Schematics ({{ u.schematics.length }})</h4>
    <div class="table-scroll">
        <table mat-table [dataSource]="u.schematics" class="full-width compact-table">
            <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let s"><a [routerLink]="['/schematics', s.id]">{{ s.name }}</a></td>
            </ng-container>
            <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let s">{{ s.status }}</td>
            </ng-container>
            <ng-container matColumnDef="visibility">
                <th mat-header-cell *matHeaderCellDef>Visibility</th>
                <td mat-cell *matCellDef="let s">{{ s.visibility }}</td>
            </ng-container>
            <ng-container matColumnDef="reports">
                <th mat-header-cell *matHeaderCellDef>Reports</th>
                <td mat-cell *matCellDef="let s">{{ s.reportCount }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['name','status','visibility','reports']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['name','status','visibility','reports'];"></tr>
        </table>
    </div>
    }
</mat-dialog-content>

<mat-dialog-actions align="end">
    <button mat-stroked-button mat-dialog-close>Close</button>
</mat-dialog-actions>
    `,
    styles: [`
        .user-dlg-content { min-width: 0; }
        .user-dlg-title {
            display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }
        .title-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .close-btn { margin-right: -8px; flex-shrink: 0; }
        .dlg-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
        .dlg-avatar-icon { font-size: 32px; width: 32px; height: 32px; }
        .badge-icon { font-size: 18px; width: 18px; height: 18px; }
        .section-div { margin: 1rem 0 0.75rem; }
        .section-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 0.5rem; }
        .detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem 1rem; }
        @media (max-width: 600px) { .detail-grid { grid-template-columns: 1fr 1fr; } }
        .detail-item { display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
        .detail-label { font-size: 0.75rem; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
        .detail-value { font-size: 0.9rem; display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow-wrap: anywhere; word-break: break-all; }
        .full-width { grid-column: 1 / -1; }
        .fill-row { grid-column: span 2; }
        .muted { opacity: 0.55; }
        .copy-btn {
            --mdc-icon-button-state-layer-size: 28px;
            --mdc-icon-button-icon-size: 16px;
            width: 28px !important; height: 28px !important; padding: 0 !important;
            display: inline-flex !important; align-items: center; justify-content: center;
            vertical-align: middle; flex-shrink: 0;
            .mat-icon { font-size: 16px; width: 16px; height: 16px; }
        }

        .key-active { color: var(--mat-sys-primary); font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; }
        .detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding-bottom: 0.25rem; }
        .compact-select { max-width: 160px; }
        .compact-input { max-width: 120px; }
        .table-scroll { overflow-x: auto; width: 100%; }
        .compact-table .mat-mdc-cell, .compact-table .mat-mdc-header-cell { padding: 4px 8px; font-size: 0.85rem; }
    `],
})
export class AdminUserDialogComponent {
    private adminApi = inject(AdminService);
    private toast = inject(ToastService);
    private confirmDlg = inject(MatDialog);
    readonly dialogRef = inject(MatDialogRef<AdminUserDialogComponent>);
    readonly u = inject<AdminUserDetailResponse>(MAT_DIALOG_DATA);

    readonly user = signal<AdminUserDetailResponse>({ ...this.u });
    readonly editBadge = signal<string>(this.u.badge ?? '');
    readonly editQuota = signal<number>(Number(this.u.storageQuotaGb));

    readonly badges = Object.entries(Badge).filter(([, v]) => typeof v === 'number') as [string, number][];
    readonly badgeLabels = BADGE_LABELS;

    badgeLabel(b: unknown): string { const n = resolveBadge(b); return n != null ? BADGE_LABELS[n] : ''; }
    badgeIcon(b: unknown): string { const n = resolveBadge(b); return n != null ? BADGE_ICONS[n] : 'star'; }
    badgeColor(b: unknown): string { const n = resolveBadge(b); return n != null ? BADGE_COLORS[n] : '#888'; }

    copy(val: unknown): void {
        navigator.clipboard.writeText(String(val ?? '')).then(
            () => this.toast.success(ADMIN.copied),
            () => this.toast.error(ADMIN.failed),
        );
    }

    saveBadge(): void {
        const newBadge = this.editBadge() || null;
        this.adminApi.postApiAdminUsersIdBadge(this.u.id, { badge: newBadge }).subscribe({
            next: () => {
                this.user.update(prev => ({ ...prev, badge: newBadge }));
                this.toast.success(ADMIN.badgeUpdated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    saveQuota(): void {
        const newQuota = this.editQuota();
        this.adminApi.postApiAdminUsersIdQuota(this.u.id, { quotaGb: newQuota }).subscribe({
            next: () => {
                this.user.update(prev => ({ ...prev, storageQuotaGb: newQuota }));
                this.toast.success(ADMIN.quotaUpdated);
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
