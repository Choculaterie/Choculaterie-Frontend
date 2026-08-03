import { Component, OnInit } from '@angular/core';
import { renderBlockIconDataUrl } from '../../shared/components/litematic-viewer/block-icon-batch-render';

declare global {
    interface Window {
        __renderBlockIcon?: (blockKey: string) => Promise<string | null>;
        __iconRendererReady?: boolean;
    }
}

/** Not a real page: a hook for the offline Puppeteer-driven block-icon pre-render script. */
@Component({
    selector: 'app-icon-batch-render',
    standalone: true,
    template: `<p>Icon batch renderer ready.</p>`,
})
export class IconBatchRenderComponent implements OnInit {
    ngOnInit(): void {
        window.__renderBlockIcon = renderBlockIconDataUrl;
        window.__iconRendererReady = true;
    }
}
