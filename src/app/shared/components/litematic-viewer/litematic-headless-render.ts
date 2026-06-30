/**
 * Headless isometric renderer for .litematic files.
 *
 * Runs entirely in the browser (uses the same deepslate + WebGL pipeline as the
 * screenshot dialog) but without any UI. Call it in the background after a
 * litematic loads to generate an OG preview image.
 */

import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
    BlockDefinition,
    BlockModel,
    TextureAtlas,
    StructureRenderer,
    type Resources,
    type Identifier,
} from 'deepslate';
import { mat4, vec3 } from 'gl-matrix';

import {
    parseLitematic,
    structureFromLitematicAsync,
    countNonAirBlocks,
    getNonAirBounds,
    type NonAirBounds,
} from './litematic-utils';
import { OPAQUE_BLOCKS, TRANSPARENT_BLOCKS, NON_SELF_CULLING } from './opaque-blocks';

// Square, so there's equal headroom for tall and wide structures alike - the card displays
// these with `object-fit: contain` (never crops), so there's no benefit to a non-square render.
const RENDER_WIDTH = 1024;
const RENDER_HEIGHT = 1024;
const MAX_BLOCKS = 250_000;

/**
 * Render a .litematic file to a PNG File, fully headless (no UI).
 *
 * @param fileData  Raw ArrayBuffer of the .litematic file.
 * @param http      Angular HttpClient (to fetch assets.json + atlas.png).
 * @param yaw       Camera yaw in degrees (default 45).
 * @param pitch     Camera pitch in degrees (default 25).
 * @param zoom      Zoom percentage (default 100).
 * @returns         Promise resolving to a trimmed PNG File named "preview.png".
 */
export async function renderLitematicHeadless(
    fileData: ArrayBuffer,
    http: HttpClient,
    yaw = 45,
    pitch = 25,
    zoom = 100,
): Promise<File> {
    // 1. Fetch block definition assets and texture atlas in parallel
    const [assets, atlasBlob] = await Promise.all([
        firstValueFrom(http.get<{
            blockstates: Record<string, unknown>;
            models: Record<string, unknown>;
            textures: Record<string, [number, number, number, number]>;
        }>('/assets/litematic-viewer/assets.json')),
        firstValueFrom(http.get('/assets/litematic-viewer/atlas.png', { responseType: 'blob' })),
    ]);

    // 2. Decode the atlas PNG into an HTMLImageElement
    const atlasUrl = URL.createObjectURL(atlasBlob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(atlasUrl); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(atlasUrl); reject(new Error('Failed to load atlas image')); };
        image.src = atlasUrl;
    });

    // 3. Build deepslate Resources
    const resources = buildResources(assets, img);

    // 4. Parse the litematic
    const litematic = await parseLitematic(new Uint8Array(fileData));
    if (!litematic.regions.length) throw new Error('No regions found in litematic');

    // 5. Clamp maxY if structure is very large
    const region = litematic.regions[0];
    let maxY = region.absHeight;
    if (countNonAirBlocks(litematic) > MAX_BLOCKS) {
        let lo = 1, hi = region.absHeight;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (countNonAirBlocks(litematic, 0, mid) <= MAX_BLOCKS) lo = mid;
            else hi = mid - 1;
        }
        maxY = lo;
    }

    // 6. Build the deepslate Structure (async to avoid blocking 85-94%)
    await yieldToMain();
    const structure = await structureFromLitematicAsync(litematic, 0, maxY);
    if (!structure) throw new Error('Failed to build Structure from litematic');
    const bounds = getNonAirBounds(litematic, 0, maxY);

    // 7. Create offscreen WebGL canvas
    const canvas = document.createElement('canvas');
    canvas.width = RENDER_WIDTH;
    canvas.height = RENDER_HEIGHT;
    // deepslate reads clientWidth/clientHeight for projection - spoof them
    Object.defineProperty(canvas, 'clientWidth', { value: RENDER_WIDTH });
    Object.defineProperty(canvas, 'clientHeight', { value: RENDER_HEIGHT });

    const gl = canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
    });
    if (!gl) throw new Error('WebGL not available');
    gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

    // 8. Render
    const size = structure.getSize();
    const volume = size[0] * size[1] * size[2];
    const renderer = new StructureRenderer(gl, structure, resources, {
        chunkSize: volume > 500_000 ? 32 : 16,
    });

    const view = buildViewMatrix(bounds ?? boundsFromSize(structure.getSize()), yaw, pitch, zoom);
    gl.clearColor(0, 0, 0, 0); // transparent background for OG image
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    renderer.drawStructure(view);

    // Free the WebGL context immediately after reading pixels
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = RENDER_WIDTH;
    copyCanvas.height = RENDER_HEIGHT;
    copyCanvas.getContext('2d')!.drawImage(canvas, 0, 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    // 9. Trim transparent border and encode as PNG
    const trimmed = trimCanvas(copyCanvas);
    return new Promise<File>((resolve, reject) => {
        trimmed.toBlob((blob) => {
            if (!blob) { reject(new Error('toBlob returned null')); return; }
            resolve(new File([blob], 'preview.png', { type: 'image/png' }));
        }, 'image/png');
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function yieldToMain(): Promise<void> {
    return new Promise(r => setTimeout(r, 0));
}

function upperPowerOfTwo(x: number): number {
    x -= 1;
    x |= x >> 1; x |= x >> 2; x |= x >> 4; x |= x >> 8; x |= x >> 16;
    return x + 1;
}

function buildResources(
    assets: {
        blockstates: Record<string, unknown>;
        models: Record<string, unknown>;
        textures: Record<string, [number, number, number, number]>;
    },
    textureImage: HTMLImageElement,
): Resources {
    const blockDefinitions: Record<string, BlockDefinition> = {};
    for (const id of Object.keys(assets.blockstates)) {
        blockDefinitions['minecraft:' + id] = BlockDefinition.fromJson(
            id,
            assets.blockstates[id] as Parameters<typeof BlockDefinition.fromJson>[1],
        );
    }

    const blockModels: Record<string, BlockModel> = {};
    for (const id of Object.keys(assets.models)) {
        blockModels['minecraft:' + id] = BlockModel.fromJson(
            id,
            assets.models[id] as Parameters<typeof BlockModel.fromJson>[1],
        );
    }
    for (const builtin of ['builtin/generated', 'builtin/entity', 'builtin/block']) {
        if (!blockModels['minecraft:' + builtin]) {
            blockModels['minecraft:' + builtin] = BlockModel.fromJson(builtin, {});
        }
    }
    Object.values(blockModels).forEach(m =>
        m.flatten({ getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null }),
    );

    const atlasSize = upperPowerOfTwo(Math.max(textureImage.width, textureImage.height));
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = textureImage.width;
    atlasCanvas.height = textureImage.height;
    atlasCanvas.getContext('2d')!.drawImage(textureImage, 0, 0);
    const atlasData = atlasCanvas.getContext('2d')!.getImageData(0, 0, atlasSize, atlasSize);

    const idMap: Record<string, [number, number, number, number]> = {};
    for (const id of Object.keys(assets.textures)) {
        const [u, v, du, dv] = assets.textures[id];
        const dv2 = du !== dv && id.startsWith('block/') ? du : dv;
        idMap['minecraft:' + id] = [
            u / atlasSize,
            v / atlasSize,
            (u + du) / atlasSize,
            (v + dv2) / atlasSize,
        ];
    }

    const textureAtlas = new TextureAtlas(atlasData, idMap);

    return {
        getBlockDefinition: (id: Identifier) => blockDefinitions[id.toString()] ?? null,
        getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null,
        getTextureUV: (id: Identifier) => textureAtlas.getTextureUV(id),
        getTextureAtlas: () => textureAtlas.getTextureAtlas(),
        getBlockFlags: (id: Identifier) => ({
            opaque: OPAQUE_BLOCKS.has(id.toString()),
            semi_transparent: TRANSPARENT_BLOCKS.has(id.toString()),
            self_culling: !NON_SELF_CULLING.has(id.toString()),
        }),
        getBlockProperties: () => null,
        getDefaultBlockProperties: () => null,
    };
}

function boundsFromSize(size: [number, number, number]): NonAirBounds {
    return { minX: 0, maxX: size[0] - 1, minY: 0, maxY: size[1] - 1, minZ: 0, maxZ: size[2] - 1 };
}

function buildViewMatrix(
    bounds: NonAirBounds,
    yaw: number,
    pitch: number,
    zoom: number,
): mat4 {
    // Frame around the tight non-air bounding box (not the full structure/region size) so a
    // capture zone with empty padding around the actual build doesn't render it tiny and
    // off-centre.
    const halfX = (bounds.maxX - bounds.minX + 1) / 2;
    const halfY = (bounds.maxY - bounds.minY + 1) / 2;
    const halfZ = (bounds.maxZ - bounds.minZ + 1) / 2;
    const cx = bounds.minX + halfX, cy = bounds.minY + halfY, cz = bounds.minZ + halfZ;

    const pitchRad = (pitch * Math.PI) / 180;
    const yawRad = (yaw * Math.PI) / 180;

    const radius = Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ);
    const baseDist = Math.max(radius * 2.2, 5);
    const dist = baseDist * (100 / zoom);

    const cameraPos = vec3.fromValues(-cx, -cy, -cz);
    const zoomOffset = vec3.fromValues(0, 0, -dist);
    vec3.rotateX(zoomOffset, zoomOffset, [0, 0, 0], -pitchRad);
    vec3.rotateY(zoomOffset, zoomOffset, [0, 0, 0], -yawRad);
    vec3.add(cameraPos, cameraPos, zoomOffset);

    const view = mat4.create();
    mat4.rotateX(view, view, pitchRad);
    mat4.rotateY(view, view, yawRad);
    mat4.translate(view, view, cameraPos);
    return view;
}

function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX) return canvas;
    // Trim tight to the actual rendered content, no extra padding - the card's
    // `object-fit: cover` relies on this to fill its box edge-to-edge with no empty margin.
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
}
