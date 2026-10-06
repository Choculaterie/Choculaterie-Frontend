import { Component, ElementRef, HostListener, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TPipe } from '../../../core/i18n/t.pipe';
import { PLAYER_ICONS, PixelIcon } from './player-icons';
import { formatDuration } from '../../../core/services/videos.service';

@Component({
    selector: 'app-video-player',
    standalone: true,
    imports: [MatTooltipModule, TPipe],
    template: `
        <div #shell class="player" tabindex="0" [class.idle]="idle()" [class.paused]="!playing()"
            (mousemove)="poke()" (mouseleave)="hideSoon()" (keydown)="onKey($event)">
            <video #video [src]="src()" [attr.poster]="poster()" preload="metadata" playsinline
                (click)="onVideoClick()" (dblclick)="onVideoDblClick()"
                (play)="playing.set(true); ended.set(false); poke()" (pause)="playing.set(false); idle.set(false)"
                (timeupdate)="onTime()" (loadedmetadata)="onTime()" (durationchange)="onTime()"
                (progress)="onTime()" (volumechange)="onVolume()" (waiting)="buffering.set(true)"
                (playing)="buffering.set(false)" (canplay)="buffering.set(false)" (ended)="playing.set(false); ended.set(true); idle.set(false)"></video>

            @if (!playing() && (!started() || ended())) {
            <button class="big-play badge" type="button" (click)="toggle()" [attr.aria-label]="(ended() ? 'Replay' : 'Play') | t">
                <img src="/icons/arrows/tild_full_right.svg" alt="" aria-hidden="true" class="mc-icon" />
            </button>
            }
            @for (f of flash(); track f.key) {
            <div class="flash badge" aria-hidden="true">
                <img [src]="f.src" alt="" class="mc-icon" />
            </div>
            }
            @if (buffering() && playing()) {
            <img class="buffering" src="loading.gif" alt="" aria-hidden="true" />
            }

            <div class="controls" (click)="$event.stopPropagation()">
                <div class="seek" (pointerdown)="startSeek($event)">
                    <div class="seek-track">
                        <div class="seek-buffered" [style.width.%]="bufferedPct()"></div>
                        <div class="seek-played" [style.width.%]="playedPct()"></div>
                        <div class="seek-thumb" [style.left.%]="playedPct()"></div>
                    </div>
                </div>
                <div class="bar">
                    <button type="button" class="ctl" (click)="toggle(false)" [matTooltip]="(playing() ? 'Pause' : 'Play') | t">
                        <svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
                            <path fill="currentColor" [attr.d]="(playing() ? icons.pause : icons.play).main" />
                            <path fill="var(--mc-icon-shadow)" [attr.d]="(playing() ? icons.pause : icons.play).shadow" />
                        </svg>
                    </button>
                    <button type="button" class="ctl" (click)="toggleMute()" [matTooltip]="(muted() ? 'Unmute' : 'Mute') | t">
                        <svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
                            <path fill="currentColor" [attr.d]="volumeIcon().main" />
                            <path fill="var(--mc-icon-shadow)" [attr.d]="volumeIcon().shadow" />
                        </svg>
                    </button>
                    <input class="volume" type="range" min="0" max="1" step="0.05" [value]="muted() ? 0 : volume()"
                        (input)="setVolume($any($event.target).valueAsNumber)" [attr.aria-label]="'Volume' | t" />
                    <button type="button" class="time" (click)="showRemaining.set(!showRemaining())"
                        [matTooltip]="(showRemaining() ? 'Show total time' : 'Show remaining time') | t">
                        {{ fmt(current()) }} / {{ showRemaining() ? '-' + fmt(duration() - current()) : fmt(duration()) }}
                    </button>
                    <span class="spacer"></span>
                    <button type="button" class="ctl" (click)="toggleFullscreen()" [matTooltip]="(fullscreen() ? 'Exit full screen' : 'Full screen') | t">
                        <svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
                            <path fill="currentColor" [attr.d]="(fullscreen() ? icons.exitFullscreen : icons.fullscreen).main" />
                            <path fill="var(--mc-icon-shadow)" [attr.d]="(fullscreen() ? icons.exitFullscreen : icons.fullscreen).shadow" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }
        .player {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 12px;
            overflow: hidden;
            background: #000;
            outline: none;
            --mc-icon-shadow: rgba(0, 0, 0, 0.55);
        }
        .player:focus-visible { box-shadow: 0 0 0 2px var(--mat-sys-primary); }
        .player.idle { cursor: none; }
        video { width: 100%; height: 100%; display: block; object-fit: contain; background: #000; }
        svg { width: 100%; height: 100%; display: block; }

        .badge {
            position: absolute;
            inset: 0;
            margin: auto;
            width: 72px;
            height: 72px;
            padding: 0;
            border: none;
            border-radius: 50%;
            background: var(--mat-sys-surface);
            display: flex;
            align-items: center;
            justify-content: center;

            img { width: 40px; height: 40px; transform: translate(1px, 1px); }
        }
        .big-play { cursor: pointer; transition: transform 0.15s; }
        .big-play:hover { transform: scale(1.06); }
        .flash {
            pointer-events: none;
            animation: player-flash 0.6s ease-out forwards;
        }
        @keyframes player-flash {
            from { opacity: 1; transform: scale(0.85); }
            to { opacity: 0; transform: scale(1.35); }
        }
        .buffering { position: absolute; inset: 0; margin: auto; width: 48px; height: 48px; pointer-events: none; }

        .controls {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 24px 12px 8px;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
            color: #fff;
            transition: opacity 0.2s;
        }
        .player.idle .controls { opacity: 0; pointer-events: none; }

        .seek { padding: 6px 0; cursor: pointer; touch-action: none; }
        .seek-track { position: relative; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.25); transition: height 0.1s; }
        .seek:hover .seek-track { height: 6px; }
        .seek-buffered, .seek-played { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
        .seek-buffered { background: rgba(255, 255, 255, 0.35); }
        .seek-played { background: var(--mat-sys-primary); }
        .seek-thumb {
            position: absolute;
            top: 50%;
            width: 12px;
            height: 12px;
            margin-left: -6px;
            transform: translateY(-50%) scale(0);
            background: var(--mat-sys-primary);
            transition: transform 0.1s;
        }
        .seek:hover .seek-thumb { transform: translateY(-50%) scale(1); }

        .bar { display: flex; align-items: center; gap: 6px; }
        .ctl {
            width: 32px;
            height: 32px;
            padding: 5px;
            border: none;
            border-radius: 6px;
            background: none;
            color: #fff;
            cursor: pointer;
        }
        .ctl:hover { background: rgba(255, 255, 255, 0.15); }
        .ctl svg { transform: translate(1px, 1px); }
        .volume { width: 80px; accent-color: var(--mat-sys-primary); cursor: pointer; }
        .time {
            margin-left: 4px;
            padding: 2px 6px;
            border: none;
            border-radius: 6px;
            background: none;
            color: #fff;
            font: inherit;
            font-size: 0.8rem;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            cursor: pointer;
        }
        .time:hover { background: rgba(255, 255, 255, 0.15); }
        .spacer { flex: 1; }
        @media (max-width: 500px) { .volume { display: none; } }
    `],
})
export class VideoPlayerComponent implements OnDestroy {
    readonly src = input.required<string>();
    readonly poster = input<string | null>(null);

    private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
    private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');

    readonly icons = PLAYER_ICONS;
    readonly playing = signal(false);
    readonly started = signal(false);
    readonly buffering = signal(false);
    readonly current = signal(0);
    readonly duration = signal(0);
    readonly buffered = signal(0);
    readonly volume = signal(1);
    readonly muted = signal(false);
    readonly fullscreen = signal(false);
    readonly idle = signal(false);
    readonly showRemaining = signal(false);
    readonly ended = signal(false);
    readonly flash = signal<{ key: number; src: string }[]>([]);
    private flashKey = 0;

    readonly playedPct = computed(() => this.duration() ? this.current() / this.duration() * 100 : 0);
    readonly bufferedPct = computed(() => this.duration() ? this.buffered() / this.duration() * 100 : 0);
    readonly volumeIcon = computed<PixelIcon>(() => this.muted() || this.volume() === 0 ? this.icons.muted : this.icons.volume);
    readonly fmt = (s: number) => formatDuration(s) || '0:00';

    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private clickTimer: ReturnType<typeof setTimeout> | null = null;

    ngOnDestroy(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.clickTimer) clearTimeout(this.clickTimer);
    }

    onVideoClick(): void {
        if (this.clickTimer) return;
        this.clickTimer = setTimeout(() => {
            this.clickTimer = null;
            this.toggle();
        }, 220);
    }

    onVideoDblClick(): void {
        if (this.clickTimer) {
            clearTimeout(this.clickTimer);
            this.clickTimer = null;
        }
        this.toggleFullscreen();
    }

    toggle(flash = true): void {
        const v = this.video().nativeElement;
        const resume = v.paused || v.ended;
        if (resume) {
            if (flash && this.started()) this.showFlash('/icons/arrows/tild_full_right.svg');
            this.started.set(true);
            v.play().catch(() => { });
        } else {
            if (flash) this.showFlash('/icons/media/pause.svg');
            v.pause();
        }
    }

    private showFlash(src: string): void {
        const key = ++this.flashKey;
        this.flash.set([{ key, src }]);
        setTimeout(() => { if (this.flash()[0]?.key === key) this.flash.set([]); }, 650);
    }

    toggleMute(): void {
        const v = this.video().nativeElement;
        v.muted = !v.muted;
        if (!v.muted && v.volume === 0) v.volume = 0.5;
    }

    setVolume(value: number): void {
        const v = this.video().nativeElement;
        v.volume = value;
        v.muted = value === 0;
    }

    toggleFullscreen(): void {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        else this.shell().nativeElement.requestFullscreen?.().catch(() => { });
    }

    @HostListener('document:fullscreenchange')
    onFullscreenChange(): void {
        this.fullscreen.set(document.fullscreenElement === this.shell().nativeElement);
    }

    onTime(): void {
        const v = this.video().nativeElement;
        this.current.set(v.currentTime);
        this.duration.set(Number.isFinite(v.duration) ? v.duration : 0);
        this.buffered.set(v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0);
    }

    onVolume(): void {
        const v = this.video().nativeElement;
        this.volume.set(v.volume);
        this.muted.set(v.muted);
    }

    startSeek(event: PointerEvent): void {
        const track = event.currentTarget as HTMLElement;
        const seekTo = (e: PointerEvent) => {
            const rect = track.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const v = this.video().nativeElement;
            if (Number.isFinite(v.duration)) {
                v.currentTime = ratio * v.duration;
                this.current.set(v.currentTime);
            }
        };
        seekTo(event);
        track.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => seekTo(e);
        const up = () => {
            track.removeEventListener('pointermove', move);
            track.removeEventListener('pointerup', up);
        };
        track.addEventListener('pointermove', move);
        track.addEventListener('pointerup', up);
    }

    onKey(e: KeyboardEvent): void {
        const v = this.video().nativeElement;
        switch (e.key) {
            case ' ': case 'k': this.toggle(); break;
            case 'f': this.toggleFullscreen(); break;
            case 'm': this.toggleMute(); break;
            case 'ArrowRight': v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); break;
            case 'ArrowLeft': v.currentTime = Math.max(0, v.currentTime - 5); break;
            default: return;
        }
        e.preventDefault();
        this.poke();
    }

    poke(): void {
        this.idle.set(false);
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => { if (this.playing()) this.idle.set(true); }, 2500);
    }

    hideSoon(): void {
        if (this.playing()) this.idle.set(true);
    }
}
