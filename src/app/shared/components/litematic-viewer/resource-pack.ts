export const RESOURCE_PACK_URL = '/assets/litematic-viewer/pack.zip';

export const RESOURCE_PACK_VERSION = '2026-08-02';

const VERSION_KEY = 'chocu-resource-pack-version';

const RENDERER_CACHE_DBS = ['ResourcePacksDB', 'cubane-atlas-cache', 'cubane-cache'];

function deleteDatabase(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = finish;
            req.onerror = finish;
            req.onblocked = finish;
        } catch {
            finish();
        }
        setTimeout(finish, 2000);
    });
}

export async function dropStaleRendererCaches(): Promise<void> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(VERSION_KEY);
    } catch {
        return;
    }
    if (stored === RESOURCE_PACK_VERSION) return;

    if (typeof indexedDB !== 'undefined') {
        await Promise.all(RENDERER_CACHE_DBS.map(deleteDatabase));
    }

    try {
        localStorage.setItem(VERSION_KEY, RESOURCE_PACK_VERSION);
    } catch { }
}
