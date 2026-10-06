import { Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2, inject, OnDestroy, OnInit } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Directive({
    selector: '[appDropZone]',
    standalone: true,
})
export class DropZoneDirective implements OnInit, OnDestroy {
    @Input() accept = '';
    @Input() fullPage = false;
    @Input() unknownTypeIcon = '';
    @Input() dropDisabled = false;
    @Output() filesDrop = new EventEmitter<File[]>();

    private el = inject(ElementRef);
    private renderer = inject(Renderer2);
    private toast = inject(ToastService);

    private fpOverlay: HTMLElement | null = null;

    private _htmlEnter = (e: DragEvent) => this.onHtmlEnter(e);
    private _htmlLeave = (e: DragEvent) => this.onHtmlLeave(e);
    private _htmlOver = (e: DragEvent) => { e.preventDefault(); };
    private _htmlDrop = (e: DragEvent) => this.onHtmlDrop(e);

    ngOnInit(): void {
        if (!this.fullPage) return;
        const html = document.documentElement;
        html.addEventListener('dragenter', this._htmlEnter, true);
        html.addEventListener('dragleave', this._htmlLeave, true);
        html.addEventListener('dragover', this._htmlOver, true);
        html.addEventListener('drop', this._htmlDrop, true);
    }

    ngOnDestroy(): void {
        const html = document.documentElement;
        html.removeEventListener('dragenter', this._htmlEnter, true);
        html.removeEventListener('dragleave', this._htmlLeave, true);
        html.removeEventListener('dragover', this._htmlOver, true);
        html.removeEventListener('drop', this._htmlDrop, true);
        this.removeFpOverlay();
    }

    private onHtmlEnter(e: DragEvent): void {
        if (this.dropDisabled) return;
        e.preventDefault();
        this.showFpOverlay(e);
    }

    private onHtmlLeave(e: DragEvent): void {
        if (e.relatedTarget !== null) return;
        this.removeFpOverlay();
    }

    private onHtmlDrop(e: DragEvent): void {
        if (this.dropDisabled) return;
        e.preventDefault();
        this.removeFpOverlay();
        this.processFiles(e);
    }

    @HostListener('dragover', ['$event'])
    onHostOver(e: DragEvent): void {
        if (this.fullPage) return;
        e.preventDefault();
    }

    @HostListener('drop', ['$event'])
    onHostDrop(e: DragEvent): void {
        if (this.fullPage) return;
        e.preventDefault();
        e.stopPropagation();
        this.processFiles(e);
    }

    private processFiles(e: DragEvent): void {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (!files.length) {
            if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
                this.toast.error('Your browser did not hand over the dropped file. Use the button to pick it instead.');
            }
            return;
        }
        if (this.accept) {
            const { valid, invalid } = this.filterFiles(files);
            if (invalid.length) this.toast.error(`Unsupported file format: ${invalid.map(f => f.name).join(', ')}`);
            if (valid.length) this.filesDrop.emit(valid);
        } else {
            this.filesDrop.emit(files);
        }
    }

    private filterFiles(files: File[]): { valid: File[]; invalid: File[] } {
        const valid: File[] = [];
        const invalid: File[] = [];
        const patterns = this.accept.split(',').map(s => s.trim().toLowerCase());
        for (const file of files) {
            if (this.matchesAccept(file, patterns)) valid.push(file);
            else invalid.push(file);
        }
        return { valid, invalid };
    }

    private matchesAccept(file: File, patterns: string[]): boolean {
        const name = file.name.toLowerCase();
        const type = file.type.toLowerCase();
        return patterns.some(p => {
            if (p.startsWith('.')) return name.endsWith(p);
            if (p.endsWith('/*')) return type.startsWith(p.replace('/*', '/'));
            return type === p;
        });
    }

    private showFpOverlay(e?: DragEvent): void {
        if (this.fpOverlay) return;

        const items = Array.from(e?.dataTransfer?.items ?? []).filter(i => i.kind === 'file');
        const iconSrc = items.some(i => i.type.startsWith('video/')) ? '/icons/arrows/tild_full_right.svg'
            : this.unknownTypeIcon && items.some(i => !i.type) ? this.unknownTypeIcon
            : '/icons/arrows/arrow_up.svg';
        this.fpOverlay = this.renderer.createElement('div');
        this.renderer.setStyle(this.fpOverlay, 'animation', 'overlay-fade-in 0.15s ease-out both');
        this.renderer.setStyle(this.fpOverlay, 'position', 'fixed');
        this.renderer.setStyle(this.fpOverlay, 'inset', '0');
        this.renderer.setStyle(this.fpOverlay, 'z-index', '9999');
        this.renderer.setStyle(this.fpOverlay, 'background', 'rgba(0,0,0,0.45)');
        this.renderer.setStyle(this.fpOverlay, 'backdrop-filter', 'blur(4px)');
        this.renderer.setStyle(this.fpOverlay, 'pointer-events', 'none');

        const frame = this.renderer.createElement('div');
        this.renderer.setStyle(frame, 'position', 'absolute');
        this.renderer.setStyle(frame, 'inset', '16px');
        this.renderer.setStyle(frame, 'border', '2.5px dashed var(--mat-sys-primary)');
        this.renderer.setStyle(frame, 'border-radius', '16px');
        this.renderer.setStyle(frame, 'display', 'flex');
        this.renderer.setStyle(frame, 'align-items', 'center');
        this.renderer.setStyle(frame, 'justify-content', 'center');
        this.renderer.appendChild(this.fpOverlay, frame);

        const badge = this.renderer.createElement('div');
        this.renderer.setStyle(badge, 'background', 'var(--mat-sys-surface)');
        this.renderer.setStyle(badge, 'border-radius', '50%');
        this.renderer.setStyle(badge, 'width', '72px');
        this.renderer.setStyle(badge, 'height', '72px');
        this.renderer.setStyle(badge, 'display', 'flex');
        this.renderer.setStyle(badge, 'align-items', 'center');
        this.renderer.setStyle(badge, 'justify-content', 'center');
        this.renderer.appendChild(frame, badge);

        const icon = this.renderer.createElement('img');
        this.renderer.setAttribute(icon, 'src', iconSrc);
        this.renderer.setStyle(icon, 'transform', 'translate(1px, 1px)');
        this.renderer.setAttribute(icon, 'alt', '');
        this.renderer.setAttribute(icon, 'aria-hidden', 'true');
        this.renderer.addClass(icon, 'mc-icon');
        this.renderer.setStyle(icon, 'width', '40px');
        this.renderer.setStyle(icon, 'height', '40px');
        this.renderer.appendChild(badge, icon);

        this.renderer.appendChild(document.body, this.fpOverlay);
    }

    private removeFpOverlay(): void {
        const overlay = this.fpOverlay;
        if (!overlay) return;
        this.fpOverlay = null;
        this.renderer.setStyle(overlay, 'animation', 'overlay-fade-out 0.15s ease-in both');
        setTimeout(() => {
            if (document.body.contains(overlay)) this.renderer.removeChild(document.body, overlay);
        }, 150);
    }
}
