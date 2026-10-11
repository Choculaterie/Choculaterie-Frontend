import { Component, ElementRef, OnInit, inject, signal, viewChild, afterRenderEffect } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ToastService } from '../../core/services/toast.service';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { ADMIN_TAB } from '../../core/enums';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TPipe } from '../../core/i18n/t.pipe';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { NumberFormatPipe } from '../../shared/pipes/number-format.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { VideosService, VideoResponse, videoStreamUrl, videoThumbnailUrl } from '../../core/services/videos.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-video-watch',
    standalone: true,
    imports: [MatIconModule, TPipe, DatePipe, RouterLink, MatButtonModule, MatTooltipModule, MarkdownPipe, NumberFormatPipe, EmptyStateComponent, VideoPlayerComponent],
    template: `
        <div class="page-container watch">
            <button mat-icon-button class="back-btn" routerLink="/videos" [matTooltip]="'Back to videos' | t">
                <mat-icon svgIcon="mc:arrows/arrow_left"></mat-icon>
            </button>

            @if (loading()) {
            <div class="player skeleton"></div>
            } @else if (video(); as v) {
            <div class="settle-in">
                <app-video-player class="player" [src]="stream(v)" [poster]="thumb(v)" [title]="v.title" />
                <div class="title-row">
                    <div>
                        <h1 class="title">{{ v.title }}</h1>
                        <div class="meta">{{ v.createdAt | date:'longDate' }} · {{ v.views | numFmt }} {{ 'views' | t }}</div>
                    </div>
                    <div class="actions">
                    <button mat-stroked-button type="button" (click)="copyLink(v)">
                        <mat-icon svgIcon="mc:ui/overlapping_sheets" matButtonIcon></mat-icon>
                        <span>{{ 'Copy link' | t }}</span>
                    </button>
                    @if (isAdmin()) {
                    <button mat-icon-button type="button" (click)="editInAdmin(v)" [matTooltip]="'Edit video' | t">
                        <mat-icon svgIcon="mc:weapons/pen"></mat-icon>
                    </button>
                    }
                    </div>
                </div>
                @if (v.description) {
                <div class="description">
                    <div #desc class="markdown-content desc-body" [class.folded]="descFoldable() && !descOpen()"
                        [innerHTML]="v.description | markdown"></div>
                    @if (descFoldable()) {
                    <button type="button" class="desc-toggle" (click)="descOpen.set(!descOpen())"
                        [attr.aria-expanded]="descOpen()" [matTooltip]="(descOpen() ? 'Collapse' : 'Expand') | t">
                        <mat-icon svgIcon="mc:arrows/tild_full_down" class="expand-arrow"></mat-icon>
                    </button>
                    }
                </div>
                }
            </div>
            } @else {
            <div class="center-state">
                <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'Video not found' | t" />
            </div>
            }
        </div>
    `,
    styles: [`
        .watch { max-width: 1100px; }
        .back-btn { margin-top: -40px; }
        @media (max-width: 600px) { .back-btn { margin-top: -16px; } }
        .player { display: block; margin-top: 0.5rem; }
        .player.skeleton {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 12px;
            animation: shimmer 1.5s infinite;
            background: linear-gradient(90deg, var(--mat-sys-surface-variant) 25%,
                var(--mat-sys-surface-container-highest) 50%, var(--mat-sys-surface-variant) 75%);
            background-size: 200% 100%;
        }
        .title-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
            margin-top: 1rem;

            button { flex: none; }
            .actions { display: flex; align-items: center; gap: 0.25rem; }
        }
        .title { font: var(--mat-sys-headline-small); margin: 0 0 0.25rem; }
        .center-state { min-height: 60vh; display: flex; align-items: center; justify-content: center; }
        .meta { font-size: 0.85rem; color: var(--mat-sys-on-surface-variant); }
        .description {
            margin-top: 1rem;
            padding: 0.75rem 1rem;
            border-radius: 12px;
            background: var(--mat-sys-surface-container);
            line-height: 1.6;
            overflow-wrap: break-word;
        }
        .desc-body.folded {
            max-height: calc(1.6em * 3);
            overflow: hidden;
            -webkit-mask-image: linear-gradient(#000 60%, transparent);
            mask-image: linear-gradient(#000 60%, transparent);
        }
        .desc-toggle {
            display: flex;
            justify-content: center;
            width: 100%;
            margin-top: 0.25rem;
            padding: 0.25rem 0;
            border: none;
            border-radius: 8px;
            background: none;
            color: inherit;
            cursor: pointer;

            &:hover { background: var(--mat-sys-surface-container-high); }

            .expand-arrow {
                width: var(--icon-size);
                height: var(--icon-size);
                transition: transform 0.2s;
                transform-origin: center;
            }

            &[aria-expanded='true'] .expand-arrow { transform: rotate(180deg); --mc-shadow-dir: -1; }
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    `],
})
export class VideoWatchComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private api = inject(VideosService);
    private titleService = inject(Title);
    private toast = inject(ToastService);
    private router = inject(Router);
    private session = inject(SessionService);
    readonly isAdmin = () => this.session.user()?.role?.toLowerCase() === 'admin';

    editInAdmin(v: VideoResponse): void {
        this.router.navigate(['/admin'], { queryParams: { tab: ADMIN_TAB.videos, editVideo: v.id } });
    }
    readonly video = signal<VideoResponse | null>(null);
    readonly loading = signal(true);
    readonly stream = videoStreamUrl;
    readonly thumb = videoThumbnailUrl;
    readonly descOpen = signal(false);
    readonly descFoldable = signal(false);
    private readonly desc = viewChild<ElementRef<HTMLElement>>('desc');

    private readonly measureDesc = afterRenderEffect(() => {
        const el = this.desc()?.nativeElement;
        if (!el || this.descOpen()) return;
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
        this.descFoldable.set(el.scrollHeight > lineHeight * 3 + 2);
    });

    copyLink(v: VideoResponse): void {
        navigator.clipboard.writeText(`${location.origin}/videos/${v.id}`).then(
            () => this.toast.success('Link copied.'),
            () => this.toast.error('Could not copy the link.'),
        );
    }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') ?? '';
        this.api.get(id).subscribe({
            next: (v) => {
                this.video.set(v);
                this.loading.set(false);
                this.titleService.setTitle(`${v.title} · Choculaterie`);
                this.api.countView(v.id).subscribe({ error: () => { } });
            },
            error: () => this.loading.set(false),
        });
    }
}
