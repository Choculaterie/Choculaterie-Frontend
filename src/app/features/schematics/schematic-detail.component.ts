import { Component, OnInit, DestroyRef, inject, signal, computed, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDragHandle, moveItemInArray } from '@angular/cdk/drag-drop';
import { SchematicsService } from '../../api/schematics';
import { ReportsService } from '../../api/reports';
import { ShortUrlService } from '../../api/short-url';
import type { SchematicDetailResponse, SchematicFileResponse, SchematicPictureResponse, AllowedTagResponse, AllowedVersionResponse } from '../../api/generated.schemas';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { UserLinkComponent } from '../../shared/components/user-link/user-link.component';
import { ReportDialogComponent, ReportDialogData, ReportDialogResult } from '../../shared/components/report-dialog/report-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { DownloadPickerComponent, DownloadPickerData } from '../../shared/components/download-picker/download-picker.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { SCHEMATICS, DIALOGS, COMMON } from '../../i18n/labels';
import { SchematicImgPipe } from '../../shared/pipes/image-url.pipe';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { sortVersionsDesc } from '../../shared/utils/version-sort';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';
import { IsometricScreenshotDialogComponent, type IsometricScreenshotData } from '../../shared/components/litematic-viewer/isometric-screenshot-dialog.component';
import { BlockTextureService } from '../../shared/components/litematic-viewer/block-texture.service';
import { TagSuggestDialogComponent } from '../../shared/components/tag-suggest-dialog/tag-suggest-dialog.component';

@Component({
    selector: 'app-schematic-detail',
    standalone: true,
    imports: [
        RouterLink,
        DatePipe,
        ReactiveFormsModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatDividerModule,
        MatTooltipModule,
        MatMenuModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatProgressSpinnerModule,
        CdkDrag,
        CdkDropList,
        CdkDragHandle,
        LoadingSpinnerComponent,
        UserLinkComponent,
        SchematicImgPipe,
        MarkdownPipe,
        NumberFormatPipe,
    ],
    templateUrl: './schematic-detail.component.html',
    styleUrl: './schematic-detail.component.scss',
})
export class SchematicDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private destroyRef = inject(DestroyRef);
    private router = inject(Router);
    private schematicsApi = inject(SchematicsService);
    private reportsApi = inject(ReportsService);
    private shortUrlApi = inject(ShortUrlService);
    private dialog = inject(MatDialog);
    private session = inject(SessionService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);
    private sanitizer = inject(DomSanitizer);
    private blockTextures = inject(BlockTextureService);

    readonly schematic = signal<SchematicDetailResponse | null>(null);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly selectedImage = signal(0);
    readonly editing = signal(false);
    /** Map of block name (e.g. "spruce_slab") → [x, y, w, h] atlas pixel rect */
    readonly blockTextureMap = signal<Map<string, [number, number, number, number]>>(new Map());
    readonly atlasUrl = this.blockTextures.atlasUrl;
    readonly hasLitematicFiles: Signal<boolean> = computed(() => {
        const s = this.schematic();
        return !!s && s.files.some(f => f.name.endsWith('.litematic'));
    });

    // YouTube embed helpers
    getYouTubeId(url: string | null): string | null {
        if (!url) return null;
        const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
        return m?.[1] ?? null;
    }

    getYouTubeThumb(url: string | null): string | null {
        const id = this.getYouTubeId(url);
        return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
    }

    getYouTubeEmbedUrl(url: string | null): SafeResourceUrl | null {
        const id = this.getYouTubeId(url);
        return id ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${id}`) : null;
    }
    readonly saving = signal(false);
    readonly allowedTags = signal<AllowedTagResponse[]>([]);
    readonly allowedVersions = signal<AllowedVersionResponse[]>([]);

    editForm = this.fb.nonNullable.group({
        name: ['', Validators.required],
        description: [''],
        tags: [[] as string[]],
        versions: [[] as string[]],
        schematicType: [''],
        visibility: ['Public'],
        downloadLinkMediaFire: [''],
        youtubeLink: [''],
    });

    // Edit file management
    private readonly MAX_FILES = 10;
    private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    /** Unified ordered list of existing + new pictures (supports cross-category D&D) */
    readonly editPictureItems = signal<(
        | { type: 'existing'; pic: SchematicPictureResponse }
        | { type: 'new'; file: File; preview: string }
    )[]>([]);
    /** Unified ordered list of existing + new files */
    readonly editFileItems = signal<(
        | { type: 'existing'; file: SchematicFileResponse }
        | { type: 'new'; file: File }
    )[]>([]);
    readonly editRemovedPictureIds = signal<(number | string)[]>([]);
    readonly editRemovedFileIds = signal<(number | string)[]>([]);
    readonly editFileError = signal('');
    readonly editCoverIndex = signal(0);

    isEditFileValid(): boolean {
        return this.editPictureItems().length >= 1 && this.editFileItems().length >= 1;
    }

    isOwner(): boolean {
        const s = this.schematic();
        return !!s && s.userId === (this.session.profile()?.id ?? '');
    }

    ngOnInit(): void {
        // Load allowed tags & versions for the edit form
        this.schematicsApi.getApiSchematicsTags().subscribe(tags => this.allowedTags.set(tags));
        this.schematicsApi.getApiSchematicsVersions().subscribe(versions => this.allowedVersions.set(sortVersionsDesc(versions)));

        // React to route param changes so re-navigating to a different schematic
        // (e.g. after forking) reloads the data without tearing down the component.
        this.route.paramMap.pipe(
            takeUntilDestroyed(this.destroyRef),
            switchMap(params => {
                const id = params.get('id')!;
                this.loading.set(true);
                this.error.set('');
                this.schematic.set(null);
                this.selectedImage.set(0);
                this.editing.set(false);
                return this.schematicsApi.getApiSchematicsId(id);
            }),
        ).subscribe({
            next: (res) => {
                this.schematic.set(res);
                this.loading.set(false);
                this.resolveBlockTextures(res);
            },
            error: (err) => {
                this.loading.set(false);
                this.error.set(err.error?.detail ?? 'Schematic not found.');
            },
        });
    }

    toggleLike(): void {
        if (!this.session.isAuthenticated()) {
            this.router.navigate(['/auth/register']);
            return;
        }
        const s = this.schematic()!;
        this.schematicsApi.postApiSchematicsIdLike(s.id).subscribe({
            next: (res) => {
                this.schematic.set({ ...s, isLiked: res.isLiked, likesCount: res.likesCount });
                this.toast.success(res.isLiked ? SCHEMATICS.liked : SCHEMATICS.likeRemoved, {
                    onUndo: () => this.toggleLike(),
                });
            },
            error: (err) => this.toast.error(err.error?.detail ?? SCHEMATICS.failedToToggleLike),
        });
    }

    download(): void {
        const s = this.schematic()!;
        if (s.files.length === 1) {
            this.downloadSingleFile(s.files[0]);
        } else if (s.files.length > 1) {
            this.showDownloadPicker(s);
        } else {
            this.downloadAllAsZip(s);
        }
    }

    downloadSingleFile(file: SchematicFileResponse): void {
        const s = this.schematic()!;
        this.schematicsApi.getApiSchematicsIdDownloadFileId<Blob>(s.id, Number(file.id), {
            responseType: 'blob',
        } as any).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob as Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
            },
            error: (err) => this.toast.error(err.error?.detail ?? err.error?.message ?? SCHEMATICS.downloadFailed),
        });
    }

    private downloadAllAsZip(s: SchematicDetailResponse): void {
        this.schematicsApi.getApiSchematicsIdDownload<Blob>(s.id, {
            responseType: 'blob',
        } as any).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob as Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${s.name}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                this.toast.success(SCHEMATICS.downloadStarted);
            },
            error: (err) => this.toast.error(err.error?.detail ?? err.error?.message ?? SCHEMATICS.downloadFailed),
        });
    }

    private showDownloadPicker(s: SchematicDetailResponse): void {
        const dialogRef = this.dialog.open(DownloadPickerComponent, {
            data: {
                title: 'Download Files',
                files: s.files.map(f => ({ id: f.id, name: f.name })),
            } as DownloadPickerData,
            width: '360px',
        });
        dialogRef.afterClosed().subscribe((result: { type: 'single'; index: number } | { type: 'zip' } | null) => {
            if (!result) return;
            if (result.type === 'zip') {
                this.downloadAllAsZip(s);
            } else {
                this.downloadSingleFile(s.files[result.index]);
            }
        });
    }

    fork(): void {
        if (!this.session.isAuthenticated()) {
            this.router.navigate(['/auth/register']);
            return;
        }
        const s = this.schematic()!;
        this.schematicsApi.postApiSchematicsIdFork(s.id).subscribe({
            next: (forked: any) => {
                this.toast.success(SCHEMATICS.schematicForked, {
                    onUndo: () => {
                        if (forked?.id) {
                            this.schematicsApi.deleteApiSchematicsId(forked.id).subscribe({
                                next: () => {
                                    this.toast.success(SCHEMATICS.forkUndone);
                                    this.router.navigate(['/schematics']);
                                },
                                error: () => this.toast.error(SCHEMATICS.failedToUndoFork),
                            });
                        }
                    },
                });
                if (forked?.id) {
                    this.router.navigate(['/schematics', forked.id]);
                }
            },
            error: (err) => this.toast.error(err.error?.detail ?? SCHEMATICS.forkFailed),
        });
    }

    navigateToOriginal(id: string): void {
        this.router.navigate(['/schematics', id]);
    }

    report(): void {
        if (!this.session.isAuthenticated()) {
            this.router.navigate(['/auth/register']);
            return;
        }
        const s = this.schematic()!;
        const dialogRef = this.dialog.open(ReportDialogComponent, {
            data: { type: 'schematic', targetId: s.id, targetName: s.name } as ReportDialogData,
            width: '400px',
        });
        dialogRef.afterClosed().subscribe((result: ReportDialogResult | undefined) => {
            if (result) {
                this.reportsApi.postApiReportsSchematic({ schematicId: s.id, reason: null }).subscribe({
                    next: () => this.toast.success(SCHEMATICS.reportSubmitted),
                    error: (err) => this.toast.error(err.error?.detail ?? SCHEMATICS.failedToReport),
                });
            }
        });
    }

    startEdit(): void {
        const s = this.schematic()!;
        this.editForm.patchValue({
            name: s.name,
            description: s.description ?? '',
            tags: s.tags ?? [],
            versions: s.versions ?? [],
            schematicType: s.schematicType,
            visibility: s.visibility,
            downloadLinkMediaFire: s.downloadLinkMediaFire ?? '',
            youtubeLink: s.youtubeLink ?? '',
        });
        // Initialize unified ordered arrays
        this.editPictureItems.set(s.pictures.map(p => ({ type: 'existing' as const, pic: p })));
        this.editFileItems.set(s.files.map(f => ({ type: 'existing' as const, file: f })));
        this.editRemovedPictureIds.set([]);
        this.editRemovedFileIds.set([]);
        this.editFileError.set('');
        this.editCoverIndex.set((s as any).coverImageIndex ?? 0);
        this.editing.set(true);
        setTimeout(() => document.querySelector('.edit-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    // --- Edit file management methods ---

    setEditCover(index: number): void {
        if (index === 0) return;
        const items = [...this.editPictureItems()];
        const [moved] = items.splice(index, 1);
        items.unshift(moved);
        this.editPictureItems.set(items);
        this.editCoverIndex.set(0);
    }

    dropPicture(event: CdkDragDrop<void>): void {
        const items = [...this.editPictureItems()];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.editPictureItems.set(items);
        this.editCoverIndex.set(0);
    }

    dropFile(event: CdkDragDrop<void>): void {
        const items = [...this.editFileItems()];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.editFileItems.set(items);
    }

    removePicture(index: number): void {
        const items = [...this.editPictureItems()];
        const removed = items[index];
        items.splice(index, 1);
        if (removed.type === 'existing') {
            this.editRemovedPictureIds.update(ids => [...ids, removed.pic.id]);
        }
        this.editPictureItems.set(items);
        if (this.editCoverIndex() === index) {
            this.editCoverIndex.set(0);
        } else if (this.editCoverIndex() > index) {
            this.editCoverIndex.update(i => i - 1);
        }
        if (this.editCoverIndex() >= items.length) {
            this.editCoverIndex.set(Math.max(0, items.length - 1));
        }
        this.validateEditFiles();
    }

    removeFile(index: number): void {
        const items = [...this.editFileItems()];
        const removed = items[index];
        items.splice(index, 1);
        if (removed.type === 'existing') {
            this.editRemovedFileIds.update(ids => [...ids, removed.file.id]);
        }
        this.editFileItems.set(items);
        this.validateEditFiles();
    }

    onEditPicturesSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        const oversized = newFiles.filter(f => f.size > this.MAX_FILE_SIZE);
        if (oversized.length) {
            this.toast.error(`${oversized.length} file(s) exceed the 5 MB limit and were skipped.`);
        }
        const valid = newFiles.filter(f => f.size <= this.MAX_FILE_SIZE);
        const currentCount = this.editPictureItems().length;
        let toAdd = valid;
        if (currentCount + valid.length > this.MAX_FILES) {
            toAdd = valid.slice(0, Math.max(0, this.MAX_FILES - currentCount));
            this.toast.error(`Maximum ${this.MAX_FILES} pictures allowed.`);
        }
        const newItems = toAdd.map(f => ({
            type: 'new' as const,
            file: f,
            preview: URL.createObjectURL(f),
        }));
        this.editPictureItems.update(items => [...items, ...newItems]);
        this.validateEditFiles();
        input.value = '';
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }

    onEditLitematicsSelected(event: Event): void {
        const scrollY = window.scrollY;
        const input = event.target as HTMLInputElement;
        const newFiles = input.files ? Array.from(input.files) : [];
        const oversized = newFiles.filter(f => f.size > this.MAX_FILE_SIZE);
        if (oversized.length) {
            this.toast.error(`${oversized.length} file(s) exceed the 5 MB limit and were skipped.`);
        }
        const valid = newFiles.filter(f => f.size <= this.MAX_FILE_SIZE);
        const currentCount = this.editFileItems().length;
        let toAdd = valid;
        if (currentCount + valid.length > this.MAX_FILES) {
            toAdd = valid.slice(0, Math.max(0, this.MAX_FILES - currentCount));
            this.toast.error(`Maximum ${this.MAX_FILES} litematic files allowed.`);
        }
        const newItems = toAdd.map(f => ({ type: 'new' as const, file: f }));
        this.editFileItems.update(items => [...items, ...newItems]);
        this.validateEditFiles();
        input.value = '';
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }

    private validateEditFiles(): void {
        const totalPics = this.editPictureItems().length;
        const totalFiles = this.editFileItems().length;
        if (totalPics < 1) {
            this.editFileError.set('At least 1 picture is required.');
        } else if (totalFiles < 1) {
            this.editFileError.set('At least 1 litematic file is required.');
        } else {
            this.editFileError.set('');
        }
    }

    submitEdit(): void {
        if (this.editForm.invalid || !this.isEditFileValid()) return;
        this.saving.set(true);
        const s = this.schematic()!;
        const v = this.editForm.getRawValue();
        const removePicIds = this.editRemovedPictureIds();
        const removeFileIds = this.editRemovedFileIds();

        // Build interleaved picture order: "42,new:0,43,new:1"
        // New files are collected in the order they appear in the unified list.
        // The backend assigns order via these tokens, so interleaving is fully preserved.
        const pictureOrderTokens: string[] = [];
        const newPics: File[] = [];
        for (const item of this.editPictureItems()) {
            if (item.type === 'existing') {
                pictureOrderTokens.push(String(item.pic.id));
            } else {
                pictureOrderTokens.push(`new:${newPics.length}`);
                newPics.push(item.file);
            }
        }
        const pictureOrder = pictureOrderTokens.length > 0 ? pictureOrderTokens.join(',') : undefined;

        // Build interleaved file order: "7,new:0,8,new:1"
        const fileOrderTokens: string[] = [];
        const newLitematics: File[] = [];
        for (const item of this.editFileItems()) {
            if (item.type === 'existing') {
                fileOrderTokens.push(String(item.file.id));
            } else {
                fileOrderTokens.push(`new:${newLitematics.length}`);
                newLitematics.push(item.file);
            }
        }
        const fileOrder = fileOrderTokens.length > 0 ? fileOrderTokens.join(',') : undefined;

        this.schematicsApi.putApiSchematicsId(
            s.id,
            {
                Name: v.name,
                Description: v.description || undefined,
                DownloadLinkMediaFire: v.downloadLinkMediaFire || undefined,
                YoutubeLink: v.youtubeLink || undefined,
                Tags: v.tags.length ? v.tags.join(',') : undefined,
                Versions: v.versions.length ? v.versions.join(',') : undefined,
                SchematicType: v.schematicType,
                Visibility: v.visibility,
                RemovePictureIds: removePicIds.length ? removePicIds.join(',') : undefined,
                RemoveFileIds: removeFileIds.length ? removeFileIds.join(',') : undefined,
                NewPictureFiles: newPics.length ? newPics as any : undefined,
                NewLitematicFiles: newLitematics.length ? newLitematics as any : undefined,
                PictureOrder: pictureOrder,
                FileOrder: fileOrder,
            },
        ).subscribe({
            next: () => {
                this.saving.set(false);
                this.editing.set(false);
                this.toast.success(SCHEMATICS.schematicUpdated);
                // Reload detail
                this.selectedImage.set(0);
                this.schematicsApi.getApiSchematicsId(s.id).subscribe({
                    next: (updated) => {
                        this.schematic.set(updated);
                        this.resolveBlockTextures(updated);
                    },
                });
            },
            error: (err) => {
                this.saving.set(false);
                this.toast.error(err.error?.detail ?? SCHEMATICS.updateFailed);
            },
        });
    }

    shareSchematic(): void {
        const s = this.schematic()!;
        const fullUrl = `${window.location.origin}/schematics/${s.id}`;
        this.shortUrlApi.postApiShortUrls({ longUrl: fullUrl, screenshotPath: null }).subscribe({
            next: (res) => {
                navigator.clipboard.writeText(res.shortUrl).then(
                    () => this.toast.success(SCHEMATICS.shortLinkCopied),
                    () => this.toast.info(`Short link: ${res.shortUrl}`),
                );
            },
            error: () => {
                navigator.clipboard.writeText(fullUrl).then(
                    () => this.toast.success(SCHEMATICS.linkCopied),
                    () => this.toast.info(`Link: ${fullUrl}`),
                );
            },
        });
    }

    deleteSchematic(): void {
        const s = this.schematic()!;
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: { title: DIALOGS.deleteSchematic, message: DIALOGS.deleteSchematicMsg(s.name), confirmText: COMMON.delete, warn: true } as ConfirmDialogData,
        });
        dialogRef.afterClosed().subscribe((confirmed) => {
            if (confirmed) {
                this.schematicsApi.deleteApiSchematicsId(s.id).subscribe({
                    next: () => { this.toast.success(SCHEMATICS.schematicDeleted); this.router.navigate(['/schematics']); },
                    error: (err) => this.toast.error(err.error?.detail ?? SCHEMATICS.deleteFailed),
                });
            }
        });
    }

    parseBlockList(blockList: string): { name: string; count: string }[] {
        const raw = blockList.split(',').map(entry => {
            const [rawName, count] = entry.trim().split(':');
            return { name: (rawName || '').trim(), count: parseInt(count?.trim() || '1', 10) };
        }).filter(b => b.name);

        // Group similar blocks (e.g. wall_torch + torch → Torch)
        const grouped = new Map<string, { displayName: string; count: number }>();
        for (const { name, count } of raw) {
            const normalized = this.normalizeBlockName(name);
            const display = normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const existing = grouped.get(normalized);
            if (existing) {
                existing.count += count;
            } else {
                grouped.set(normalized, { displayName: display, count });
            }
        }

        // Sort by count descending, then alphabetically
        return [...grouped.values()]
            .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName))
            .map(g => ({ name: g.displayName, count: String(g.count) }));
    }

    /** Normalize block variant names so wall/directional variants are grouped with their base. */
    private normalizeBlockName(name: string): string {
        // Exact renames
        const ALIASES: Record<string, string> = {
            wall_torch: 'torch',
            redstone_wall_torch: 'redstone_torch',
            soul_wall_torch: 'soul_torch',
            wall_banner: 'banner',
        };
        if (ALIASES[name]) return ALIASES[name];

        // Pattern-based: *_wall_sign → *_sign, *_wall_banner → *_banner, *_wall_hanging_sign → *_hanging_sign
        if (name.endsWith('_wall_sign')) return name.replace('_wall_sign', '_sign');
        if (name.endsWith('_wall_banner')) return name.replace('_wall_banner', '_banner');
        if (name.endsWith('_wall_hanging_sign')) return name.replace('_wall_hanging_sign', '_hanging_sign');
        if (name.endsWith('_wall_fan')) return name.replace('_wall_fan', '_fan_coral');

        return name;
    }

    /**
     * Collect all unique block names from file blockLists and resolve their atlas textures.
     * Also resolves normalized names so grouped blocks still get textures.
     */
    private resolveBlockTextures(schematic: SchematicDetailResponse): void {
        const allNames = new Set<string>();
        for (const f of schematic.files) {
            if (f.blockList) {
                for (const entry of f.blockList.split(',')) {
                    const rawName = entry.trim().split(':')[0];
                    if (rawName) {
                        allNames.add(rawName);
                        // Also add the normalized name (for grouped blocks)
                        const normalized = this.normalizeBlockName(rawName);
                        if (normalized !== rawName) allNames.add(normalized);
                    }
                }
            }
        }
        if (!allNames.size) return;
        this.blockTextures.resolveAll([...allNames]).subscribe(m => this.blockTextureMap.set(m));
    }

    /** Get atlas rect for a block name (display name with spaces) */
    getBlockRect(displayName: string): [number, number, number, number] | undefined {
        const key = displayName.toLowerCase().replace(/ /g, '_');
        return this.blockTextureMap().get(key);
    }

    viewIn3DAction(): void {
        const s = this.schematic()!;
        const litematicFiles = s.files.filter(f => f.name.endsWith('.litematic'));
        if (litematicFiles.length === 1) {
            this.viewIn3D(litematicFiles[0]);
        } else if (litematicFiles.length > 1) {
            const dialogRef = this.dialog.open(DownloadPickerComponent, {
                data: {
                    title: 'View in 3D',
                    files: litematicFiles.map(f => ({ id: f.id, name: f.name })),
                    showZip: false,
                } as DownloadPickerData,
                width: '360px',
            });
            dialogRef.afterClosed().subscribe((result: { type: 'single'; index: number } | null) => {
                if (!result || result.type !== 'single') return;
                this.viewIn3D(litematicFiles[result.index]);
            });
        }
    }

    viewIn3D(file: SchematicFileResponse): void {
        const s = this.schematic()!;
        this.schematicsApi.getApiSchematicsIdDownloadFileId<Blob>(s.id, Number(file.id), {
            responseType: 'blob',
        } as any).subscribe({
            next: (blob) => {
                (blob as Blob).arrayBuffer().then(buffer => {
                    this.dialog.open(LitematicViewerComponent, {
                        data: { fileData: buffer, fileName: file.name } as LitematicViewerData,
                        width: '90vw',
                        maxWidth: '1200px',
                        panelClass: 'litematic-viewer-dialog',
                    });
                });
            },
            error: (err) => this.toast.error(err.error?.detail ?? 'Failed to load file for 3D viewer.'),
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

    generatePicture(file: SchematicFileResponse): void {
        const s = this.schematic()!;
        this.schematicsApi.getApiSchematicsIdDownloadFileId<Blob>(s.id, Number(file.id), {
            responseType: 'blob',
        } as any).subscribe({
            next: (blob) => {
                (blob as Blob).arrayBuffer().then(buffer => {
                    const dialogRef = this.dialog.open(IsometricScreenshotDialogComponent, {
                        data: {
                            fileData: buffer,
                            fileName: file.name,
                            mode: this.editing() ? 'edit' : 'download',
                        } as IsometricScreenshotData,
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
            },
            error: (err) => this.toast.error(err.error?.detail ?? 'Failed to load file.'),
        });
    }

    generatePictureLocal(file: File): void {
        file.arrayBuffer().then(buffer => {
            const dialogRef = this.dialog.open(IsometricScreenshotDialogComponent, {
                data: {
                    fileData: buffer,
                    fileName: file.name,
                    mode: 'edit',
                } as IsometricScreenshotData,
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

    generatePictureForItem(item: { type: 'existing'; file: SchematicFileResponse } | { type: 'new'; file: File }): void {
        if (item.type === 'existing') this.generatePicture(item.file);
        else this.generatePictureLocal(item.file);
    }

    viewIn3DForItem(item: { type: 'existing'; file: SchematicFileResponse } | { type: 'new'; file: File }): void {
        if (item.type === 'existing') this.viewIn3D(item.file);
        else this.viewIn3DLocal(item.file);
    }

    private addScreenshotToPictures(file: File): void {
        if (this.editing()) {
            if (this.editPictureItems().length >= this.MAX_FILES) {
                this.toast.error(`Maximum ${this.MAX_FILES} pictures allowed.`);
                return;
            }
            this.editPictureItems.update(items => [...items, {
                type: 'new' as const,
                file,
                preview: URL.createObjectURL(file),
            }]);
            this.validateEditFiles();
            this.toast.success('Screenshot added to pictures.');
        } else {
            // In read-only mode, download the screenshot
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    openTagSuggest(): void {
        this.dialog.open(TagSuggestDialogComponent, { width: '420px' });
    }
}
