// Self-check: node server/qs-render.test.mjs
// Renders an oak-log cube and asserts projection, texturing and PNG output.
// Catches the two bugs that are easy to reintroduce: a flipped view basis
// (image upside down) and a flipped atlas V (nothing drawn at all).
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { SchematicWrapper } from 'nucleation';
import { renderLitematic } from './qs-render.mjs';

const packPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', 'public', 'assets', 'litematic-viewer', 'pack.zip',
);

await init();
const schem = new SchematicWrapper();
schem.fillCuboid(0, 0, 0, 3, 3, 3, 'minecraft:oak_log');

const size = 128;
const png = await renderLitematic(schem.to_litematic(), { packPath, size, ssaa: 2 });

assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');

// Decode enough of the PNG to inspect pixels; every row uses filter type 0.
const { inflateSync } = await import('node:zlib');
const idat = [];
for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat));
const stride = size * 4 + 1;
const px = (x, y) => {
    const o = y * stride + 1 + x * 4;
    return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]];
};

let opaque = 0;
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (px(x, y)[3] > 200) opaque++;

// A cube seen isometrically fills roughly three quarters of its bounding box.
assert.ok(opaque > size * size * 0.5, `too few opaque pixels: ${opaque}`);
assert.ok(opaque < size * size * 0.95, `suspiciously full frame: ${opaque}`);

// Corners must be transparent: a hexagon, not a rectangle.
for (const [x, y] of [[1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2]]) {
    assert.ok(px(x, y)[3] < 40, `corner (${x},${y}) should be empty, got alpha ${px(x, y)[3]}`);
}

// The log top is lit at 1.0 and the bark sides at 0.6, so the top must be
// clearly brighter. A flipped atlas V samples empty texels and never gets here.
const lum = (p) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
const top = lum(px(size >> 1, size * 0.22 | 0));
const side = lum(px(size * 0.25 | 0, size * 0.72 | 0));
assert.ok(top > side * 1.25, `top face (${top.toFixed(1)}) should outshine the side (${side.toFixed(1)})`);

// A negated view basis rotates the image 180°, which inverts this ratio.
const halfLum = (from, to) => {
    let sum = 0, n = 0;
    for (let y = from; y < to; y++) {
        for (let x = 0; x < size; x++) {
            const p = px(x, y);
            if (p[3] > 200) { sum += lum(p); n++; }
        }
    }
    return n ? sum / n : 0;
};
const upper = halfLum(0, size >> 1);
const lower = halfLum(size >> 1, size);
assert.ok(upper > lower * 1.2, `image looks upside down (upper ${upper.toFixed(1)} vs lower ${lower.toFixed(1)})`);

console.log(`ok — ${opaque} opaque px, top ${top.toFixed(1)} vs side ${side.toFixed(1)}, upper/lower ${(upper / lower).toFixed(2)}`);
