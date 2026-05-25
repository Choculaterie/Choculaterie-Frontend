import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, map } from 'rxjs';
import { resolveBlockTexture } from './litematic-utils';

interface Assets {
    blockstates: Record<string, unknown>;
    models: Record<string, unknown>;
    textures: Record<string, [number, number, number, number]>;
}

export interface BlockTextureInfo {
    /** Pixel rect [x, y, w, h] in the atlas */
    rect: [number, number, number, number];
    atlasUrl: string;
}

/**
 * Service that lazily loads the texture atlas metadata and resolves
 * Minecraft block names to sprite coordinates in atlas.png.
 */
@Injectable({ providedIn: 'root' })
export class BlockTextureService {
    readonly atlasUrl = '/assets/litematic-viewer/atlas.png';
    private assets$?: Observable<Assets>;
    private cache = new Map<string, [number, number, number, number] | null>();

    constructor(private http: HttpClient) { }

    private getAssets(): Observable<Assets> {
        if (!this.assets$) {
            this.assets$ = this.http.get<Assets>('/assets/litematic-viewer/assets.json').pipe(
                shareReplay(1),
            );
        }
        return this.assets$;
    }

    /**
     * Resolve a block name (e.g. "spruce_slab" or "minecraft:spruce_slab")
     * to a texture rect in the atlas. Returns null if not found.
     */
    resolve(blockName: string): Observable<BlockTextureInfo | null> {
        const key = blockName.includes(':') ? blockName : `minecraft:${blockName}`;

        if (this.cache.has(key)) {
            const rect = this.cache.get(key)!;
            return of(rect ? { rect, atlasUrl: this.atlasUrl } : null);
        }

        return this.getAssets().pipe(
            map(assets => {
                const rect = resolveBlockTexture(key, assets);
                this.cache.set(key, rect);
                return rect ? { rect, atlasUrl: this.atlasUrl } : null;
            }),
        );
    }

    /**
     * Bulk-resolve multiple block names at once. Returns a map of name → rect.
     */
    resolveAll(blockNames: string[]): Observable<Map<string, [number, number, number, number]>> {
        return this.getAssets().pipe(
            map(assets => {
                const result = new Map<string, [number, number, number, number]>();
                for (const name of blockNames) {
                    const key = name.includes(':') ? name : `minecraft:${name}`;
                    if (this.cache.has(key)) {
                        const r = this.cache.get(key)!;
                        if (r) result.set(name, r);
                    } else {
                        const r = resolveBlockTexture(key, assets);
                        this.cache.set(key, r);
                        if (r) result.set(name, r);
                    }
                }
                return result;
            }),
        );
    }
}
