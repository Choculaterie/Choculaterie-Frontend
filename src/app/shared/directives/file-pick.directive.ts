import { Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

const SAFETY_MS = 60_000;

@Directive({ selector: 'input[type=file][appFilePick]', standalone: true })
export class FilePickDirective implements OnDestroy {
    private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
    private holder: Element | null = null;
    private safety: ReturnType<typeof setTimeout> | null = null;

    @HostListener('click')
    onOpen(): void {
        this.holder = this.el.nativeElement.closest('.file-row') ?? this.el.nativeElement.parentElement;
        this.holder?.classList.add('file-picking');
        if (this.safety) clearTimeout(this.safety);
        this.safety = setTimeout(() => this.done(), SAFETY_MS);
    }

    @HostListener('change')
    @HostListener('cancel')
    done(): void {
        if (this.safety) clearTimeout(this.safety);
        this.safety = null;
        this.holder?.classList.remove('file-picking');
        this.holder = null;
    }

    ngOnDestroy(): void {
        this.done();
    }
}
