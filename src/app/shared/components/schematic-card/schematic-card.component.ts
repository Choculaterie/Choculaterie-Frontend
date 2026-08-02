import { Component, input, inject, computed, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { SchematicListItemResponse } from '../../../api/generated.schemas';
import { UserLinkComponent } from '../user-link/user-link.component';
import { NumberFormatPipe } from '../../pipes/number-format.pipe';
import { SkeletonImgComponent } from '../skeleton-img/skeleton-img.component';
import { environment } from '../../../environments/environment';


@Component({
    selector: 'app-schematic-card',
    standalone: true,
    imports: [
        RouterLink,
        DatePipe,
        MatCardModule,
        MatIconModule,
        MatChipsModule,
        MatButtonModule,
        MatTooltipModule,
        UserLinkComponent,
        NumberFormatPipe,
        SkeletonImgComponent,
    ],
    templateUrl: './schematic-card.component.html',
    styleUrl: './schematic-card.component.scss',
})
export class SchematicCardComponent {
    private static readonly imageFitCache = new Map<string, 'cover' | 'contain'>();

    schematic = input.required<SchematicListItemResponse>();
    priority = input<'high' | 'low' | 'auto'>('auto');
    private router = inject(Router);
    private imageCheckRequestId = 0;

    readonly imageUrl = computed(() => {
        const filePath = this.schematic().filePath;
        if (!filePath) {
            return null;
        }
        return filePath.startsWith('http')
            ? filePath
            : `${environment.apiBasePath}/images/schematics/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    });
    readonly imageFit = signal<'cover' | 'contain' | null>(null);

    constructor() {
        effect(() => {
            const url = this.imageUrl();
            if (!url) {
                this.imageFit.set(null);
                return;
            }

            const cachedFit = SchematicCardComponent.imageFitCache.get(url);
            if (cachedFit) {
                this.imageFit.set(cachedFit);
                return;
            }

            const requestId = ++this.imageCheckRequestId;
            this.imageFit.set(null);
            this.checkImageTransparency(url).then(transparent => {
                if (requestId !== this.imageCheckRequestId) {
                    return;
                }
                const fit = transparent ? 'contain' : 'cover';
                SchematicCardComponent.imageFitCache.set(url, fit);
                this.imageFit.set(fit);
            });
        });
    }

    private checkImageTransparency(url: string): Promise<boolean> {
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const size = 64;
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(false); return; }
                    ctx.drawImage(img, 0, 0, size, size);
                    const data = ctx.getImageData(0, 0, size, size).data;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] < 255) { resolve(true); return; }
                    }
                    resolve(false);
                } catch {
                    resolve(false);
                }
            };
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    private readonly maxTags = 3;
    visibleTags = computed(() => this.schematic().tags.slice(0, this.maxTags));
    hiddenTags = computed(() => this.schematic().tags.slice(this.maxTags));
    hasOverflowTags = computed(() => this.schematic().tags.length > this.maxTags);

    onTagClick(event: Event, tag: string): void {
        event.stopPropagation();
        event.preventDefault();
        this.router.navigate(['/schematics'], { queryParams: { tag } });
    }

    onTypeClick(event: Event): void {
        event.stopPropagation();
        event.preventDefault();
        this.router.navigate(['/schematics'], { queryParams: { type: this.schematic().schematicType } });
    }

    onViewOriginal(event: Event): void {
        event.stopPropagation();
        event.preventDefault();
        this.router.navigate(['/schematics', this.schematic().forked]);
    }
}
