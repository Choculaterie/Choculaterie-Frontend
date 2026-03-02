import { readNbt, Structure, type NbtTag, type NbtValues } from 'deepslate';

export interface LitematicRegion {
    width: number;
    height: number;
    depth: number;
    absWidth: number;
    absHeight: number;
    absDepth: number;
    blocks: Uint16Array;
    blockPalette: { Name: string; Properties?: Record<string, string> }[];
}

export interface Litematic {
    regions: LitematicRegion[];
}

/**
 * Parse a .litematic file from raw bytes into a Litematic object.
 */
export function parseLitematic(data: Uint8Array): Litematic {
    const nbtData = readNbt(data);
    return readLitematicFromNBTData(nbtData);
}

function readLitematicFromNBTData(nbtData: { value: NbtValues['compound'] }): Litematic {
    const litematic: Litematic = { regions: [] };
    const regionsTag = nbtData.value['Regions'];
    if (!regionsTag || regionsTag.type !== 'compound') return litematic;

    const regions = regionsTag.value;

    for (const regionName in regions) {
        const regionTag = regions[regionName];
        if (!regionTag || regionTag.type !== 'compound') continue;
        const region = regionTag.value;

        const blockPalette = stripNBTTyping(
            region['BlockStatePalette'] as NbtTag,
        ) as { Name: string; Properties?: Record<string, string> }[];

        const nbits = Math.max(1, Math.ceil(Math.log2(blockPalette.length)));

        const sizeTag = region['Size'];
        if (!sizeTag || sizeTag.type !== 'compound') continue;
        const width = (sizeTag.value['x'] as { type: 'int'; value: number }).value;
        const height = (sizeTag.value['y'] as { type: 'int'; value: number }).value;
        const depth = (sizeTag.value['z'] as { type: 'int'; value: number }).value;

        const absWidth = Math.abs(width);
        const absHeight = Math.abs(height);
        const absDepth = Math.abs(depth);

        const blockStatesTag = region['BlockStates'];
        if (!blockStatesTag || blockStatesTag.type !== 'longArray') continue;
        const blockData = blockStatesTag.value;

        const blocks = processNBTRegionData(blockData, nbits, absWidth, absHeight, absDepth);

        litematic.regions.push({ width, height, depth, absWidth, absHeight, absDepth, blocks, blockPalette });
    }

    return litematic;
}

function processNBTRegionData(
    regionData: [number, number][],
    nbits: number,
    absWidth: number,
    absHeight: number,
    absDepth: number,
): Uint16Array {
    const mask = (1 << nbits) - 1;
    const yShift = absWidth * absDepth;
    const zShift = absWidth;

    const totalBlocks = absWidth * absHeight * absDepth;
    const blocks = new Uint16Array(totalBlocks);
    const hd = absHeight * absDepth;

    for (let x = 0; x < absWidth; x++) {
        const xOff = x * hd;
        for (let y = 0; y < absHeight; y++) {
            const yOff = y * absDepth;
            for (let z = 0; z < absDepth; z++) {
                const index = y * yShift + z * zShift + x;
                const startOffset = index * nbits;
                const startArrIndex = startOffset >>> 5;
                const endArrIndex = ((index + 1) * nbits - 1) >>> 5;
                const startBitOffset = startOffset & 0x1f;

                const halfInd = startArrIndex >>> 1;
                let blockStart: number;
                let blockEnd: number;

                if ((startArrIndex & 0x1) === 0) {
                    blockStart = regionData[halfInd][1];
                    blockEnd = regionData[halfInd][0];
                } else {
                    blockStart = regionData[halfInd][0];
                    blockEnd =
                        halfInd + 1 < regionData.length ? regionData[halfInd + 1][1] : 0x0;
                }

                const flatIdx = xOff + yOff + z;
                if (startArrIndex === endArrIndex) {
                    blocks[flatIdx] = (blockStart >>> startBitOffset) & mask;
                } else {
                    const endOffset = 32 - startBitOffset;
                    blocks[flatIdx] =
                        ((blockStart >>> startBitOffset) & mask) |
                        ((blockEnd << endOffset) & mask);
                }
            }
        }
    }
    return blocks;
}

/**
 * Count non-air blocks in a Y range (fast — no Structure allocation).
 */
export function countNonAirBlocks(
    litematic: Litematic, yMin = 0, yMax = -1,
): number {
    const region = litematic.regions[0];
    const { blocks, blockPalette, absWidth, absHeight, absDepth } = region;
    const effectiveYMax = yMax === -1 ? absHeight : Math.min(yMax, absHeight);
    const hd = absHeight * absDepth;
    let count = 0;
    for (let x = 0; x < absWidth; x++) {
        const xOff = x * hd;
        for (let y = yMin; y < effectiveYMax; y++) {
            const yOff = y * absDepth;
            for (let z = 0; z < absDepth; z++) {
                const id = blocks[xOff + yOff + z];
                if (id > 0 && id < blockPalette.length) count++;
            }
        }
    }
    return count;
}

/**
 * Convert a parsed Litematic into a deepslate Structure.
 * Async version that yields to the UI thread every batch to prevent browser freezing.
 */
export async function structureFromLitematicAsync(
    litematic: Litematic,
    yMin = 0,
    yMax = -1,
    onProgress?: (fraction: number) => void,
    abortSignal?: { aborted: boolean },
): Promise<Structure | null> {
    const region = litematic.regions[0];
    const { blocks, blockPalette, absWidth, absHeight, absDepth } = region;

    const effectiveYMax = yMax === -1 ? absHeight : Math.min(yMax, absHeight);
    const structure = new Structure([absWidth, absHeight, absDepth]);
    const hd = absHeight * absDepth;

    const BATCH_SIZE = 20_000;
    let processed = 0;
    const total = absWidth * (effectiveYMax - yMin) * absDepth;

    for (let x = 0; x < absWidth; x++) {
        const xOff = x * hd;
        for (let y = yMin; y < effectiveYMax; y++) {
            const yOff = y * absDepth;
            for (let z = 0; z < absDepth; z++) {
                const blockID = blocks[xOff + yOff + z];
                if (blockID > 0 && blockID < blockPalette.length) {
                    const blockInfo = blockPalette[blockID];
                    if (blockInfo.Properties) {
                        structure.addBlock([x, y, z], blockInfo.Name, blockInfo.Properties);
                    } else {
                        structure.addBlock([x, y, z], blockInfo.Name);
                    }
                }
                processed++;
                if (processed % BATCH_SIZE === 0) {
                    onProgress?.(processed / total);
                    await new Promise<void>(r => setTimeout(r, 0));
                    if (abortSignal?.aborted) return null;
                }
            }
        }
    }

    onProgress?.(1);
    return structure;
}

/**
 * Synchronous version — for smaller structures or when yielding is not needed.
 */
export function structureFromLitematic(
    litematic: Litematic,
    yMin = 0,
    yMax = -1,
): Structure {
    const region = litematic.regions[0];
    const { blocks, blockPalette, absWidth, absHeight, absDepth } = region;

    const effectiveYMax = yMax === -1 ? absHeight : Math.min(yMax, absHeight);
    const structure = new Structure([absWidth, absHeight, absDepth]);
    const hd = absHeight * absDepth;

    for (let x = 0; x < absWidth; x++) {
        const xOff = x * hd;
        for (let y = yMin; y < effectiveYMax; y++) {
            const yOff = y * absDepth;
            for (let z = 0; z < absDepth; z++) {
                const blockID = blocks[xOff + yOff + z];
                if (blockID > 0 && blockID < blockPalette.length) {
                    const blockInfo = blockPalette[blockID];
                    if (blockInfo.Properties) {
                        structure.addBlock([x, y, z], blockInfo.Name, blockInfo.Properties);
                    } else {
                        structure.addBlock([x, y, z], blockInfo.Name);
                    }
                }
            }
        }
    }

    return structure;
}

/**
 * Get material counts from a litematic for display.
 */
export function getMaterialList(
    litematic: Litematic,
): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const region of litematic.regions) {
        const { blocks, blockPalette, absWidth, absHeight, absDepth } = region;
        const hd = absHeight * absDepth;
        for (let x = 0; x < absWidth; x++) {
            const xOff = x * hd;
            for (let y = 0; y < absHeight; y++) {
                const yOff = y * absDepth;
                for (let z = 0; z < absDepth; z++) {
                    const id = blocks[xOff + yOff + z];
                    if (id > 0 && id < blockPalette.length) {
                        const name = blockPalette[id].Name;
                        counts[name] = (counts[name] || 0) + 1;
                    }
                }
            }
        }
    }
    return counts;
}

export interface MaterialEntry {
    name: string;       // e.g. "Spruce Slab"
    count: number;
    /** Pixel rectangle [x, y, w, h] in the atlas, or null if no texture found. */
    textureRect: [number, number, number, number] | null;
}

/**
 * Resolve a block id (e.g. "minecraft:spruce_slab") to pixel coordinates in the atlas.
 */
export function resolveBlockTexture(
    blockId: string,
    assets: {
        blockstates: Record<string, unknown>;
        models: Record<string, unknown>;
        textures: Record<string, [number, number, number, number]>;
    },
): [number, number, number, number] | null {
    const shortId = blockId.replace('minecraft:', '');
    const blockstate = assets.blockstates[shortId] as
        | { variants?: Record<string, unknown>; multipart?: unknown[] }
        | undefined;
    if (!blockstate) return null;

    // Get the first model reference from the blockstate
    let modelRef: string | null = null;
    if (blockstate.variants) {
        const firstVariant = Object.values(blockstate.variants)[0];
        const entry = Array.isArray(firstVariant) ? firstVariant[0] : firstVariant;
        modelRef = (entry as { model?: string })?.model ?? null;
    } else if (blockstate.multipart) {
        const firstPart = (blockstate.multipart as { apply?: unknown }[])[0];
        const apply = firstPart?.apply;
        const entry = Array.isArray(apply) ? apply[0] : apply;
        modelRef = (entry as { model?: string })?.model ?? null;
    }
    if (!modelRef) return null;

    // Walk the model parent chain to find one concrete texture reference
    let currentModel = modelRef.replace('minecraft:', '');
    const visited = new Set<string>();
    while (currentModel && !visited.has(currentModel)) {
        visited.add(currentModel);
        const model = assets.models[currentModel] as
            | { textures?: Record<string, string>; parent?: string }
            | undefined;
        if (!model) break;

        if (model.textures) {
            // Try common texture keys in priority order
            for (const key of ['all', 'top', 'front', 'side', 'texture', 'cross', 'plant', 'particle']) {
                const val = model.textures[key];
                if (val && !val.startsWith('#')) {
                    const texKey = val.replace('minecraft:', '');
                    const rect = assets.textures[texKey];
                    if (rect) return rect;
                }
            }
            // Fallback: try any texture value
            for (const val of Object.values(model.textures)) {
                if (val && !val.startsWith('#')) {
                    const texKey = val.replace('minecraft:', '');
                    const rect = assets.textures[texKey];
                    if (rect) return rect;
                }
            }
        }
        // Follow parent
        currentModel = model.parent?.replace('minecraft:', '') ?? '';
    }
    return null;
}

/**
 * Build a sorted material list with texture atlas coords.
 */
export function getMaterialListWithTextures(
    litematic: Litematic,
    assets: {
        blockstates: Record<string, unknown>;
        models: Record<string, unknown>;
        textures: Record<string, [number, number, number, number]>;
    },
): MaterialEntry[] {
    const counts = getMaterialList(litematic);
    const result: MaterialEntry[] = [];
    for (const [blockId, count] of Object.entries(counts)) {
        const shortName = blockId.replace('minecraft:', '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        result.push({
            name: shortName,
            count,
            textureRect: resolveBlockTexture(blockId, assets),
        });
    }
    result.sort((a, b) => b.count - a.count);
    return result;
}

// --- NBT stripping helper ---

function stripNBTTyping(nbtData: NbtTag | Record<string, NbtTag>): unknown {
    if (nbtData && typeof nbtData === 'object' && 'type' in nbtData) {
        const tag = nbtData as NbtTag;
        switch (tag.type) {
            case 'compound': {
                const result: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(
                    tag.value as Record<string, NbtTag>,
                )) {
                    result[k] = stripNBTTyping(v);
                }
                return result;
            }
            case 'list': {
                const listVal = tag.value as unknown as { type: string; value: NbtTag[] };
                return listVal.value.map((v: NbtTag) => stripNBTTyping(v));
            }
            default:
                return tag.value;
        }
    } else if (nbtData && typeof nbtData === 'object' && nbtData.constructor === Object) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(nbtData as Record<string, NbtTag>)) {
            result[k] = stripNBTTyping(v);
        }
        return result;
    }
    return nbtData;
}
