import { Directive, ElementRef, OnInit, inject } from '@angular/core';

const MIN_VISIBLE_MS = 250;

@Directive({ selector: 'img[appMediaSkeleton], video[appMediaSkeleton]', standalone: true })
export class MediaSkeletonDirective implements OnInit {
    private el = inject<ElementRef<HTMLImageElement | HTMLVideoElement>>(ElementRef);

    ngOnInit(): void {
        const media = this.el.nativeElement;
        const holder = media.parentElement;
        if (!holder) return;
        holder.classList.add('media-loading');
        const start = performance.now();
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - start));
            setTimeout(() => holder.classList.remove('media-loading'), wait);
        };
        media.addEventListener(media instanceof HTMLImageElement ? 'load' : 'loadeddata', finish, { once: true });
        media.addEventListener('error', finish, { once: true });
        requestAnimationFrame(() => {
            const ready = media instanceof HTMLImageElement
                ? media.complete && media.naturalWidth > 0
                : media.readyState >= 2;
            if (ready) finish();
        });
    }
}
