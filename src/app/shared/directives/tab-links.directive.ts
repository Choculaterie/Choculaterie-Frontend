import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';

@Directive({ selector: 'mat-tab-group[appTabLinks]', standalone: true })
export class TabLinksDirective {
    @Input() tabParam = 'tab';

    private el = inject<ElementRef<HTMLElement>>(ElementRef);

    @HostListener('mousedown', ['$event'])
    onMouseDown(e: MouseEvent): void {
        if (e.button === 1 && this.tabIndex(e) != null) e.preventDefault();
    }

    @HostListener('auxclick', ['$event'])
    onAuxClick(e: MouseEvent): void {
        if (e.button !== 1) return;
        const index = this.tabIndex(e);
        if (index == null) return;
        e.preventDefault();
        const url = new URL(window.location.href);
        url.search = '';
        if (index > 0) url.searchParams.set(this.tabParam, String(index));
        window.open(url.toString(), '_blank', 'noopener');
    }

    private tabIndex(e: MouseEvent): number | null {
        const tab = (e.target as HTMLElement | null)?.closest('.mat-mdc-tab');
        if (!tab || !this.el.nativeElement.contains(tab) || !tab.parentElement) return null;
        const tabs = Array.from(tab.parentElement.children).filter(c => c.classList.contains('mat-mdc-tab'));
        const index = tabs.indexOf(tab);
        return index >= 0 ? index : null;
    }
}
