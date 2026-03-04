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
 * Manual texture overrides for blocks whose model textures
 * don't represent the block well (e.g. lever → cobblestone particle).
 * Maps block short id → texture id in assets.textures.
 */
const TEXTURE_OVERRIDES: Record<string, string[]> = {
    lever: ['item/lever', 'block/lever'],
    redstone_wire: ['block/redstone_dust_dot', 'item/redstone'],
    tripwire: ['block/tripwire'],
    tripwire_hook: ['block/tripwire_hook'],
    string: ['block/tripwire', 'item/string'],
    comparator: ['item/comparator', 'block/comparator'],
    repeater: ['item/repeater', 'block/repeater'],
    brewing_stand: ['item/brewing_stand', 'block/brewing_stand'],
    cauldron: ['item/cauldron', 'block/cauldron_side'],
    water_cauldron: ['item/cauldron', 'block/cauldron_side'],
    lava_cauldron: ['item/cauldron', 'block/cauldron_side'],
    powder_snow_cauldron: ['item/cauldron', 'block/cauldron_side'],
    flower_pot: ['item/flower_pot', 'block/flower_pot'],
    hopper: ['item/hopper', 'block/hopper_outside'],
    rail: ['block/rail', 'item/rail'],
    powered_rail: ['block/powered_rail', 'item/powered_rail'],
    detector_rail: ['block/detector_rail', 'item/detector_rail'],
    activator_rail: ['block/activator_rail', 'item/activator_rail'],
    chain: ['item/chain', 'block/chain'],
    lantern: ['item/lantern', 'block/lantern'],
    soul_lantern: ['item/soul_lantern', 'block/soul_lantern'],
    campfire: ['item/campfire', 'block/campfire_log_lit'],
    soul_campfire: ['item/soul_campfire', 'block/soul_campfire_log_lit'],
    bell: ['item/bell', 'block/bell_body'],
    conduit: ['item/conduit', 'block/conduit'],
    end_rod: ['item/end_rod', 'block/end_rod'],
    lightning_rod: ['item/lightning_rod', 'block/lightning_rod'],
    candle: ['item/candle', 'block/candle_lit'],
    dragon_egg: ['block/dragon_egg'],
    chorus_plant: ['block/chorus_plant', 'item/chorus_plant'],
    chorus_flower: ['block/chorus_flower', 'item/chorus_flower'],
    // Buttons – their model textures point to the block face via particle
    stone_button: ['block/stone'],
    oak_button: ['block/oak_planks'],
    spruce_button: ['block/spruce_planks'],
    birch_button: ['block/birch_planks'],
    jungle_button: ['block/jungle_planks'],
    acacia_button: ['block/acacia_planks'],
    dark_oak_button: ['block/dark_oak_planks'],
    cherry_button: ['block/cherry_planks'],
    bamboo_button: ['block/bamboo_planks'],
    mangrove_button: ['block/mangrove_planks'],
    crimson_button: ['block/crimson_planks'],
    warped_button: ['block/warped_planks'],
    polished_blackstone_button: ['block/polished_blackstone'],
    // Pressure plates – same issue
    stone_pressure_plate: ['block/stone'],
    oak_pressure_plate: ['block/oak_planks'],
    spruce_pressure_plate: ['block/spruce_planks'],
    birch_pressure_plate: ['block/birch_planks'],
    jungle_pressure_plate: ['block/jungle_planks'],
    acacia_pressure_plate: ['block/acacia_planks'],
    dark_oak_pressure_plate: ['block/dark_oak_planks'],
    cherry_pressure_plate: ['block/cherry_planks'],
    bamboo_pressure_plate: ['block/bamboo_planks'],
    mangrove_pressure_plate: ['block/mangrove_planks'],
    crimson_pressure_plate: ['block/crimson_planks'],
    warped_pressure_plate: ['block/warped_planks'],
    polished_blackstone_pressure_plate: ['block/polished_blackstone'],
    heavy_weighted_pressure_plate: ['block/iron_block'],
    light_weighted_pressure_plate: ['block/gold_block'],
    // Other problematic blocks
    scaffolding: ['block/scaffolding_top', 'item/scaffolding'],
    ladder: ['block/ladder'],
    iron_bars: ['block/iron_bars'],
    glass_pane: ['block/glass'],
    vine: ['block/vine'],
    lily_pad: ['block/lily_pad', 'item/lily_pad'],
    turtle_egg: ['item/turtle_egg'],
    frogspawn: ['block/frogspawn', 'item/frogspawn'],
    pointed_dripstone: ['item/pointed_dripstone', 'block/pointed_dripstone_tip'],
    sweet_berry_bush: ['item/sweet_berries'],
    cave_vines: ['item/glow_berries'],
    cave_vines_plant: ['item/glow_berries'],
    bubble_column: ['block/bubble_column_outer_mid'],
};

/**
 * Resolve a block id (e.g. "minecraft:spruce_slab") to pixel coordinates in the atlas.
 *
 * This merges ALL texture variables across the entire model parent chain first,
 * then resolves #variable references (e.g. "#all" → "block/stone") so that
 * blocks whose child model only defines variable indirections are resolved correctly.
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

    // ── Step 0: Check manual overrides first ──
    const overrides = TEXTURE_OVERRIDES[shortId];
    if (overrides) {
        for (const texId of overrides) {
            const rect = assets.textures[texId];
            if (rect) return rect;
        }
    }

    const blockstate = assets.blockstates[shortId] as
        | { variants?: Record<string, unknown>; multipart?: unknown[] }
        | undefined;
    if (!blockstate) {
        // No blockstate — try direct texture lookups as last resort
        return assets.textures[`block/${shortId}`]
            ?? assets.textures[`item/${shortId}`]
            ?? null;
    }

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

    // ── Step 1: Merge ALL texture variables across the entire parent chain ──
    // Child values take priority over parent values (first-wins in the map).
    const merged: Record<string, string> = {};
    let currentModel = modelRef.replace('minecraft:', '');
    const visited = new Set<string>();
    while (currentModel && !visited.has(currentModel)) {
        visited.add(currentModel);
        const model = assets.models[currentModel] as
            | { textures?: Record<string, string>; parent?: string }
            | undefined;
        if (!model) break;

        if (model.textures) {
            for (const [k, v] of Object.entries(model.textures)) {
                if (!(k in merged)) merged[k] = v; // child wins
            }
        }
        currentModel = model.parent?.replace('minecraft:', '') ?? '';
    }

    // ── Step 2: Resolve helper that follows #variable chains ──
    const resolve = (key: string): [number, number, number, number] | null => {
        let val = merged[key];
        let depth = 0;
        while (val?.startsWith('#') && depth < 10) {
            val = merged[val.substring(1)];
            depth++;
        }
        if (!val || val.startsWith('#')) return null;
        const texKey = val.replace('minecraft:', '');
        return assets.textures[texKey] ?? null;
    };

    // ── Step 3: Try preferred texture keys in priority order ──
    // 'particle' is deliberately last because it often points to an unrelated
    // texture (e.g. lever → cobblestone).
    const PREFERRED_KEYS = [
        'all', 'top', 'front', 'side',
        'south', 'east', 'north', 'west', 'up',
        'texture', 'cross', 'plant', 'end',
        'line', 'dot', 'overlay',
    ];
    for (const key of PREFERRED_KEYS) {
        const rect = resolve(key);
        if (rect) return rect;
    }

    // ── Step 4: Fallback – try any non-particle texture in the merged map ──
    for (const key of Object.keys(merged)) {
        if (key === 'particle') continue;
        const rect = resolve(key);
        if (rect) return rect;
    }

    // ── Step 5: Try direct item/block texture lookups ──
    const directItem = assets.textures[`item/${shortId}`];
    if (directItem) return directItem;
    const directBlock = assets.textures[`block/${shortId}`];
    if (directBlock) return directBlock;

    // ── Step 6: Last resort – particle ──
    const particleRect = resolve('particle');
    if (particleRect) return particleRect;

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
