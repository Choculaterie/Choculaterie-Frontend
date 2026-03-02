import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { matfMinecraftColored, matfMinecraftFabricColored } from '@ng-icons/material-file-icons/colored';
import { ModsService } from '../../api/mods';
import { SchematicsService } from '../../api/schematics';
import type { ModListItemResponse, AllowedVersionResponse } from '../../api/generated.schemas';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { environment } from '../../environments/environment';
import { MODS } from '../../i18n/labels';
import { compareVersions, sortVersionsDesc } from '../../shared/utils/version-sort';

interface ModSummary {
    name: string;
    description: string;
    versionCount: number;
    totalDownloads: number;
    versionRange: string;
    platform: string;
    imagePath: string | null;
}

@Component({
    selector: 'app-mods',
    standalone: true,
    imports: [
        FormsModule,
        RouterLink,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatDividerModule,
        MatSelectModule,
        MatFormFieldModule,
        MatInputModule,
        LoadingSpinnerComponent,
        EmptyStateComponent,
        NumberFormatPipe,
        NgIconComponent,
    ],
    viewProviders: [provideIcons({ matfMinecraftColored, matfMinecraftFabricColored })],
    templateUrl: './mods.component.html',
    styleUrl: './mods.component.scss',
})
export class ModsComponent implements OnInit {
    private modsApi = inject(ModsService);
    private schematicsApi = inject(SchematicsService);
    private session = inject(SessionService);
    private toast = inject(ToastService);
    private router = inject(Router);

    readonly mods = signal<ModListItemResponse[]>([]);
    readonly modSummaries = signal<ModSummary[]>([]);
    readonly loading = signal(true);
    readonly showCreateForm = signal(false);
    readonly formLoading = signal(false);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);

    formTitle = '';
    formDesc = '';
    formRelease = 'Stable';
    formVersions: string[] = [];
    formPlatform = 'Fabric';

    isAdmin(): boolean {
        return this.session.isAdminOrMod();
    }

    ngOnInit(): void {
        this.loadMods();
        this.schematicsApi.getApiSchematicsVersions().subscribe(v => this.allowedVersions.set(sortVersionsDesc(v)));
    }

    loadMods(): void {
        this.loading.set(true);
        this.modsApi.getApiMods().subscribe({
            next: (res) => {
                this.mods.set(res);
                this.buildSummaries(res);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    private buildSummaries(mods: ModListItemResponse[]): void {
        const map = new Map<string, ModListItemResponse[]>();
        for (const mod of mods) {
            const group = map.get(mod.title) || [];
            group.push(mod);
            map.set(mod.title, group);
        }
        const summaries: ModSummary[] = Array.from(map.entries()).map(([name, versions]) => {
            const totalDownloads = versions.reduce((sum, v) => sum + Number(v.downloadCount), 0);
            const latest = versions[0];
            // Use the imagePath from the API; if null the template shows an icon
            const img = versions.find(v => v.imagePath)?.imagePath ?? null;
            // Collect all unique game versions across all entries and compute range
            const allGameVersions = [...new Set(
                versions.flatMap(v => v.gameVersion.split(',').map(s => s.trim()).filter(Boolean))
            )].sort(compareVersions);
            const versionRange = allGameVersions.length > 1
                ? `${allGameVersions[0]} – ${allGameVersions[allGameVersions.length - 1]}`
                : allGameVersions[0] ?? latest.gameVersion;
            return {
                name,
                description: latest.description,
                versionCount: versions.length,
                totalDownloads,
                versionRange,
                platform: latest.platform,
                imagePath: img ? `${environment.apiBasePath}/files/mods/${img}` : null,
            };
        });
        this.modSummaries.set(summaries);
    }

    openMod(name: string): void {
        this.router.navigate(['/mods', name]);
    }

    toggleCreate(): void {
        this.showCreateForm.update(v => !v);
        if (this.showCreateForm()) {
            setTimeout(() => document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        }
    }

    cancelCreate(): void {
        this.showCreateForm.set(false);
        this.formTitle = '';
        this.formDesc = '';
        this.formRelease = 'Stable';
        this.formVersions = [];
        this.formPlatform = 'Fabric';
    }

    createMod(): void {
        const title = this.formTitle.trim();
        if (!title) return;
        this.formLoading.set(true);
        this.modsApi.postApiMods({
            Title: title, Description: this.formDesc,
            ReleaseType: this.formRelease, GameVersion: this.formVersions.join(', '), Platform: this.formPlatform,
        }).subscribe({
            next: () => {
                this.toast.success(MODS.modCreated);
                this.cancelCreate();
                this.formLoading.set(false);
                this.router.navigate(['/mods', title]);
            },
            error: (err) => {
                this.formLoading.set(false);
                this.toast.error(err.error?.detail ?? MODS.createFailed);
            },
        });
    }
}
