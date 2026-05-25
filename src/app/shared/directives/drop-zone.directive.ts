import { Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2, inject, OnDestroy, OnInit } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

/**
 * Drop-zone directive - purely functional, no visual feedback.
 *
 * fullPage=true : shows a fixed viewport overlay (dark blur + dashed frame)
 *                 and processes any drop on it.
 * fullPage=false: transparent - just calls preventDefault on dragover/drop
 *                 and emits filesDrop.  All visuals are handled by the page.
 */
@Directive({
    selector: '[appDropZone]',
    standalone: true,
})
export class DropZoneDirective implements OnInit, OnDestroy {
    @Input() accept = '';
    @Input() fullPage = false;
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

    // ── Full-page: document.documentElement handlers ──

    private onHtmlEnter(e: DragEvent): void {
        e.preventDefault();
        this.showFpOverlay();
    }

    private onHtmlLeave(e: DragEvent): void {
        if (e.relatedTarget !== null) return;
        this.removeFpOverlay();
    }

    private onHtmlDrop(e: DragEvent): void {
        e.preventDefault();
        this.removeFpOverlay();
        this.processFiles(e);
    }

    // ── Local element handlers (no visuals) ──

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

    // ── File processing ──

    private processFiles(e: DragEvent): void {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (!files.length) return;
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

    // ── Full-page overlay ──

    private showFpOverlay(): void {
        if (this.fpOverlay) return;

        this.fpOverlay = this.renderer.createElement('div');
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

        const icon = this.renderer.createElement('span');
        this.renderer.addClass(icon, 'material-icons');
        this.renderer.appendChild(icon, this.renderer.createText('upload'));
        this.renderer.setStyle(icon, 'font-size', '3rem');
        this.renderer.setStyle(icon, 'color', 'var(--mat-sys-primary)');
        this.renderer.setStyle(icon, 'background', 'var(--mat-sys-surface)');
        this.renderer.setStyle(icon, 'border-radius', '50%');
        this.renderer.setStyle(icon, 'width', '72px');
        this.renderer.setStyle(icon, 'height', '72px');
        this.renderer.setStyle(icon, 'display', 'flex');
        this.renderer.setStyle(icon, 'align-items', 'center');
        this.renderer.setStyle(icon, 'justify-content', 'center');
        this.renderer.appendChild(frame, icon);

        this.renderer.appendChild(document.body, this.fpOverlay);
    }

    private removeFpOverlay(): void {
        if (!this.fpOverlay) return;
        if (document.body.contains(this.fpOverlay)) {
            this.renderer.removeChild(document.body, this.fpOverlay);
        }
        this.fpOverlay = null;
    }
}
