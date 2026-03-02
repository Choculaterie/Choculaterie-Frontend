import { Component, OnInit, inject, signal, Injector, afterNextRender } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ModsService } from '../../api/mods';
import { SchematicsService } from '../../api/schematics';
import type { ModListItemResponse, AllowedVersionResponse } from '../../api/generated.schemas';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { ModFilePipe } from '../../shared/pipes/image-url.pipe';
import { MODS, DIALOGS, COMMON } from '../../i18n/labels';
import { sortVersionsDesc } from '../../shared/utils/version-sort';

@Component({
    selector: 'app-mod-detail',
    standalone: true,
    imports: [
        FormsModule,
        RouterLink,
        MatCardModule,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatDividerModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatTooltipModule,
        LoadingSpinnerComponent,
        EmptyStateComponent,
        NumberFormatPipe,
        ModFilePipe,
    ],
    templateUrl: './mod-detail.component.html',
    styleUrl: './mod-detail.component.scss',
})
export class ModDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private modsApi = inject(ModsService);
    private schematicsApi = inject(SchematicsService);
    private dialog = inject(MatDialog);
    private session = inject(SessionService);
    private toast = inject(ToastService);

    modName = '';
    readonly versions = signal<ModListItemResponse[]>([]);
    readonly modImage = signal<string | null>(null);
    readonly loading = signal(true);
    readonly showForm = signal(false);
    readonly formLoading = signal(false);
    readonly editingMod = signal<ModListItemResponse | null>(null);

    displayedColumns = ['description', 'releaseType', 'gameVersion', 'platform', 'downloads', 'actions'];

    formTitle = '';
    formDesc = '';
    formRelease = 'Stable';
    formVersions: string[] = [];
    formPlatform = 'Fabric';
    formFile: File | null = null;
    formImage: File | null = null;
    readonly imagePreview = signal<string | null>(null);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);

    isAdmin(): boolean {
        return this.session.isAdminOrMod();
    }

    ngOnInit(): void {
        this.modName = decodeURIComponent(this.route.snapshot.paramMap.get('modName') ?? '');
        this.loadVersions();
        this.schematicsApi.getApiSchematicsVersions().subscribe(v => this.allowedVersions.set(sortVersionsDesc(v)));
    }

    private readonly injector = inject(Injector);

    private scrollToForm(): void {
        afterNextRender(() => {
            setTimeout(() => {
                document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }, { injector: this.injector });
    }

    loadVersions(): void {
        this.loading.set(true);
        this.modsApi.getApiMods().subscribe({
            next: (all) => {
                const filtered = all.filter(m => m.title === this.modName);
                this.versions.set(filtered);
                const img = filtered.find(v => v.imagePath)?.imagePath ?? null;
                this.modImage.set(img);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    toggleForm(): void {
        if (this.showForm()) {
            this.resetForm();
        } else {
            this.formTitle = this.modName;
            this.showForm.set(true);
            this.scrollToForm();
        }
    }

    downloadMod(mod: ModListItemResponse): void {
        this.modsApi.getApiModsIdDownload<Blob>(mod.id as any, {
            responseType: 'blob',
        } as any).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob as Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = mod.title || 'mod-download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.toast.success(MODS.downloadStarted);
            },
            error: (err) => this.toast.error(err.error?.detail ?? err.error?.message ?? MODS.downloadFailed),
        });
    }

    editMod(mod: ModListItemResponse): void {
        this.modsApi.getApiModsId(mod.id as any).subscribe({
            next: (fresh) => this.populateForm(fresh),
            error: () => this.populateForm(mod),
        });
    }

    private populateForm(mod: ModListItemResponse): void {
        this.editingMod.set(mod);
        this.formTitle = mod.title;
        this.formDesc = mod.description;
        this.formRelease = mod.releaseType;
        this.formVersions = mod.gameVersion.split(',').map(v => v.trim()).filter(Boolean);
        this.formPlatform = mod.platform;
        this.showForm.set(true);
        this.scrollToForm();
    }

    createMod(): void {
        this.formLoading.set(true);
        this.modsApi.postApiMods({
            Title: this.formTitle || this.modName, Description: this.formDesc,
            ReleaseType: this.formRelease, GameVersion: this.formVersions.join(', '), Platform: this.formPlatform,
            File: this.formFile as any, Image: this.formImage as any,
        }).subscribe({
            next: () => { this.toast.success(MODS.versionCreated); this.resetForm(); this.loadVersions(); },
            error: (err) => { this.formLoading.set(false); this.toast.error(err.error?.detail ?? MODS.createFailed); },
        });
    }

    updateMod(): void {
        const mod = this.editingMod()!;
        this.formLoading.set(true);
        this.modsApi.putApiModsId(
            mod.id as any,
            {
                Title: this.formTitle || this.modName, Description: this.formDesc,
                ReleaseType: this.formRelease, GameVersion: this.formVersions.join(', '), Platform: this.formPlatform,
                File: this.formFile as any, Image: this.formImage as any,
            },
        ).subscribe({
            next: () => { this.toast.success(MODS.versionUpdated); this.resetForm(); this.loadVersions(); },
            error: (err) => { this.formLoading.set(false); this.toast.error(err.error?.detail ?? MODS.updateFailed); },
        });
    }

    deleteMod(mod: ModListItemResponse): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: DIALOGS.deleteVersion,
                message: MODS.deleteModMsg(mod.title, mod.gameVersion, mod.platform),
                confirmText: COMMON.delete, warn: true,
            } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.modsApi.deleteApiModsId(mod.id as any).subscribe({
                    next: () => { this.toast.success(MODS.versionDeleted); this.loadVersions(); },
                    error: (err) => this.toast.error(err.error?.detail ?? MODS.deleteFailed),
                });
            }
        });
    }

    resetForm(): void {
        this.editingMod.set(null);
        this.showForm.set(false);
        this.formLoading.set(false);
        this.formTitle = '';
        this.formDesc = '';
        this.formRelease = 'Stable';
        this.formVersions = [];
        this.formPlatform = 'Fabric';
        this.formFile = null;
        this.formImage = null;
        this.imagePreview.set(null);
    }

    onFileSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        this.formFile = input.files?.[0] ?? null;
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    onImageSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        this.formImage = input.files?.[0] ?? null;
        if (this.formImage) {
            this.imagePreview.set(URL.createObjectURL(this.formImage));
        } else {
            this.imagePreview.set(null);
        }
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }
}
