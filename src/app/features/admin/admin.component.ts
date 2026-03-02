import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Subject, debounceTime, switchMap, of, forkJoin, map, Subscription } from 'rxjs';
import { AdminService } from '../../api/admin';
import { UserBrowseService } from '../../api/user-browse';
import { SchematicsService } from '../../api/schematics';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import type { AdminUserResponse, AdminSchematicResponse, AdminUserDetailResponse, AdminUserSchematicResponse, LiveMessageResponse, ModMessageResponse, StorageStatsResponse, UserStorageResponse, AllowedTagResponse, AllowedVersionResponse } from '../../api/generated.schemas';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { UserLinkComponent } from '../../shared/components/user-link/user-link.component';
import { UserImgPipe } from '../../shared/pipes/image-url.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { Role, ROLE_LABELS, Status, STATUS_LABELS, Visibility, Badge, BADGE_LABELS, BADGE_ICONS, BADGE_COLORS, resolveBadge } from '../../core/enums';
import { ADMIN, DIALOGS, COMMON } from '../../i18n/labels';

@Component({
    selector: 'app-admin',
    standalone: true,
    imports: [
        FormsModule,
        ReactiveFormsModule,
        RouterLink,
        DatePipe,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatProgressBarModule,
        MatTabsModule,
        MatTableModule,
        MatChipsModule,
        MatSlideToggleModule,
        MatPaginatorModule,
        MatTooltipModule,
        MatSortModule,
        MatDividerModule,
        MatAutocompleteModule,
        LoadingSpinnerComponent,
        EmptyStateComponent,
        UserLinkComponent,
        UserImgPipe,
        NumberFormatPipe,
    ],
    templateUrl: './admin.component.html',
    styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit, OnDestroy {
    private adminApi = inject(AdminService);
    private userBrowseApi = inject(UserBrowseService);
    private schematicsApi = inject(SchematicsService);
    private dialog = inject(MatDialog);
    private toast = inject(ToastService);
    private session = inject(SessionService);
    private location = inject(Location);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private fb = inject(FormBuilder);

    readonly roles = Object.values(Role);
    readonly statuses = Object.values(Status);
    readonly badges = Object.entries(Badge).filter(([, v]) => typeof v === 'number') as [string, number][];
    readonly roleLabels = ROLE_LABELS;
    readonly statusLabels = STATUS_LABELS;
    readonly badgeLabels = BADGE_LABELS;
    readonly badgeIcons = BADGE_ICONS;
    readonly badgeColors = BADGE_COLORS;
    readonly Visibility = Visibility;
    readonly messageTypes = ['Info', 'Warning', 'Alert'];

    // Tab persistence via query params
    readonly selectedTab = signal(0);

    // ── Users (server-side) ──
    readonly users = signal<AdminUserResponse[]>([]);
    readonly usersTotalCount = signal(0);
    readonly loadingUsers = signal(true);
    readonly newestOnlyUsers = signal(false);
    readonly usersPage = signal(0);
    readonly usersPageSize = signal(25);
    readonly usersSort = signal('date');
    readonly usersDirection = signal<'asc' | 'desc'>('desc');
    usersSearch = '';
    userColumns = ['username', 'email', 'role', 'status', 'reportCount', 'registrationDate', 'actions'];

    // Search autocomplete
    readonly userSearchSuggestions = signal<string[]>([]);
    readonly schematicSearchSuggestions = signal<{ label: string; type: 'schematic' | 'user' }[]>([]);
    private userSearchInput$ = new Subject<string>();
    private schematicSearchInput$ = new Subject<string>();
    private autoSubs: Subscription[] = [];

    // ── Schematics (server-side) ──
    readonly schematics = signal<AdminSchematicResponse[]>([]);
    readonly schematicsTotalCount = signal(0);
    readonly loadingSchematics = signal(true);
    readonly schematicsPage = signal(0);
    readonly schematicsPageSize = signal(25);
    readonly schematicsSort = signal('date');
    readonly schematicsDirection = signal<'asc' | 'desc'>('desc');
    schematicsSearch = '';
    schematicColumns = ['name', 'username', 'status', 'visibility', 'reportCount', 'publishDate', 'actions'];

    // Live Messages
    readonly liveMessages = signal<LiveMessageResponse[]>([]);
    readonly loadingLiveMessages = signal(true);
    readonly editingLiveMessageId = signal<number | null>(null);
    liveMessageColumns = ['message', 'type', 'time', 'actions'];
    liveMessageForm = this.fb.nonNullable.group({
        message: ['', Validators.required],
        type: ['Info', Validators.required],
    });

    // Mod Messages
    readonly modMessages = signal<ModMessageResponse[]>([]);
    readonly loadingModMessages = signal(true);
    modMessageColumns = ['message', 'type', 'isActive', 'time', 'actions'];
    modMessageForm = this.fb.nonNullable.group({
        message: ['', Validators.required],
        type: ['Info', Validators.required],
    });

    // ── Storage (server-side) ──
    readonly storageStats = signal<StorageStatsResponse | null>(null);
    readonly storageTotalCount = signal(0);
    readonly loadingStorage = signal(true);
    readonly storagePage = signal(0);
    readonly storagePageSize = signal(25);
    readonly storageSort = signal('total');
    readonly storageDirection = signal<'asc' | 'desc'>('desc');
    storageSearch = '';
    storageColumns = ['username', 'saveCount', 'totalMb', 'quotaGb', 'percentageOfQuota'];

    // ── User Detail ──
    readonly selectedUser = signal<AdminUserDetailResponse | null>(null);
    readonly loadingUserDetail = signal(false);
    readonly editBadge = signal<string>('');
    readonly editQuota = signal<number>(1);

    // Track which tabs have been loaded
    private loadedTabs = new Set<number>();

    ngOnInit(): void {
        const tabParam = parseInt(this.route.snapshot.queryParams['tab'], 10);
        if (!isNaN(tabParam) && tabParam >= 0) this.selectedTab.set(tabParam);
        const tab = this.selectedTab();
        this.loadTabData(tab);

        // Auto-open user detail if userId query param is present
        const userId = this.route.snapshot.queryParams['userId'];
        if (userId && tab === 0) {
            this.autoOpenUserDetail(userId);
        }

        // User search autocomplete
        this.autoSubs.push(
            this.userSearchInput$.pipe(
                debounceTime(300),
                switchMap(q => q.length >= 2
                    ? this.userBrowseApi.getApiUserBrowseSearch({ q })
                    : of([] as string[])
                ),
            ).subscribe(names => this.userSearchSuggestions.set(names)),
        );

        // Schematic search autocomplete
        this.autoSubs.push(
            this.schematicSearchInput$.pipe(
                debounceTime(300),
                switchMap(q => q.length >= 2
                    ? forkJoin([
                        this.schematicsApi.getApiSchematicsSearchNames({ q }),
                        this.schematicsApi.getApiSchematicsSearchUsers({ q }),
                    ]).pipe(map(([names, users]) => [
                        ...names.map(n => ({ label: n, type: 'schematic' as const })),
                        ...users.map(u => ({ label: u, type: 'user' as const })),
                    ]))
                    : of([] as { label: string; type: 'schematic' | 'user' }[])
                ),
            ).subscribe(suggestions => this.schematicSearchSuggestions.set(suggestions)),
        );
    }

    ngOnDestroy(): void {
        this.autoSubs.forEach(s => s.unsubscribe());
    }

    private autoOpenUserDetail(userId: string): void {
        this.loadingUserDetail.set(true);
        this.adminApi.getApiAdminUsersId(userId).subscribe({
            next: (u) => {
                this.selectedUser.set(u);
                this.editBadge.set(u.badge ?? '');
                this.editQuota.set(Number(u.storageQuotaGb));
                this.loadingUserDetail.set(false);
            },
            error: () => {
                this.toast.error(ADMIN.failed);
                this.loadingUserDetail.set(false);
            },
        });
    }

    onTabChange(event: MatTabChangeEvent): void {
        const idx = event.index;
        this.selectedTab.set(idx);
        const params = new URLSearchParams(window.location.search);
        if (idx) params.set('tab', String(idx)); else params.delete('tab');
        const qs = params.toString();
        this.location.replaceState(window.location.pathname + (qs ? '?' + qs : ''));
        this.loadTabData(idx);
    }

    private loadTabData(idx: number): void {
        if (this.loadedTabs.has(idx)) return;
        this.loadedTabs.add(idx);
        switch (idx) {
            case 0: this.loadUsers(); break;
            case 1: this.loadSchematics(); break;
            case 2: this.loadLiveMessages(); break;
            case 3: this.loadModMessages(); break;
            case 4: this.loadStorage(); break;
            case 5: this.loadTags(); break;
            case 6: this.loadVersions(); break;
        }
    }

    // ── Users ──
    loadUsers(): void {
        this.loadingUsers.set(true);
        this.adminApi.getApiAdminUsers({
            page: this.usersPage() + 1,
            pageSize: this.usersPageSize(),
            search: this.usersSearch || undefined,
            sort: this.usersSort(),
            direction: this.usersDirection(),
            newestOnly: this.newestOnlyUsers() || undefined,
        }).subscribe({
            next: (r) => {
                this.users.set(r.items);
                this.usersTotalCount.set(Number(r.totalCount));
                this.loadingUsers.set(false);
            },
            error: () => this.loadingUsers.set(false),
        });
    }

    onUsersPageChange(event: PageEvent): void {
        if (event.pageSize !== this.usersPageSize()) {
            this.usersPageSize.set(event.pageSize);
            this.usersPage.set(0);
        } else {
            this.usersPage.set(event.pageIndex);
        }
        this.loadUsers();
    }

    onUsersSort(sort: Sort): void {
        if (!sort.direction) {
            this.usersSort.set('date');
            this.usersDirection.set('desc');
        } else {
            const map: Record<string, string> = {
                username: 'username', email: 'email', role: 'role',
                status: 'status', reportCount: 'reports', registrationDate: 'date',
            };
            this.usersSort.set(map[sort.active] ?? 'date');
            this.usersDirection.set(sort.direction as 'asc' | 'desc');
        }
        this.usersPage.set(0);
        this.loadUsers();
    }

    searchUsers(): void {
        this.usersPage.set(0);
        this.loadUsers();
    }

    onUserSearchInput(q: string): void { this.userSearchInput$.next(q); }

    onUserSuggestionSelected(event: any): void {
        this.usersSearch = typeof event.option.value === 'string' ? event.option.value : event.option.value?.label ?? '';
        this.searchUsers();
    }

    onSchematicSearchInput(q: string): void { this.schematicSearchInput$.next(q); }

    onSchematicSuggestionSelected(event: any): void {
        const val = event.option.value;
        this.schematicsSearch = typeof val === 'string' ? val : val?.label ?? '';
        this.searchSchematics();
    }

    displaySchematicSuggestion = (val: any): string => val?.label ?? val ?? '';

    changeRole(user: AdminUserResponse, role: string): void {
        this.adminApi.postApiAdminUsersIdRole(user.id, { role }).subscribe({
            next: () => {
                this.users.update(list => list.map(u => u.id === user.id ? { ...u, role } : u));
                this.toast.success(ADMIN.roleChanged(role));
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToChangeRole),
        });
    }

    changeStatus(user: AdminUserResponse, status: string): void {
        this.adminApi.postApiAdminUsersIdStatus(user.id, { status, suspensionEndDate: null }).subscribe({
            next: () => {
                this.users.update(list => list.map(u => u.id === user.id ? { ...u, status } : u));
                this.toast.success(ADMIN.statusChanged(status));
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToChangeStatus),
        });
    }

    resetUserReports(user: AdminUserResponse): void {
        this.adminApi.postApiAdminUsersIdResetReports(user.id).subscribe({
            next: () => {
                this.users.update(list => list.map(u => u.id === user.id ? { ...u, reportCount: 0 } : u));
                this.toast.success(ADMIN.reportsReset);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    loginAs(user: AdminUserResponse): void {
        const ref = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.loginAs, message: DIALOGS.loginAsMsg(user.username), confirmText: DIALOGS.loginAs, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.postApiAdminUsersLoginAs({ userId: user.id }).subscribe({
                    next: (res) => {
                        this.session.setSession(res);
                        this.router.navigate(['/users', user.username]);
                        this.toast.success(ADMIN.loggedInAs(user.username));
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
                });
            }
        });
    }

    // ── User Detail ──
    openUserDetail(user: AdminUserResponse): void {
        this.loadingUserDetail.set(true);
        this.selectedUser.set(null);
        this.router.navigate([], { queryParams: { userId: user.id }, queryParamsHandling: 'merge', replaceUrl: true });
        this.adminApi.getApiAdminUsersId(user.id).subscribe({
            next: (u) => {
                this.selectedUser.set(u);
                this.editBadge.set(u.badge ?? '');
                this.editQuota.set(Number(u.storageQuotaGb));
                this.loadingUserDetail.set(false);
            },
            error: () => {
                this.toast.error(ADMIN.failed);
                this.loadingUserDetail.set(false);
            },
        });
    }

    closeUserDetail(): void {
        this.selectedUser.set(null);
        this.router.navigate([], { queryParams: { userId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    saveBadge(): void {
        const u = this.selectedUser();
        if (!u) return;
        this.adminApi.postApiAdminUsersIdBadge(u.id, { badge: this.editBadge() || null }).subscribe({
            next: () => {
                this.selectedUser.update(prev => prev ? { ...prev, badge: this.editBadge() || null } : prev);
                this.toast.success(ADMIN.badgeUpdated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    saveQuota(): void {
        const u = this.selectedUser();
        if (!u) return;
        this.adminApi.postApiAdminUsersIdQuota(u.id, { quotaGb: this.editQuota() }).subscribe({
            next: () => {
                this.selectedUser.update(prev => prev ? { ...prev, storageQuotaGb: this.editQuota() } : prev);
                this.toast.success(ADMIN.quotaUpdated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    deleteApiKey(): void {
        const u = this.selectedUser();
        if (!u) return;
        const ref = this.dialog.open(ConfirmDialogComponent, {
            data: { title: ADMIN.deleteApiKey, message: ADMIN.deleteApiKeyMsg(u.username), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminUsersIdApiKey(u.id).subscribe({
                    next: () => {
                        this.selectedUser.update(prev => prev ? { ...prev, hasApiKey: false } : prev);
                        this.toast.success(ADMIN.apiKeyDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
                });
            }
        });
    }

    deleteSaveKey(): void {
        const u = this.selectedUser();
        if (!u) return;
        const ref = this.dialog.open(ConfirmDialogComponent, {
            data: { title: ADMIN.deleteSaveKey, message: ADMIN.deleteSaveKeyMsg(u.username), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminUsersIdSaveKey(u.id).subscribe({
                    next: () => {
                        this.selectedUser.update(prev => prev ? { ...prev, hasSaveKey: false } : prev);
                        this.toast.success(ADMIN.saveKeyDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
                });
            }
        });
    }

    badgeLabel(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_LABELS[n] : ''; }
    badgeIcon(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_ICONS[n] : 'star'; }
    badgeColor(badge: unknown): string { const n = resolveBadge(badge); return n != null ? BADGE_COLORS[n] : '#888'; }

    copyToClipboard(value: unknown): void {
        navigator.clipboard.writeText(String(value ?? '')).then(
            () => this.toast.success(ADMIN.copied),
            () => this.toast.error(ADMIN.failed),
        );
    }

    // ── Schematics ──
    loadSchematics(): void {
        this.loadingSchematics.set(true);
        this.adminApi.getApiAdminSchematics({
            page: this.schematicsPage() + 1,
            pageSize: this.schematicsPageSize(),
            search: this.schematicsSearch || undefined,
            sort: this.schematicsSort(),
            direction: this.schematicsDirection(),
        }).subscribe({
            next: (r) => {
                this.schematics.set(r.items);
                this.schematicsTotalCount.set(Number(r.totalCount));
                this.loadingSchematics.set(false);
            },
            error: () => this.loadingSchematics.set(false),
        });
    }

    onSchematicsPageChange(event: PageEvent): void {
        if (event.pageSize !== this.schematicsPageSize()) {
            this.schematicsPageSize.set(event.pageSize);
            this.schematicsPage.set(0);
        } else {
            this.schematicsPage.set(event.pageIndex);
        }
        this.loadSchematics();
    }

    onSchematicsSort(sort: Sort): void {
        if (!sort.direction) {
            this.schematicsSort.set('date');
            this.schematicsDirection.set('desc');
        } else {
            const map: Record<string, string> = {
                name: 'name', username: 'author', status: 'status',
                visibility: 'visibility', reportCount: 'reports', publishDate: 'date',
            };
            this.schematicsSort.set(map[sort.active] ?? 'date');
            this.schematicsDirection.set(sort.direction as 'asc' | 'desc');
        }
        this.schematicsPage.set(0);
        this.loadSchematics();
    }

    searchSchematics(): void {
        this.schematicsPage.set(0);
        this.loadSchematics();
    }

    toggleSchematicVisibility(s: AdminSchematicResponse): void {
        const newVis = s.visibility === Visibility.Public ? Visibility.Private : Visibility.Public;
        this.adminApi.postApiAdminSchematicsIdToggle(s.id, { visibility: newVis, status: null }).subscribe({
            next: () => {
                this.schematics.update(list => list.map(x => x.id === s.id ? { ...x, visibility: newVis } : x));
                this.toast.success(ADMIN.visibilitySet(newVis));
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    resetSchematicReports(s: AdminSchematicResponse): void {
        this.adminApi.postApiAdminSchematicsIdResetReports(s.id).subscribe({
            next: () => {
                this.schematics.update(list => list.map(x => x.id === s.id ? { ...x, reportCount: 0 } : x));
                this.toast.success(ADMIN.reportsReset);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    // ── Live Messages ──
    loadLiveMessages(): void {
        this.loadingLiveMessages.set(true);
        this.adminApi.getApiAdminLiveMessages().subscribe({
            next: (m) => { this.liveMessages.set(m); this.loadingLiveMessages.set(false); },
            error: () => this.loadingLiveMessages.set(false),
        });
    }

    createLiveMessage(): void {
        if (this.liveMessageForm.invalid) return;
        const val = this.liveMessageForm.getRawValue();
        this.adminApi.postApiAdminLiveMessages(val).subscribe({
            next: (m) => {
                this.liveMessages.update(list => [...list, m]);
                this.liveMessageForm.reset({ message: '', type: 'Info' });
                this.editingLiveMessageId.set(null);
                this.toast.success(ADMIN.liveMessageCreated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    editLiveMessage(m: LiveMessageResponse): void {
        this.editingLiveMessageId.set(m.id as any);
        this.liveMessageForm.patchValue({ message: m.message, type: m.type });
    }

    updateLiveMessage(): void {
        if (this.liveMessageForm.invalid || !this.editingLiveMessageId()) return;
        const val = this.liveMessageForm.getRawValue();
        const id = this.editingLiveMessageId()!;
        this.adminApi.putApiAdminLiveMessagesId(id, val).subscribe({
            next: (updated) => {
                this.liveMessages.update(list => list.map(x => (x.id as any) === id ? updated : x));
                this.liveMessageForm.reset({ message: '', type: 'Info' });
                this.editingLiveMessageId.set(null);
                this.toast.success(ADMIN.liveMessageUpdated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    deleteLiveMessage(m: LiveMessageResponse): void {
        this.adminApi.deleteApiAdminLiveMessagesId(m.id as any).subscribe({
            next: () => {
                this.liveMessages.update(list => list.filter(x => x.id !== m.id));
                this.toast.success(ADMIN.deleted);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    // ── Mod Messages ──
    loadModMessages(): void {
        this.loadingModMessages.set(true);
        this.adminApi.getApiAdminModMessages().subscribe({
            next: (m) => { this.modMessages.set(m); this.loadingModMessages.set(false); },
            error: () => this.loadingModMessages.set(false),
        });
    }

    createModMessage(): void {
        if (this.modMessageForm.invalid) return;
        const val = this.modMessageForm.getRawValue();
        this.adminApi.postApiAdminModMessages(val).subscribe({
            next: (m) => {
                this.modMessages.update(list => [...list, m]);
                this.modMessageForm.reset({ message: '', type: 'Info' });
                this.toast.success(ADMIN.modMessageCreated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    toggleModMessage(m: ModMessageResponse): void {
        this.adminApi.postApiAdminModMessagesIdToggle(m.id as any).subscribe({
            next: () => {
                this.modMessages.update(list =>
                    list.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x)
                );
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    deleteModMessage(m: ModMessageResponse): void {
        this.adminApi.deleteApiAdminModMessagesId(m.id as any).subscribe({
            next: () => {
                this.modMessages.update(list => list.filter(x => x.id !== m.id));
                this.toast.success(ADMIN.deleted);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failed),
        });
    }

    // ── Storage ──
    loadStorage(): void {
        this.loadingStorage.set(true);
        this.adminApi.getApiAdminStorage({
            page: this.storagePage() + 1,
            pageSize: this.storagePageSize(),
            search: this.storageSearch || undefined,
            sort: this.storageSort(),
            direction: this.storageDirection(),
        }).subscribe({
            next: (s) => {
                this.storageStats.set(s);
                this.storageTotalCount.set(Number(s.totalCount));
                this.loadingStorage.set(false);
            },
            error: () => this.loadingStorage.set(false),
        });
    }

    onStoragePageChange(event: PageEvent): void {
        if (event.pageSize !== this.storagePageSize()) {
            this.storagePageSize.set(event.pageSize);
            this.storagePage.set(0);
        } else {
            this.storagePage.set(event.pageIndex);
        }
        this.loadStorage();
    }

    onStorageSort(sort: Sort): void {
        if (!sort.direction) {
            this.storageSort.set('total');
            this.storageDirection.set('desc');
        } else {
            const map: Record<string, string> = {
                username: 'username', saveCount: 'saves', totalMb: 'total',
                quotaGb: 'quota', percentageOfQuota: 'usage',
            };
            this.storageSort.set(map[sort.active] ?? 'total');
            this.storageDirection.set(sort.direction as 'asc' | 'desc');
        }
        this.storagePage.set(0);
        this.loadStorage();
    }

    searchStorage(): void {
        this.storagePage.set(0);
        this.loadStorage();
    }

    // ── Tags ──
    readonly tags = signal<AllowedTagResponse[]>([]);
    readonly loadingTags = signal(true);
    tagColumns = ['name', 'actions'];
    tagForm = this.fb.nonNullable.group({
        name: ['', Validators.required],
    });

    loadTags(): void {
        this.loadingTags.set(true);
        this.adminApi.getApiAdminTags().subscribe({
            next: (t) => { this.tags.set(t); this.loadingTags.set(false); },
            error: () => this.loadingTags.set(false),
        });
    }

    createTag(): void {
        if (this.tagForm.invalid) return;
        const val = this.tagForm.getRawValue();
        this.adminApi.postApiAdminTags(val).subscribe({
            next: (t) => {
                this.tags.update(list => [...list, t]);
                this.tagForm.reset({ name: '' });
                this.toast.success(ADMIN.tagCreated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToCreateTag),
        });
    }

    deleteTag(tag: AllowedTagResponse): void {
        const ref = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.deleteTag, message: DIALOGS.deleteTagMsg(tag.name), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminTagsId(tag.id as number).subscribe({
                    next: () => {
                        this.tags.update(list => list.filter(t => t.id !== tag.id));
                        this.toast.success(ADMIN.tagDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToDeleteTag),
                });
            }
        });
    }

    // ── Versions ──
    readonly versions = signal<AllowedVersionResponse[]>([]);
    readonly loadingVersions = signal(true);
    versionColumns = ['name', 'actions'];
    versionForm = this.fb.nonNullable.group({
        name: ['', Validators.required],
    });

    loadVersions(): void {
        this.loadingVersions.set(true);
        this.adminApi.getApiAdminVersions().subscribe({
            next: (v) => { this.versions.set(v); this.loadingVersions.set(false); },
            error: () => this.loadingVersions.set(false),
        });
    }

    createVersion(): void {
        if (this.versionForm.invalid) return;
        const val = this.versionForm.getRawValue();
        this.adminApi.postApiAdminVersions(val).subscribe({
            next: (v) => {
                this.versions.update(list => [...list, v]);
                this.versionForm.reset({ name: '' });
                this.toast.success(ADMIN.versionCreated);
            },
            error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToCreateVersion),
        });
    }

    deleteVersion(version: AllowedVersionResponse): void {
        const ref = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.deleteVersion, message: DIALOGS.deleteVersionMsg(version.name), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        ref.afterClosed().subscribe((ok) => {
            if (ok) {
                this.adminApi.deleteApiAdminVersionsId(version.id as number).subscribe({
                    next: () => {
                        this.versions.update(list => list.filter(v => v.id !== version.id));
                        this.toast.success(ADMIN.versionDeleted);
                    },
                    error: (err) => this.toast.error(err.error?.detail ?? ADMIN.failedToDeleteVersion),
                });
            }
        });
    }
}
