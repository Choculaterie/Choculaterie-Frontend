import { Component, OnInit, inject, signal, computed, type Signal } from '@angular/core';
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
import { BlockTextureService } from '../../shared/components/litematic-viewer/block-texture.service';

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
    readonly editExistingPictures = signal<SchematicPictureResponse[]>([]);
    readonly editExistingFiles = signal<SchematicFileResponse[]>([]);
    readonly editNewPictures = signal<File[]>([]);
    readonly editNewPicturePreviews = signal<string[]>([]);
    readonly editNewLitematics = signal<File[]>([]);
    readonly editRemovedPictureIds = signal<(number | string)[]>([]);
    readonly editRemovedFileIds = signal<(number | string)[]>([]);
    readonly editFileError = signal('');
    readonly editCoverIndex = signal(0);

    isEditFileValid(): boolean {
        const totalPics = this.editExistingPictures().length + this.editNewPictures().length;
        const totalFiles = this.editExistingFiles().length + this.editNewLitematics().length;
        return totalPics >= 1 && totalFiles >= 1;
    }

    isOwner(): boolean {
        const s = this.schematic();
        return !!s && s.userId === (this.session.profile()?.id ?? '');
    }

    ngOnInit(): void {
        // Load allowed tags & versions for the edit form
        this.schematicsApi.getApiSchematicsTags().subscribe(tags => this.allowedTags.set(tags));
        this.schematicsApi.getApiSchematicsVersions().subscribe(versions => this.allowedVersions.set(sortVersionsDesc(versions)));

        const id = this.route.snapshot.paramMap.get('id')!;
        this.schematicsApi.getApiSchematicsId(id).subscribe({
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
                                next: () => this.toast.success(SCHEMATICS.forkUndone),
                                error: () => this.toast.error(SCHEMATICS.failedToUndoFork),
                            });
                        }
                    },
                });
            },
            error: (err) => this.toast.error(err.error?.detail ?? SCHEMATICS.forkFailed),
        });
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
        // Initialize file state
        this.editExistingPictures.set([...s.pictures]);
        this.editExistingFiles.set([...s.files]);
        this.editNewPictures.set([]);
        this.editNewPicturePreviews.set([]);
        this.editNewLitematics.set([]);
        this.editRemovedPictureIds.set([]);
        this.editRemovedFileIds.set([]);
        this.editFileError.set('');
        this.editCoverIndex.set((s as any).coverImageIndex ?? 0);
        this.editing.set(true);
        setTimeout(() => document.querySelector('.edit-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    // --- Edit file management methods ---

    setEditCover(index: number): void {
        if (index === 0) return; // already first
        const existingCount = this.editExistingPictures().length;
        if (index < existingCount) {
            // Move existing picture to first position
            const pics = [...this.editExistingPictures()];
            const [moved] = pics.splice(index, 1);
            pics.unshift(moved);
            this.editExistingPictures.set(pics);
        } else {
            // Move new picture to first of new pictures, then move it before existing
            const newIdx = index - existingCount;
            const newPics = [...this.editNewPictures()];
            const [moved] = newPics.splice(newIdx, 1);
            newPics.unshift(moved);
            this.editNewPictures.set(newPics);
            this.regenerateEditPicturePreviews();
            // If there are existing pictures, we can't easily put a new pic before them,
            // but the server uses the combined order: existing (by PictureOrder) + new pics
            // So we just make it first of new pics
        }
        this.editCoverIndex.set(0);
    }

    moveExistingPicture(index: number, direction: -1 | 1): void {
        const pics = [...this.editExistingPictures()];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= pics.length) return;
        [pics[index], pics[newIndex]] = [pics[newIndex], pics[index]];
        // Adjust cover index to follow the moved picture
        const cover = this.editCoverIndex();
        if (cover === index) this.editCoverIndex.set(newIndex);
        else if (cover === newIndex) this.editCoverIndex.set(index);
        this.editExistingPictures.set(pics);
    }

    dropExistingPicture(event: CdkDragDrop<void>): void {
        const totalExisting = this.editExistingPictures().length;
        if (event.previousIndex < totalExisting && event.currentIndex < totalExisting) {
            const pics = [...this.editExistingPictures()];
            moveItemInArray(pics, event.previousIndex, event.currentIndex);
            this.editExistingPictures.set(pics);
        } else if (event.previousIndex >= totalExisting && event.currentIndex >= totalExisting) {
            const pics = [...this.editNewPictures()];
            moveItemInArray(pics, event.previousIndex - totalExisting, event.currentIndex - totalExisting);
            this.editNewPictures.set(pics);
            this.regenerateEditPicturePreviews();
        }
        this.editCoverIndex.set(0);
    }

    dropEditLitematic(event: CdkDragDrop<void>): void {
        const totalExisting = this.editExistingFiles().length;
        if (event.previousIndex < totalExisting && event.currentIndex < totalExisting) {
            const files = [...this.editExistingFiles()];
            moveItemInArray(files, event.previousIndex, event.currentIndex);
            this.editExistingFiles.set(files);
        } else if (event.previousIndex >= totalExisting && event.currentIndex >= totalExisting) {
            const files = [...this.editNewLitematics()];
            moveItemInArray(files, event.previousIndex - totalExisting, event.currentIndex - totalExisting);
            this.editNewLitematics.set(files);
        }
    }

    removeExistingPicture(id: number | string): void {
        const pics = this.editExistingPictures();
        const removedIdx = pics.findIndex(p => p.id === id);
        this.editRemovedPictureIds.update(ids => [...ids, id]);
        this.editExistingPictures.update(pics => pics.filter(p => p.id !== id));
        // Adjust cover index
        if (this.editCoverIndex() === removedIdx) {
            this.editCoverIndex.set(0);
        } else if (this.editCoverIndex() > removedIdx) {
            this.editCoverIndex.update(i => i - 1);
        }
        this.validateEditFiles();
    }

    removeExistingFile(id: number | string): void {
        this.editRemovedFileIds.update(ids => [...ids, id]);
        this.editExistingFiles.update(files => files.filter(f => f.id !== id));
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
        const totalAfter = this.editExistingPictures().length + this.editNewPictures().length + valid.length;
        if (totalAfter > this.MAX_FILES) {
            const allowed = this.MAX_FILES - this.editExistingPictures().length - this.editNewPictures().length;
            this.toast.error(`Maximum ${this.MAX_FILES} pictures allowed. You have ${this.editExistingPictures().length + this.editNewPictures().length}, tried to add ${valid.length}.`);
            this.editNewPictures.update(files => [...files, ...valid.slice(0, Math.max(0, allowed))]);
        } else {
            this.editNewPictures.update(files => [...files, ...valid]);
        }
        this.regenerateEditPicturePreviews();
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
        const totalAfter = this.editExistingFiles().length + this.editNewLitematics().length + valid.length;
        if (totalAfter > this.MAX_FILES) {
            const allowed = this.MAX_FILES - this.editExistingFiles().length - this.editNewLitematics().length;
            this.toast.error(`Maximum ${this.MAX_FILES} litematic files allowed. You have ${this.editExistingFiles().length + this.editNewLitematics().length}, tried to add ${valid.length}.`);
            this.editNewLitematics.update(files => [...files, ...valid.slice(0, Math.max(0, allowed))]);
        } else {
            this.editNewLitematics.update(files => [...files, ...valid]);
        }
        this.validateEditFiles();
        input.value = '';
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }

    removeNewPicture(index: number): void {
        const totalIdx = this.editExistingPictures().length + index;
        this.editNewPictures.update(files => files.filter((_, i) => i !== index));
        this.regenerateEditPicturePreviews();
        // Adjust cover index
        const total = this.editExistingPictures().length + this.editNewPictures().length;
        if (this.editCoverIndex() === totalIdx) {
            this.editCoverIndex.set(0);
        } else if (this.editCoverIndex() > totalIdx) {
            this.editCoverIndex.update(i => i - 1);
        }
        if (this.editCoverIndex() >= total) {
            this.editCoverIndex.set(Math.max(0, total - 1));
        }
        this.validateEditFiles();
    }

    removeNewLitematic(index: number): void {
        this.editNewLitematics.update(files => files.filter((_, i) => i !== index));
        this.validateEditFiles();
    }

    private regenerateEditPicturePreviews(): void {
        const previews = this.editNewPictures().map(f => URL.createObjectURL(f));
        this.editNewPicturePreviews.set(previews);
    }

    private validateEditFiles(): void {
        const totalPics = this.editExistingPictures().length + this.editNewPictures().length;
        const totalFiles = this.editExistingFiles().length + this.editNewLitematics().length;
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
        let newPics = [...this.editNewPictures()];
        const newLitematics = this.editNewLitematics();
        const existingCount = this.editExistingPictures().length;
        let coverIndex = this.editCoverIndex();

        // Build PictureOrder from remaining existing pictures (position = Order, first = thumbnail)
        const existingPics = this.editExistingPictures();
        const pictureOrder = existingPics.length > 0
            ? existingPics.map(p => String(p.id)).join(',')
            : undefined;

        // Build FileOrder from remaining existing files (respects drag-and-drop reorder)
        const existingFiles = this.editExistingFiles();
        const fileOrder = existingFiles.length > 0
            ? existingFiles.map(f => String(f.id)).join(',')
            : undefined;

        // If the cover is a new picture, reorder so it comes first among new pics
        if (coverIndex >= existingCount && newPics.length > 0) {
            const newPicIdx = coverIndex - existingCount;
            if (newPicIdx > 0) {
                const [coverPic] = newPics.splice(newPicIdx, 1);
                newPics.unshift(coverPic);
            }
            coverIndex = existingCount; // first new pic position
        }

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
                CoverImageIndex: coverIndex,
                PictureOrder: pictureOrder,
                FileOrder: fileOrder,
            },
        ).subscribe({
            next: () => {
                this.saving.set(false);
                this.editing.set(false);
                this.toast.success(SCHEMATICS.schematicUpdated);
                // Reload detail
                this.schematicsApi.getApiSchematicsId(s.id).subscribe({
                    next: (updated) => this.schematic.set(updated),
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
        return blockList.split(',').map(entry => {
            const [rawName, count] = entry.trim().split(':');
            const name = (rawName || '').replace(/_/g, ' ').trim();
            return { name, count: count?.trim() || '1' };
        }).filter(b => b.name);
    }

    /**
     * Collect all unique block names from file blockLists and resolve their atlas textures.
     */
    private resolveBlockTextures(schematic: SchematicDetailResponse): void {
        const allNames = new Set<string>();
        for (const f of schematic.files) {
            if (f.blockList) {
                for (const entry of f.blockList.split(',')) {
                    const rawName = entry.trim().split(':')[0];
                    if (rawName) allNames.add(rawName);
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
}
