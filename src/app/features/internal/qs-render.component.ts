import { Component, OnInit } from '@angular/core';
import { renderLitematicHeadless } from '../../shared/components/litematic-viewer/litematic-headless-render';

declare global {
    interface Window {
        __renderQuickShare?: (base64: string) => Promise<string>;
        __qsRendererReady?: boolean;
    }
}

/** Not a real page: a hook server.js's Puppeteer-driven quick-share generator drives directly. */
@Component({
    selector: 'app-qs-render',
    standalone: true,
    template: `<p>Quick share renderer ready.</p>`,
})
export class QsRenderComponent implements OnInit {
    ngOnInit(): void {
        window.__renderQuickShare = async (base64: string): Promise<string> => {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = await renderLitematicHeadless(bytes.buffer);
            return await blobToDataUrl(file);
        };
        window.__qsRendererReady = true;
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
