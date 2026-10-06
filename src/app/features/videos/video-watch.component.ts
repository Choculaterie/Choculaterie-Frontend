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

@Component({
    selector: 'app-video-watch',
    standalone: true,
    imports: [TPipe, DatePipe, RouterLink, MatButtonModule, MatTooltipModule, MarkdownPipe, NumberFormatPipe, EmptyStateComponent, VideoPlayerComponent],
    template: `
        <div class="page-container watch">
            <button mat-icon-button class="back-btn" routerLink="/videos" [matTooltip]="'Back to videos' | t">
                <img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" />
            </button>

            @if (loading()) {
            <div class="player skeleton"></div>
            } @else if (video(); as v) {
            <div class="settle-in">
                <app-video-player class="player" [src]="stream(v)" [poster]="thumb(v)" />
                <div class="title-row">
                    <div>
                        <h1 class="title">{{ v.title }}</h1>
                        <div class="meta">{{ v.createdAt | date:'longDate' }} · {{ v.views | numFmt }} {{ 'views' | t }}</div>
                    </div>
                    <div class="actions">
                    <button mat-stroked-button type="button" (click)="copyLink(v)">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" width="18" height="18" matButtonIcon class="mc-icon" aria-hidden="true"><path fill="currentColor" d="M4,2h16v1h-16zM4,3h16v1h-16zM4,4h16v1h-16zM4,5h16v1h-16zM4,6h16v1h-16zM4,7h16v1h-16zM4,8h16v1h-16zM4,9h16v1h-16zM4,10h16v1h-16zM4,11h16v1h-16zM4,12h16v1h-16zM4,13h16v1h-16zM4,14h16v1h-16zM4,15h16v1h-16zM4,16h16v1h-16zM4,17h16v1h-16zM4,18h16v1h-16zM4,19h16v1h-16zM4,20h16v1h-16zM4,21h16v1h-16zM4,22h16v1h-16zM4,23h16v1h-16zM4,24h16v1h-16zM4,25h16v1h-16zM4,26h16v1h-16z" /><path fill="var(--mc-icon-shadow)" d="M20,5h8v1h-8zM20,6h8v1h-8zM20,7h8v1h-8zM20,8h8v1h-8zM20,9h8v1h-8zM20,10h8v1h-8zM20,11h8v1h-8zM20,12h8v1h-8zM20,13h8v1h-8zM20,14h8v1h-8zM20,15h8v1h-8zM20,16h8v1h-8zM20,17h8v1h-8zM20,18h8v1h-8zM20,19h8v1h-8zM20,20h8v1h-8zM20,21h8v1h-8zM20,22h8v1h-8zM20,23h8v1h-8zM20,24h8v1h-8zM20,25h8v1h-8zM20,26h8v1h-8zM12,27h16v1h-16zM12,28h16v1h-16zM12,29h16v1h-16z" /></svg>
                        <span>{{ 'Copy link' | t }}</span>
                    </button>
                    @if (isAdmin()) {
                    <button mat-icon-button type="button" (click)="editInAdmin(v)" [matTooltip]="'Edit video' | t">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" width="20" height="20" class="mc-icon" aria-hidden="true"><path fill="currentColor" d="M9,4h3v1h-3zM9,5h3v1h-3zM9,6h3v1h-3zM5,7h4v1h-4zM12,7h4v1h-4zM5,8h4v1h-4zM12,8h4v1h-4zM5,9h4v1h-4zM12,9h4v1h-4zM2,10h3v1h-3zM9,10h3v1h-3zM16,10h4v1h-4zM2,11h3v1h-3zM9,11h3v1h-3zM16,11h4v1h-4zM2,12h3v1h-3zM9,12h3v1h-3zM16,12h4v1h-4zM5,13h4v1h-4zM20,13h3v1h-3zM5,14h4v1h-4zM20,14h3v1h-3zM5,15h4v1h-4zM20,15h3v1h-3zM9,16h3v1h-3zM23,16h4v1h-4zM9,17h3v1h-3zM23,17h4v1h-4zM9,18h3v1h-3zM23,18h4v1h-4zM12,19h4v1h-4zM20,19h7v1h-7zM12,20h4v1h-4zM20,20h7v1h-7zM12,21h4v1h-4zM20,21h7v1h-7zM16,22h11v1h-11zM16,23h11v1h-11zM16,24h11v1h-11z" /><path fill="var(--mc-icon-shadow)" d="M12,13h4v1h-4zM12,14h4v1h-4zM12,15h4v1h-4zM27,19h3v1h-3zM27,20h3v1h-3zM27,21h3v1h-3zM27,22h3v1h-3zM27,23h3v1h-3zM27,24h3v1h-3zM20,25h10v1h-10zM20,26h10v1h-10zM20,27h10v1h-10z" /></svg>
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
                        <img src="/icons/arrows/tild_full_down.svg" alt="" aria-hidden="true" class="mc-icon expand-arrow" />
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
                width: 20px;
                height: 20px;
                transition: transform 0.2s;
                transform-origin: center 43.75%;
            }

            &[aria-expanded='true'] .expand-arrow { transform: rotate(180deg) translateY(1px); }
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
