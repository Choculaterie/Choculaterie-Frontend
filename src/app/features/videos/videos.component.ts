import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../core/i18n/t.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { VideosService, VideoResponse, videoThumbnailUrl, videoStreamUrl, formatDuration } from '../../core/services/videos.service';

@Component({
    selector: 'app-videos',
    standalone: true,
    imports: [TPipe, DatePipe, RouterLink, NumberFormatPipe, EmptyStateComponent, MatPaginatorModule],
    template: `
        <div class="page-container">
            <div class="page-header">
                <h1 class="page-title">
                    <img src="/icons/arrows/tild_full_right.svg" alt="" aria-hidden="true" class="mc-icon" style="transform: translateY(-2px);" />
                    <span>{{ 'Videos' | t }}</span>
                </h1>
            </div>

            @if (loading()) {
            <div class="video-grid">
                @for (n of [1, 2, 3, 4, 5, 6]; track n) {
                <div class="video-card skeleton">
                    <div class="thumb"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                </div>
                }
            </div>
            } @else if (videos().length === 0) {
            <div class="center-state">
                <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'No videos yet' | t" />
            </div>
            } @else {
            <div class="video-grid settle-in">
                @for (v of videos(); track v.id) {
                <a class="video-card" [routerLink]="['/videos', v.id]"
                    (mouseenter)="enterPreview(v.id)" (mouseleave)="leavePreview()"
                    (focus)="enterPreview(v.id)" (blur)="leavePreview()">
                    <div class="thumb">
                        @if (thumb(v); as src) {
                        <img [src]="src" [alt]="v.title" loading="lazy" />
                        }
                        @if (previewId() === v.id) {
                        <video class="preview" [src]="stream(v)" [muted]="true" autoplay playsinline loop preload="auto"
                            (loadedmetadata)="startPreview($event)" (playing)="previewReady.set(v.id)"
                            [class.ready]="previewReady() === v.id" (timeupdate)="onPreviewTime($event)"></video>
                        <div class="preview-progress" [class.ready]="previewReady() === v.id">
                            <div [style.width.%]="previewProgress()"></div>
                        </div>
                        }
                        @if (v.durationSeconds) {
                        <span class="duration">{{ duration(previewReady() === v.id ? v.durationSeconds - previewTime() : v.durationSeconds) }}</span>
                        }
                    </div>
                    <div class="video-title">{{ v.title }}</div>
                    <div class="video-meta">{{ v.createdAt | date:'mediumDate' }} · {{ v.views | numFmt }} {{ 'views' | t }}</div>
                </a>
                }
            </div>
            @if (total() > pageSize()) {
            <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="pageIndex()"
                [pageSizeOptions]="[24, 48, 96]" (page)="onPage($event)" showFirstLastButtons />
            }
            }
        </div>
    `,
    styles: [`
        .page-header { display: flex; align-items: center; margin-bottom: 1rem; }
        .page-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font: var(--mat-sys-headline-medium);
            margin: 0;

            img.mc-icon { width: 28px; height: 28px; }
        }
        .center-state { min-height: 60vh; display: flex; align-items: center; justify-content: center; }
        .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 1.25rem;
        }
        .video-card { display: flex; flex-direction: column; gap: 0.35rem; color: inherit; text-decoration: none; }
        .thumb {
            position: relative;
            aspect-ratio: 16 / 9;
            border-radius: 12px;
            overflow: hidden;
            background: var(--mat-sys-surface-container-high);

            img { width: 100%; height: 100%; object-fit: cover; display: block; }
        }
        .preview {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: transparent;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
        }
        .preview.ready { opacity: 1; }
        .preview-progress {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.3);
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;

            div { height: 100%; background: var(--mat-sys-primary); }
        }
        .preview-progress.ready { opacity: 1; }
        .duration {
            z-index: 1;
            position: absolute;
            right: 6px;
            bottom: 9px;
            padding: 1px 6px;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            font-size: 0.75rem;
        }
        .video-title { font: var(--mat-sys-title-small); line-height: 1.3; }
        .video-meta { font-size: 0.8rem; color: var(--mat-sys-on-surface-variant); }
        .skeleton .thumb, .skeleton-line {
            animation: shimmer 1.5s infinite;
            background: linear-gradient(90deg, var(--mat-sys-surface-variant) 25%,
                var(--mat-sys-surface-container-highest) 50%, var(--mat-sys-surface-variant) 75%);
            background-size: 200% 100%;
        }
        .skeleton-line { height: 13px; border-radius: 6px; width: 80%; }
        .skeleton-line.short { width: 45%; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    `],
})
export class VideosComponent implements OnInit {
    private api = inject(VideosService);
    readonly videos = signal<VideoResponse[]>([]);
    readonly loading = signal(true);
    readonly thumb = videoThumbnailUrl;
    readonly stream = videoStreamUrl;
    readonly duration = formatDuration;
    readonly previewId = signal<string | null>(null);
    readonly previewReady = signal<string | null>(null);
    readonly previewProgress = signal(0);
    readonly previewTime = signal(0);

    private readonly canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

    enterPreview(id: string): void {
        if (!this.canHover) return;
        this.previewTime.set(0);
        this.previewProgress.set(0);
        this.previewId.set(id);
    }

    leavePreview(): void {
        this.previewId.set(null);
        this.previewReady.set(null);
    }

    startPreview(event: Event): void {
        const v = event.target as HTMLVideoElement;
        v.muted = true;
        v.play().catch(() => { });
    }

    onPreviewTime(event: Event): void {
        const v = event.target as HTMLVideoElement;
        this.previewTime.set(v.currentTime);
        this.previewProgress.set(v.duration ? v.currentTime / v.duration * 100 : 0);
    }

    readonly total = signal(0);
    readonly pageIndex = signal(0);
    readonly pageSize = signal(24);

    ngOnInit(): void {
        this.load();
    }

    onPage(e: PageEvent): void {
        if (e.pageSize !== this.pageSize()) { this.pageSize.set(e.pageSize); this.pageIndex.set(0); }
        else this.pageIndex.set(e.pageIndex);
        this.load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    private load(): void {
        this.loading.set(true);
        this.api.list(this.pageIndex() + 1, this.pageSize()).subscribe({
            next: (r) => { this.videos.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }
}
