import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { debounceTime, Subject, switchMap, of, forkJoin, map } from 'rxjs';
import { SchematicsService } from '../../api/schematics';
import type { SchematicListItemResponse, AllowedTagResponse, AllowedVersionResponse } from '../../api/generated.schemas';
import { SchematicCardComponent } from '../../shared/components/schematic-card/schematic-card.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { SCHEMATICS } from '../../i18n/labels';
import { sortVersionsDesc } from '../../shared/utils/version-sort';

@Component({
    selector: 'app-schematics-list',
    standalone: true,
    imports: [
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatIconModule,
        MatPaginatorModule,
        MatCardModule,
        MatChipsModule,
        MatProgressSpinnerModule,
        MatAutocompleteModule,
        MatTooltipModule,
        CdkDrag,
        CdkDropList,
        CdkDragHandle,
        SchematicCardComponent,
        LoadingSpinnerComponent,
        EmptyStateComponent,
    ],
    templateUrl: './schematics-list.component.html',
    styleUrl: './schematics-list.component.scss',
})
export class SchematicsListComponent implements OnInit, OnDestroy {
    private schematicsApi = inject(SchematicsService);
    private fb = inject(FormBuilder);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private toast = inject(ToastService);
    session = inject(SessionService);

    private pendingScrollRestore: number | null = null;

    readonly schematics = signal<SchematicListItemResponse[]>([]);
    readonly totalCount = signal(0);
    readonly currentPage = signal(1);
    readonly pageSize = signal(21);
    readonly loading = signal(true);

    search = '';
    tag = '';
    type = '';
    version = '';
    sort = 'date';
    direction = 'desc';

    // Create form
    readonly showCreate = signal(false);
    readonly creating = signal(false);
    pictureFiles: File[] = [];
    litematicFiles: File[] = [];
    readonly picturePreviews = signal<string[]>([]);
    readonly coverIndex = signal(0);

    createForm = this.fb.nonNullable.group({
        name: ['', Validators.required],
        description: [''],
        tags: [[] as string[]],
        versions: [[] as string[]],
        schematicType: ['Redstone'],
        visibility: ['Public'],
        downloadLinkMediaFire: [''],
        youtubeLink: [''],
    });

    // Autocomplete
    readonly searchSuggestions = signal<{ label: string; type: 'schematic' | 'user' }[]>([]);
    readonly tagSuggestions = signal<string[]>([]);
    readonly allowedTags = signal<AllowedTagResponse[]>([]);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);
    private searchInput$ = new Subject<string>();
    private tagInput$ = new Subject<string>();

    ngOnInit(): void {
        // Restore scroll position on back-navigation
        const saved = sessionStorage.getItem('schematics_scroll');
        if (saved) {
            this.pendingScrollRestore = parseInt(saved, 10);
            sessionStorage.removeItem('schematics_scroll');
        }

        // Load allowed tags & versions
        this.schematicsApi.getApiSchematicsTags().subscribe(tags => this.allowedTags.set(tags));
        this.schematicsApi.getApiSchematicsVersions().subscribe(versions => this.allowedVersions.set(sortVersionsDesc(versions)));

        // React to query param changes (external navigation, tag clicks, back/forward)
        this.route.queryParams.subscribe(params => {
            this.search = params['search'] ?? '';
            this.tag = params['tag'] ?? '';
            this.type = params['type'] ?? '';
            this.version = params['version'] ?? '';
            this.sort = params['sort'] ?? 'date';
            this.direction = params['direction'] ?? 'desc';
            const ps = parseInt(params['pageSize'], 10);
            if (ps > 0) this.pageSize.set(ps);
            const page = parseInt(params['page'], 10);
            this.loadData(page > 0 ? page : 1);
        });

        // Search autocomplete — combines schematic names + user suggestions
        this.searchInput$.pipe(
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
        ).subscribe(suggestions => this.searchSuggestions.set(suggestions));

        // Tag autocomplete
        this.tagInput$.pipe(
            debounceTime(300),
            switchMap(q => q.length >= 1
                ? this.schematicsApi.getApiSchematicsSearchTags({ q })
                : of([] as string[])
            ),
        ).subscribe(tags => this.tagSuggestions.set(tags));
    }

    onSearchInput(q: string): void { this.searchInput$.next(q); }
    onTagInput(q: string): void { this.tagInput$.next(q); }

    onSuggestionSelected(event: any): void {
        const suggestion = event.option.value as { label: string; type: 'schematic' | 'user' };
        this.search = suggestion.label;
        this.loadPage(1);
    }

    displaySuggestion(val: any): string {
        return val?.label ?? val ?? '';
    }

    loadPage(page: number): void {
        // Update URL — the queryParams subscription will trigger loadData
        this.router.navigate([], {
            queryParams: {
                search: this.search || null,
                tag: this.tag || null,
                type: this.type || null,
                version: this.version || null,
                sort: this.sort !== 'date' ? this.sort : null,
                direction: this.direction !== 'desc' ? this.direction : null,
                pageSize: this.pageSize() !== 21 ? this.pageSize() : null,
                page: page > 1 ? page : null,
            },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }

    private loadData(page: number): void {
        this.loading.set(true);
        this.currentPage.set(page);

        this.schematicsApi.getApiSchematics({
            page,
            pageSize: this.pageSize(),
            search: this.search || undefined,
            tag: this.tag || undefined,
            type: this.type || undefined,
            version: this.version || undefined,
            sort: this.sort || undefined,
            direction: this.direction || undefined,
        }).subscribe({
            next: (res) => {
                this.schematics.set(res.items);
                this.totalCount.set(res.totalCount as any);
                this.pageSize.set(res.pageSize as any);
                this.loading.set(false);

                if (this.pendingScrollRestore != null) {
                    const y = this.pendingScrollRestore;
                    this.pendingScrollRestore = null;
                    setTimeout(() => window.scrollTo(0, y));
                }
            },
            error: () => this.loading.set(false),
        });
    }

    ngOnDestroy(): void {
        sessionStorage.setItem('schematics_scroll', String(window.scrollY));
    }

    onPageChange(event: PageEvent): void {
        if (event.pageSize !== this.pageSize()) {
            this.pageSize.set(event.pageSize);
            this.loadPage(1);
            return;
        }
        this.loadPage(event.pageIndex + 1);
    }

    toggleDirection(): void {
        this.direction = this.direction === 'asc' ? 'desc' : 'asc';
        this.loadPage(1);
    }

    clearFilters(): void {
        this.search = '';
        this.tag = '';
        this.type = '';
        this.version = '';
        this.sort = 'date';
        this.direction = 'desc';
        this.loadPage(1);
    }

    private readonly MAX_FILES = 10;
    private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    onPicturesSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        const oversized = newFiles.filter(f => f.size > this.MAX_FILE_SIZE);
        if (oversized.length) {
            this.toast.error(`${oversized.length} file(s) exceed the 5 MB limit and were skipped.`);
        }
        const valid = newFiles.filter(f => f.size <= this.MAX_FILE_SIZE);
        const total = this.pictureFiles.length + valid.length;
        if (total > this.MAX_FILES) {
            this.toast.error(`Maximum ${this.MAX_FILES} pictures allowed. You have ${this.pictureFiles.length}, tried to add ${valid.length}.`);
            const allowed = valid.slice(0, this.MAX_FILES - this.pictureFiles.length);
            this.pictureFiles = [...this.pictureFiles, ...allowed];
        } else {
            this.pictureFiles = [...this.pictureFiles, ...valid];
        }
        this.regeneratePreviews();
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    onLitematicsSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        const oversized = newFiles.filter(f => f.size > this.MAX_FILE_SIZE);
        if (oversized.length) {
            this.toast.error(`${oversized.length} file(s) exceed the 5 MB limit and were skipped.`);
        }
        const valid = newFiles.filter(f => f.size <= this.MAX_FILE_SIZE);
        const total = this.litematicFiles.length + valid.length;
        if (total > this.MAX_FILES) {
            this.toast.error(`Maximum ${this.MAX_FILES} litematic files allowed. You have ${this.litematicFiles.length}, tried to add ${valid.length}.`);
            const allowed = valid.slice(0, this.MAX_FILES - this.litematicFiles.length);
            this.litematicFiles = [...this.litematicFiles, ...allowed];
        } else {
            this.litematicFiles = [...this.litematicFiles, ...valid];
        }
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    removePicture(index: number): void {
        this.pictureFiles = this.pictureFiles.filter((_, i) => i !== index);
        if (this.coverIndex() >= this.pictureFiles.length) {
            this.coverIndex.set(Math.max(0, this.pictureFiles.length - 1));
        } else if (this.coverIndex() > index) {
            this.coverIndex.update(i => i - 1);
        }
        this.regeneratePreviews();
    }

    movePicture(index: number, direction: number): void {
        const target = index + direction;
        if (target < 0 || target >= this.pictureFiles.length) return;
        const files = [...this.pictureFiles];
        [files[index], files[target]] = [files[target], files[index]];
        this.pictureFiles = files;
        this.regeneratePreviews();
    }

    dropPicture(event: CdkDragDrop<File[]>): void {
        const files = [...this.pictureFiles];
        moveItemInArray(files, event.previousIndex, event.currentIndex);
        this.pictureFiles = files;
        this.regeneratePreviews();
    }

    dropLitematic(event: CdkDragDrop<File[]>): void {
        const files = [...this.litematicFiles];
        moveItemInArray(files, event.previousIndex, event.currentIndex);
        this.litematicFiles = files;
    }

    removeLitematic(index: number): void {
        this.litematicFiles = this.litematicFiles.filter((_, i) => i !== index);
    }

    setCover(index: number): void {
        if (index === 0) return; // already first
        const files = [...this.pictureFiles];
        const [moved] = files.splice(index, 1);
        files.unshift(moved);
        this.pictureFiles = files;
        this.coverIndex.set(0);
        this.regeneratePreviews();
    }

    private regeneratePreviews(): void {
        const previews: string[] = [];
        for (const f of this.pictureFiles) {
            previews.push(URL.createObjectURL(f));
        }
        this.picturePreviews.set(previews);
    }

    submitCreate(): void {
        if (this.createForm.invalid) return;
        if (this.pictureFiles.length < 1) {
            this.toast.error(SCHEMATICS.atLeastOnePicture);
            return;
        }
        if (this.litematicFiles.length < 1) {
            this.toast.error(SCHEMATICS.atLeastOneLitematic);
            return;
        }
        this.creating.set(true);
        const v = this.createForm.getRawValue();

        // Reorder pictures so the cover is first
        const ordered = [...this.pictureFiles];
        if (this.coverIndex() > 0 && ordered.length > 1) {
            const [cover] = ordered.splice(this.coverIndex(), 1);
            ordered.unshift(cover);
        }

        this.schematicsApi.postApiSchematics({
            Name: v.name,
            Description: v.description || undefined,
            SchematicsPictureFiles: ordered.length ? ordered as any : undefined,
            LitematicFiles: this.litematicFiles.length ? this.litematicFiles as any : undefined,
            DownloadLinkMediaFire: v.downloadLinkMediaFire || undefined,
            YoutubeLink: v.youtubeLink || undefined,
            Tags: v.tags.length ? v.tags.join(',') : undefined,
            Versions: v.versions.length ? v.versions.join(',') : undefined,
            CoverImageIndex: ordered.length > 1 ? 0 : undefined,
            SchematicType: v.schematicType,
            Visibility: v.visibility,
        }).subscribe({
            next: (created: any) => {
                this.creating.set(false);
                this.showCreate.set(false);
                this.createForm.reset({ name: '', description: '', tags: [], versions: [], schematicType: 'Redstone', visibility: 'Public', downloadLinkMediaFire: '', youtubeLink: '' });
                this.pictureFiles = [];
                this.litematicFiles = [];
                this.picturePreviews.set([]);
                this.coverIndex.set(0);
                this.toast.success(SCHEMATICS.schematicUploaded, {
                    onUndo: () => {
                        if (created?.id) {
                            this.schematicsApi.deleteApiSchematicsId(created.id).subscribe({
                                next: () => this.toast.success(SCHEMATICS.uploadUndone),
                                error: () => this.toast.error(SCHEMATICS.failedToUndoUpload),
                            });
                        }
                    },
                });
                this.router.navigate(['/schematics', created.id]);
            },
            error: (err) => {
                this.creating.set(false);
                this.toast.error(err.error?.detail ?? SCHEMATICS.uploadFailed);
            },
        });
    }
}
