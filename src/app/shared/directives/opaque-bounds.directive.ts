import { Directive, ElementRef, afterNextRender, inject, output } from '@angular/core';

export interface OpaqueBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

@Directive({ selector: 'img[appOpaqueBounds]', standalone: true })
export class OpaqueBoundsDirective {
    readonly opaqueBounds = output<OpaqueBounds>();
    private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef);

    constructor() {
        afterNextRender(() => {
            const img = this.el.nativeElement;
            if (img.complete && img.naturalWidth) this.measure(img);
            else img.addEventListener('load', () => this.measure(img), { once: true });
        });
    }

    private measure(img: HTMLImageElement): void {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        let data: Uint8ClampedArray;
        try {
            data = ctx.getImageData(0, 0, w, h).data;
        } catch {
            this.opaqueBounds.emit({ left: 0, top: 0, width: 100, height: 100 });
            return;
        }
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 16) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return;
        this.opaqueBounds.emit({
            left: (minX / w) * 100,
            top: (minY / h) * 100,
            width: ((maxX - minX + 1) / w) * 100,
            height: ((maxY - minY + 1) / h) * 100,
        });
    }
}
