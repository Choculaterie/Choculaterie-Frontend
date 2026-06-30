import { Component, OnInit, OnDestroy, inject, signal, computed, effect, Injector, ElementRef, ViewChild, afterNextRender } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent, MatPaginatorIntl } from '@angular/material/paginator';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { debounceTime, Subject, switchMap, of, forkJoin, map } from 'rxjs';
import { SchematicsService } from '../../api/schematics';
import type { SchematicListItemResponse, AllowedTagResponse, AllowedVersionResponse, AuthorSearchResultResponse } from '../../api/generated.schemas';
import { SchematicCardComponent } from '../../shared/components/schematic-card/schematic-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { SCHEMATICS } from '../../i18n/labels';
import { sortVersionsDesc } from '../../shared/utils/version-sort';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';
import { IsometricScreenshotDialogComponent, type IsometricScreenshotData } from '../../shared/components/litematic-viewer/isometric-screenshot-dialog.component';
import { TagSuggestDialogComponent } from '../../shared/components/tag-suggest-dialog/tag-suggest-dialog.component';
import { DropZoneDirective } from '../../shared/directives/drop-zone.directive';

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
        MatAutocompleteModule,
        MatTooltipModule,
        MatSlideToggleModule,
        RouterLink,
        CdkDrag,
        CdkDropList,
        CdkDragHandle,
        SchematicCardComponent,
        EmptyStateComponent,
        DropZoneDirective,
    ],
    providers: [
        {
            provide: MatPaginatorIntl,
            useFactory: () => {
                const intl = new MatPaginatorIntl();
                intl.getRangeLabel = (page: number, pageSize: number, length: number) => {
                    const totalPages = Math.ceil(length / pageSize);
                    return `${page + 1} of ${totalPages}`;
                };
                return intl;
            },
        },
    ],
    templateUrl: './schematics-list.component.html',
    styleUrl: './schematics-list.component.scss',
})
export class SchematicsListComponent implements OnInit, OnDestroy {
    private readonly MAX_SELECTIONS = 10;
    readonly pageSizeOptions = [12, 24, 48] as const;
    private readonly defaultPageSize = 24;
    private schematicsApi = inject(SchematicsService);
    private fb = inject(FormBuilder);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private toast = inject(ToastService);
    private dialog = inject(MatDialog);
    session = inject(SessionService);
    private injector = inject(Injector);
    private gridResizeObserver?: ResizeObserver;

    constructor() {
        // Attach ResizeObserver after each time the grid renders (loading → false)
        effect(() => {
            if (!this.loading()) {
                afterNextRender(() => this.attachGridObserver(), { injector: this.injector });
            }
        });
    }

    private pendingScrollRestore: number | null = null;

    private readonly rawSchematics = signal<SchematicListItemResponse[]>([]);
    private readonly numColumns = signal(1);
    readonly schematics = computed(() => this.rawSchematics());
    // Cards have variable height (description length, tags, etc.), so CSS `columns:` balances
    // column breaks by total height, not by item count - any fixed count-per-column
    // redistribution meant to "undo" its column-major fill silently desyncs from where the
    // browser actually breaks columns, scrambling the read order. Explicit per-column arrays
    // sidestep this entirely: each item's column is assigned here, not guessed at by the browser.
    readonly schematicColumns = computed(() =>
        this.distributeIntoColumns(this.rawSchematics(), this.numColumns()));
    @ViewChild('schematicGrid') private schematicGrid?: ElementRef<HTMLElement>;
    readonly totalCount = signal(0);
    readonly currentPage = signal(1);
    readonly pageSize = signal(this.defaultPageSize);
    readonly loading = signal(true);

    search = '';
    tag = '';
    type = '';
    version = '';
    sort = 'date';
    direction = 'desc';
    includeUnverified = false;
    includeModules = false;

    readonly showAdvancedFilters = signal(false);
    readonly filtersHeight = signal('0px');
    @ViewChild('filtersInner') private filtersInner?: ElementRef<HTMLElement>;

    toggleFilters(): void {
        const opening = !this.showAdvancedFilters();
        this.showAdvancedFilters.set(opening);
        if (opening) {
            // Let Angular render the content first, then read its natural height
            requestAnimationFrame(() => {
                const h = this.filtersInner?.nativeElement.scrollHeight ?? 0;
                this.filtersHeight.set(h + 'px');
                // Reset to auto after transition so resize still works
                this.filtersInner?.nativeElement.closest('.advanced-filters-wrapper')?.addEventListener(
                    'transitionend', () => this.filtersHeight.set('auto'), { once: true }
                );
            });
        } else {
            // Snap from auto back to px so the transition has a from-value
            const h = this.filtersInner?.nativeElement.scrollHeight ?? 0;
            this.filtersHeight.set(h + 'px');
            requestAnimationFrame(() => this.filtersHeight.set('0px'));
        }
    }

    readonly hasActiveFilters = computed(() => !!this.tag || !!this.type || !!this.version || this.includeUnverified);

    /** True when the user is logged in but has NOT linked their Minecraft account */
    readonly showUnverifiedBanner = computed(() => {
        if (!this.session.isAuthenticated()) return false;
        const profile = this.session.profile();
        return profile ? !profile.isMinecraftLinked : false;
    });

    /** The URL path to the user's own profile */
    readonly ownProfilePath = computed(() => {
        const username = this.session.user()?.username;
        return username ? `/users/${username}` : '/profile';
    });

    // Create form
    readonly showCreate = signal(false);
    readonly creating = signal(false);
    readonly isModuleUpload = signal(false);
    pictureFiles: File[] = [];
    litematicFiles: File[] = [];
    readonly picturePreviews = signal<string[]>([]);
    readonly coverIndex = signal(0);

    createForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(50)]],
        authorName: [''],
        description: ['', Validators.maxLength(2000)],
        tags: [[] as string[]],
        versions: [[] as string[]],
        schematicType: ['Redstone'],
        visibility: ['Public'],
        downloadLinkMediaFire: ['', Validators.maxLength(500)],
        youtubeLink: ['', Validators.maxLength(500)],
    });

    // Autocomplete
    readonly searchSuggestions = signal<{ label: string; type: 'schematic' | 'user' }[]>([]);
    readonly authorSuggestions = signal<AuthorSearchResultResponse[]>([]);
    readonly selectedAuthorId = signal<string | null>(null);
    readonly createTagList = signal<string[]>([]);
    readonly createVersionList = signal<string[]>([]);
    readonly allowedTags = signal<AllowedTagResponse[]>([]);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);
    readonly tagInputValue = signal('');
    readonly versionInputValue = signal('');
    readonly filteredTags = computed(() => {
        const q = this.tagInputValue().toLowerCase();
        const selected = this.createTagList();
        return this.allowedTags()
            .map(t => t.name)
            .filter(name => !selected.includes(name))
            .filter(name => !q || name.toLowerCase().includes(q));
    });
    readonly filteredVersions = computed(() => {
        const q = this.versionInputValue().toLowerCase();
        const selected = this.createVersionList();
        return this.allowedVersions()
            .map(v => v.name)
            .filter(name => !selected.includes(name))
            .filter(name => !q || name.toLowerCase().includes(q));
    });
    private searchInput$ = new Subject<string>();
    private authorInput$ = new Subject<string>();

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
            this.includeUnverified = params['includeUnverified'] === 'true';
            this.includeModules = params['includeModules'] === 'true';
            const parsedPageSize = Number.parseInt(params['pageSize'], 10);
            this.pageSize.set(this.normalizePageSize(Number.isNaN(parsedPageSize) ? null : parsedPageSize));
            // Auto-expand advanced filters when any advanced filter is active (no animation)
            if (this.hasActiveFilters()) {
                this.showAdvancedFilters.set(true);
                this.filtersHeight.set('auto');
            }
            const page = Number.parseInt(params['page'], 10);
            this.loadData(page > 0 ? page : 1);
        });

        // Search autocomplete - combines schematic names + user suggestions
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

        // Author autocomplete (free input, suggestions are optional)
        this.authorInput$.pipe(
            debounceTime(300),
            switchMap(q => q.length >= 2
                ? this.schematicsApi.getApiSchematicsSearchAuthors({ q })
                : of([] as AuthorSearchResultResponse[])
            ),
        ).subscribe(authors => this.authorSuggestions.set(authors));
    }

    onSearchInput(q: string): void { this.searchInput$.next(q); }
    onAuthorInput(q: string): void {
        this.selectedAuthorId.set(null);
        this.authorInput$.next(q);
    }
    onTagInput(q: string): void { this.tagInputValue.set(q); }
    onVersionInput(q: string): void { this.versionInputValue.set(q); }

    onCreateTagSelected(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
        const val = event.option.value as string;
        if (val === '__suggest__') {
            this.openTagSuggest();
        } else if (this.createTagList().length >= this.MAX_SELECTIONS) {
            this.toast.error('You can select up to 10 tags.');
        } else if (!this.createTagList().includes(val)) {
            this.createTagList.update(tags => [...tags, val]);
        }
        input.value = '';
        this.tagInputValue.set('');
    }

    removeCreateTag(tag: string): void {
        this.createTagList.update(tags => tags.filter(t => t !== tag));
    }

    onCreateVersionSelected(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
        const val = event.option.value as string;
        if (this.createVersionList().length >= this.MAX_SELECTIONS) {
            this.toast.error('You can select up to 10 versions.');
        } else if (!this.createVersionList().includes(val)) {
            this.createVersionList.update(versions => [...versions, val]);
        }
        input.value = '';
        this.versionInputValue.set('');
    }

    onCreateAuthorSelected(event: MatAutocompleteSelectedEvent): void {
        const author = event.option.value as AuthorSearchResultResponse;
        this.createForm.controls.authorName.setValue(author.username);
        this.selectedAuthorId.set(author.userId);
    }

    displayAuthor(author: AuthorSearchResultResponse | string | null): string {
        if (!author) return '';
        return typeof author === 'string' ? author : author.username;
    }

    removeCreateVersion(version: string): void {
        this.createVersionList.update(versions => versions.filter(v => v !== version));
    }

    onSuggestionSelected(event: any): void {
        const suggestion = event.option.value as { label: string; type: 'schematic' | 'user' };
        this.search = suggestion.label;
        this.loadPage(1);
    }

    displaySuggestion(val: any): string {
        return val?.label ?? val ?? '';
    }

    loadPage(page: number): void {
        // Update URL - the queryParams subscription will trigger loadData
        this.router.navigate([], {
            queryParams: {
                search: this.search || null,
                tag: this.tag || null,
                type: this.type || null,
                version: this.version || null,
                sort: this.sort !== 'date' ? this.sort : null,
                direction: this.direction !== 'desc' ? this.direction : null,
                includeUnverified: this.includeUnverified ? 'true' : null,
                includeModules: this.includeModules ? 'true' : null,
                pageSize: this.pageSize() !== this.defaultPageSize ? this.pageSize() : null,
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
            includeUnverified: this.includeUnverified || undefined,
            includeModules: this.includeModules || undefined,
        }).subscribe({
            next: (res) => {
                this.rawSchematics.set(res.items);
                this.totalCount.set(res.totalCount as any);
                this.pageSize.set(this.normalizePageSize(res.pageSize as number | null | undefined));
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
        this.gridResizeObserver?.disconnect();
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

    onUploadClick(): void {
        if (!this.session.isAuthenticated()) {
            this.router.navigate(['/auth/register']);
            return;
        }
        this.showCreate.set(!this.showCreate());
    }

    clearFilters(): void {
        this.search = '';
        this.tag = '';
        this.type = '';
        this.version = '';
        this.sort = 'date';
        this.direction = 'desc';
        this.includeUnverified = false;
        this.includeModules = false;
        this.loadPage(1);
    }

    toggleIncludeUnverified(): void {
        this.includeUnverified = !this.includeUnverified;
        this.loadPage(1);
    }

    toggleIncludeModules(): void {
        this.includeModules = !this.includeModules;
        this.loadPage(1);
    }

    private normalizePageSize(pageSize: number | null | undefined): number {
        return this.pageSizeOptions.includes(pageSize as (typeof this.pageSizeOptions)[number])
            ? pageSize as (typeof this.pageSizeOptions)[number]
            : this.defaultPageSize;
    }

    private readonly MAX_FILES = 10;
    private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    onPicturesSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        this.addPictureFiles(newFiles);
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    onLitematicsSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        this.addLitematicFiles(newFiles);
        input.value = '';
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior }), 0);
    }

    onFilesDropped(files: File[]): void {
        const images = files.filter(f => f.type.startsWith('image/'));
        const litematics = files.filter(f => f.name.toLowerCase().endsWith('.litematic'));
        if (images.length) this.addPictureFiles(images);
        if (litematics.length) this.addLitematicFiles(litematics);
    }

    onPicturesDropped(files: File[]): void {
        this.addPictureFiles(files);
    }

    onLitematicsDropped(files: File[]): void {
        this.addLitematicFiles(files);
    }

    private addPictureFiles(newFiles: File[]): void {
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
    }

    private addLitematicFiles(newFiles: File[]): void {
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
        if (this.createTagList().length > this.MAX_SELECTIONS) {
            this.toast.error('You can select up to 10 tags.');
            return;
        }
        if (this.createVersionList().length > this.MAX_SELECTIONS) {
            this.toast.error('You can select up to 10 versions.');
            return;
        }
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
            AuthorName: this.selectedAuthorId() || v.authorName || undefined,
            Description: v.description ?? undefined,
            SchematicsPictureFiles: ordered.length ? ordered as any : undefined,
            LitematicFiles: this.litematicFiles.length ? this.litematicFiles as any : undefined,
            DownloadLinkMediaFire: v.downloadLinkMediaFire ?? undefined,
            YoutubeLink: v.youtubeLink ?? undefined,
            Tags: this.createTagList().length ? this.createTagList().join(',') : undefined,
            Versions: this.createVersionList().length ? this.createVersionList().join(',') : undefined,
            CoverImageIndex: ordered.length > 1 ? 0 : undefined,
            SchematicType: v.schematicType,
            Visibility: v.visibility,
            IsModule: this.isModuleUpload() || undefined,
        }).subscribe({
            next: (created: any) => {
                this.creating.set(false);
                this.showCreate.set(false);
                this.isModuleUpload.set(false);
                this.selectedAuthorId.set(null);
                this.createTagList.set([]);
                this.createVersionList.set([]);
                this.createForm.reset({ name: '', authorName: '', description: '', tags: [], versions: [], schematicType: 'Redstone', visibility: 'Public', downloadLinkMediaFire: '', youtubeLink: '' });
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

    viewIn3DLocal(file: File): void {
        file.arrayBuffer().then(buffer => {
            this.dialog.open(LitematicViewerComponent, {
                data: { fileData: buffer, fileName: file.name } as LitematicViewerData,
                width: '90vw',
                maxWidth: '1200px',
                panelClass: 'litematic-viewer-dialog',
            });
        });
    }

    generatePictureLocal(file: File): void {
        file.arrayBuffer().then(buffer => {
            const dialogRef = this.dialog.open(IsometricScreenshotDialogComponent, {
                data: { fileData: buffer, fileName: file.name, mode: 'edit' } as IsometricScreenshotData,
                width: '90vw',
                maxWidth: '1200px',
                panelClass: 'litematic-viewer-dialog',
            });
            dialogRef.afterClosed().subscribe((result: File | null) => {
                if (result instanceof File) {
                    this.addScreenshotToPictures(result);
                }
            });
        });
    }

    private addScreenshotToPictures(file: File): void {
        if (this.pictureFiles.length >= this.MAX_FILES) {
            this.toast.error(`Maximum ${this.MAX_FILES} pictures allowed.`);
            return;
        }
        this.pictureFiles = [...this.pictureFiles, file];
        this.regeneratePreviews();
        this.toast.success('Screenshot added to pictures.');
    }

    openTagSuggest(): void {
        this.dialog.open(TagSuggestDialogComponent, { width: '420px' });
    }

    private attachGridObserver(): void {
        const el = this.schematicGrid?.nativeElement;
        if (!el) return;
        this.gridResizeObserver?.disconnect();
        // Use entry.contentRect.width - the actual rendered width of the grid element.
        // This is accurate in every browser regardless of scrollbar model.
        this.gridResizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? el.clientWidth;
            // gap is 1rem = 16px; 260px matches `.schematic-column`'s intended min width.
            const cols = Math.max(1, Math.floor((width + 16) / (260 + 16)));
            if (cols !== this.numColumns()) {
                this.numColumns.set(cols);
            }
        });
        this.gridResizeObserver.observe(el);
    }

    /** Round-robin item `i` into column `i % numCols`, so reading across columns (row-major) always matches `items`' own order, regardless of how tall any individual card renders. */
    private distributeIntoColumns(
        items: SchematicListItemResponse[], numCols: number,
    ): { item: SchematicListItemResponse; index: number }[][] {
        const cols: { item: SchematicListItemResponse; index: number }[][] = Array.from({ length: Math.max(1, numCols) }, () => []);
        items.forEach((item, index) => cols[index % cols.length].push({ item, index }));
        return cols;
    }
}
