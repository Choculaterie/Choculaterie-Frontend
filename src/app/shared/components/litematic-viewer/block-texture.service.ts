import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

const ICON_DIR = '/assets/litematic-viewer/icons/';

/** Looks up per-block icons (static PNGs pre-rendered offline, see block-icon-batch-render.ts). */
@Injectable({ providedIn: 'root' })
export class BlockTextureService {
    private manifest$?: Observable<Set<string>>;

    constructor(private http: HttpClient) { }

    private getManifest(): Observable<Set<string>> {
        if (!this.manifest$) {
            this.manifest$ = this.http.get<string[]>(ICON_DIR + 'manifest.json').pipe(
                map(names => new Set(names)),
                shareReplay(1),
            );
        }
        return this.manifest$;
    }

    /** Resolve a block name (e.g. "spruce_slab") to its icon URL, or null if none was rendered. */
    resolve(blockName: string): Observable<string | null> {
        return this.getManifest().pipe(map(available => this.urlFor(blockName, available)));
    }

    /** Bulk-resolve multiple block names at once. Returns a map of name → icon URL. */
    resolveAll(blockNames: string[]): Observable<Map<string, string>> {
        return this.getManifest().pipe(map(available => {
            const result = new Map<string, string>();
            for (const name of blockNames) {
                const url = this.urlFor(name, available);
                if (url) result.set(name, url);
            }
            return result;
        }));
    }

    private urlFor(blockName: string, available: Set<string>): string | null {
        const name = blockName.includes(':') ? blockName.split(':')[1] : blockName;
        return available.has(name) ? `${ICON_DIR}${name}.png` : null;
    }
}
