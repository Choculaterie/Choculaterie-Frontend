import { FilePickDirective } from '../../shared/directives/file-pick.directive';
import { MediaSkeletonDirective } from '../../shared/directives/media-skeleton.directive';
import { scrollIntoViewSoon, scrollBackTo } from '../../shared/utils/scroll';
import { EmojifyPipe } from '../../shared/pipes/emojify.pipe';
import { Component, OnInit, inject, signal, Injector, afterNextRender } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';
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
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { ModFilePipe } from '../../shared/pipes/image-url.pipe';
import { SkeletonImgComponent } from '../../shared/components/skeleton-img/skeleton-img.component';
import { DropZoneDirective } from '../../shared/directives/drop-zone.directive';
import { MODS, DIALOGS, COMMON } from '../../i18n/labels';
import { sortVersionsDesc } from '../../shared/utils/version-sort';
import { parseModJar } from '../../shared/utils/parse-mod-jar';
import { dependencyLabel, dependencyOptions, formatModVersion, modLabel, parseDependencies, pickDependency, resolveDependencyMods } from '../../shared/utils/mod-dependencies';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-mod-detail',
    standalone: true,
    imports: [FilePickDirective, MediaSkeletonDirective, EmojifyPipe, TPipe, 
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
        EmptyStateComponent,
        NumberFormatPipe,
        ModFilePipe,
        SkeletonImgComponent,
        DropZoneDirective,
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
    readonly allMods = signal<ModListItemResponse[]>([]);
    readonly modImage = signal<string | null>(null);
    readonly loading = signal(true);
    readonly showForm = signal(false);
    readonly formLoading = signal(false);
    readonly editingMod = signal<ModListItemResponse | null>(null);

    displayedColumns = ['modVersion', 'description', 'releaseType', 'gameVersion', 'platform', 'downloads', 'actions'];

    formTitle = '';
    formModVersion = '';
    formDesc = '';
    formRelease = 'Stable';
    formVersions: string[] = [];
    formPlatform = 'Fabric';
    formDependencies: string[] = [];
    formFile: File | null = null;
    formImage: File | null = null;
    readonly imagePreview = signal<string | null>(null);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);
    readonly dependencyLabel = dependencyLabel;
    readonly formatModVersion = formatModVersion;

    availableDependencies(): string[] {
        return dependencyOptions(this.allMods(), this.modName, this.formDependencies);
    }

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
                document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }, { injector: this.injector });
    }

    loadVersions(): void {
        this.loading.set(true);
        this.modsApi.getApiMods().subscribe({
            next: (all) => {
                this.allMods.set(all);
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
            this.formDependencies = [];
            this.showForm.set(true);
            this.scrollToForm();
        }
    }

    downloadMod(mod: ModListItemResponse): void {
        const depMods = resolveDependencyMods(mod, this.allMods());
        if (!depMods.length) {
            this.startDownloads([mod]);
            return;
        }
        const names = depMods.map(modLabel).join(', ');
        this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: MODS.downloadDepsTitle,
                message: MODS.downloadDepsMsg(names),
                confirmText: MODS.downloadWithDeps,
                cancelText: MODS.downloadOnlyThis,
            } as ConfirmDialogData,
        }).afterClosed().subscribe((includeDeps) => {
            if (includeDeps === true) this.startDownloads([mod, ...depMods]);
            else if (includeDeps === false) this.startDownloads([mod]);
        });
    }

    private startDownloads(mods: ModListItemResponse[]): void {
        for (const mod of mods) {
            const name = (mod.title || 'mod-download').trim() || 'mod-download';
            const a = document.createElement('a');
            a.href = `${environment.apiBasePath}/api/Mods/${mod.id}/download`;
            a.download = name.toLowerCase().endsWith('.jar') ? name : `${name}.jar`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        this.toast.success(MODS.downloadStarted);
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
        this.formModVersion = mod.modVersion ?? '';
        this.formDesc = mod.description;
        this.formRelease = mod.releaseType;
        this.formVersions = mod.gameVersion.split(',').map(v => v.trim()).filter(Boolean);
        this.formPlatform = mod.platform;
        this.formDependencies = parseDependencies(mod.dependencies);
        this.showForm.set(true);
        this.scrollToForm();
    }

    createMod(): void {
        this.formLoading.set(true);
        this.modsApi.postApiMods({
            Title: this.formTitle || this.modName, ModVersion: this.formModVersion.trim(), Description: this.formDesc,
            ReleaseType: this.formRelease, GameVersion: this.formVersions.join(', '), Platform: this.formPlatform,
            Dependencies: this.formDependencies.join(', '),
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
                Title: this.formTitle || this.modName, ModVersion: this.formModVersion.trim(), Description: this.formDesc,
                ReleaseType: this.formRelease, GameVersion: this.formVersions.join(', '), Platform: this.formPlatform,
                Dependencies: this.formDependencies.join(', '),
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
        if (this.showForm()) scrollBackTo('.page-header');
        this.editingMod.set(null);
        this.showForm.set(false);
        this.formLoading.set(false);
        this.formTitle = '';
        this.formModVersion = '';
        this.formDesc = '';
        this.formRelease = 'Stable';
        this.formVersions = [];
        this.formPlatform = 'Fabric';
        this.formDependencies = [];
        this.formFile = null;
        this.formImage = null;
        this.imagePreview.set(null);
    }

    onFileSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;
        this.formFile = file;
        input.value = '';
        if (file) void this.applyJarMetadata(file);
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    private async applyJarMetadata(file: File): Promise<void> {
        const parsed = await parseModJar(file, {
            allowedGameVersions: this.allowedVersions().map(v => v.name),
            siteModTitles: this.allMods().map(m => m.title).filter(t => t !== this.modName),
        });
        if (!parsed) return;

        if (parsed.gameVersions.length) {
            this.formVersions = [...parsed.gameVersions];
        }
        if (parsed.platform) {
            this.formPlatform = parsed.platform;
        }
        this.formDependencies = [
            ...parsed.dependencyTitles.map(t => pickDependency(this.allMods(), t, this.formVersions, this.formPlatform)),
            ...parsed.unresolvedDependencies,
        ];
        if (parsed.version) {
            this.formModVersion = parsed.version;
        }
        if (!this.editingMod()) {
            if (parsed.name && (!this.formTitle || this.formTitle === this.modName)) {
                this.formTitle = parsed.name;
            }
            if (parsed.description && !this.formDesc.trim()) {
                this.formDesc = parsed.description;
            }
        }
        if (parsed.iconFile && !this.formImage) {
            this.formImage = parsed.iconFile;
            this.imagePreview.set(URL.createObjectURL(parsed.iconFile));
        }
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

    onFilesDropped(files: File[]): void {
        let jar: File | null = null;
        for (const file of files) {
            if (file.name.endsWith('.jar')) {
                this.formFile = file;
                jar = file;
            } else if (file.type.startsWith('image/')) {
                this.formImage = file;
                this.imagePreview.set(URL.createObjectURL(file));
            }
        }
        if (!this.showForm()) {
            this.showForm.set(true);
            this.formTitle = this.formTitle || this.modName;
        }
        if (jar) void this.applyJarMetadata(jar);
    }
}
