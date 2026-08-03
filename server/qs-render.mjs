// Headless isometric render of a litematic: nucleation (WASM) builds the same mesh
// the browser viewer uses, then we rasterize it on the CPU. No browser, no WebGL.
import fs from 'node:fs';
import zlib from 'node:zlib';
import init, { SchematicWrapper, ResourcePackWrapper, MeshConfigWrapper } from 'nucleation';

let ready = null;
let cachedPack = null;
let cachedPackPath = null;

// nucleation bakes AO into vertex colors but not directional light, so the
// Minecraft face-shading constants have to be applied here.
function faceShade(nx, ny, nz) {
    if (ny > 0.5) return 1.0;
    if (ny < -0.5) return 0.5;
    if (Math.abs(nz) > Math.abs(nx)) return 0.8;
    return 0.6;
}

// Parsing the 7MB pack takes ~200ms, so keep it for the process lifetime.
async function getPack(packPath) {
    ready ??= init();
    await ready;
    if (cachedPackPath !== packPath) {
        cachedPack = ResourcePackWrapper.fromBytesList([new Uint8Array(fs.readFileSync(packPath))]);
        cachedPackPath = packPath;
    }
    return cachedPack;
}

// Renders a litematic to a transparent isometric PNG. packPath must be the same
// pack.zip the browser viewer loads, or the textures won't match it.
export async function renderLitematic(litematicBytes, { packPath, size = 1024, ssaa = 2, yawDeg = 45, pitchDeg = 35 } = {}) {
    const pack = await getPack(packPath);

    const schem = new SchematicWrapper();
    schem.from_litematic(new Uint8Array(litematicBytes));

    const cfg = new MeshConfigWrapper();
    cfg.setAmbientOcclusion(true);
    cfg.setGreedyMeshing(false); // greedy merges faces and breaks per-block UVs
    cfg.setCullHiddenFaces(true);

    const mesh = schem.toMesh(pack, cfg);

    const atlas = mesh.atlasRgba();
    const aW = mesh.atlasWidth, aH = mesh.atlasHeight;

    const layers = [
        { pos: mesh.opaquePositions(), uv: mesh.opaqueUvs(), col: mesh.opaqueColors(), nrm: mesh.opaqueNormals(), idx: mesh.opaqueIndices(), blend: false },
        { pos: mesh.cutoutPositions(), uv: mesh.cutoutUvs(), col: mesh.cutoutColors(), nrm: mesh.cutoutNormals(), idx: mesh.cutoutIndices(), blend: false, alphaTest: 0.5 },
        { pos: mesh.transparentPositions(), uv: mesh.transparentUvs(), col: mesh.transparentColors(), nrm: mesh.transparentNormals(), idx: mesh.transparentIndices(), blend: true },
    ].filter(l => l.idx.length > 0);

    if (!layers.length) throw new Error('empty mesh');

    // Orthographic isometric, same angles as the viewer.
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const fx = -Math.cos(pitch) * Math.sin(yaw);
    const fy = -Math.sin(pitch);
    const fz = -Math.cos(pitch) * Math.cos(yaw);
    // right = cross(f, worldUp), up = cross(right, f). Sign errors here rotate
    // the whole image 180°, so keep the derivation explicit.
    const rx = Math.cos(yaw), ry = 0, rz = -Math.sin(yaw);
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    const project = (x, y, z) => [x * rx + y * ry + z * rz, x * ux + y * uy + z * uz, x * fx + y * fy + z * fz];

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const l of layers) {
        for (let i = 0; i < l.pos.length; i += 3) {
            const [u, v] = project(l.pos[i], l.pos[i + 1], l.pos[i + 2]);
            if (u < minU) minU = u; if (u > maxU) maxU = u;
            if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
    }

    const W = size * ssaa, H = size * ssaa;
    const margin = 0.98;
    const scale = Math.min(W / (maxU - minU), H / (maxV - minV)) * margin;
    const cU = (minU + maxU) / 2, cV = (minV + maxV) / 2;
    const toScreen = (u, v) => [W / 2 + (u - cU) * scale, H / 2 - (v - cV) * scale];

    // ponytail: ~85MB of scratch at 1024/ssaa2. The raster loop below never awaits,
    // so only one render's buffers are ever live at a time; if these ever need to be
    // concurrent, pool them or drop ssaa to 1.
    const color = new Float32Array(W * H * 4);
    const depth = new Float32Array(W * H).fill(Infinity);

    const tri = new Float32Array(9);

    for (const layer of layers) {
        const { pos, uv, col, nrm, idx, blend, alphaTest } = layer;

        // Transparent geometry must blend back-to-front.
        let order = null;
        if (blend) {
            const n = idx.length / 3;
            order = Array.from({ length: n }, (_, t) => {
                let d = 0;
                for (let k = 0; k < 3; k++) {
                    const vi = idx[t * 3 + k] * 3;
                    d += project(pos[vi], pos[vi + 1], pos[vi + 2])[2];
                }
                return [t, d / 3];
            }).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        }

        const triCount = idx.length / 3;
        for (let t0 = 0; t0 < triCount; t0++) {
            const t = order ? order[t0] : t0;
            const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
            const ids = [i0, i1, i2];

            for (let k = 0; k < 3; k++) {
                const vi = ids[k] * 3;
                const [u, v, d] = project(pos[vi], pos[vi + 1], pos[vi + 2]);
                const [sx, sy] = toScreen(u, v);
                tri[k * 3] = sx; tri[k * 3 + 1] = sy; tri[k * 3 + 2] = d;
            }

            const x0 = tri[0], y0 = tri[1], x1 = tri[3], y1 = tri[4], x2 = tri[6], y2 = tri[7];
            const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
            if (area === 0) continue;
            const invArea = 1 / area;

            const bxMin = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
            const bxMax = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
            const byMin = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
            const byMax = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
            if (bxMin > bxMax || byMin > byMax) continue;

            const ni = i0 * 3;
            const shade = faceShade(nrm[ni], nrm[ni + 1], nrm[ni + 2]);

            for (let py = byMin; py <= byMax; py++) {
                const cy = py + 0.5;
                for (let px = bxMin; px <= bxMax; px++) {
                    const cx = px + 0.5;
                    let w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * invArea;
                    let w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * invArea;
                    let w2 = 1 - w0 - w1;
                    if (w0 < 0 || w1 < 0 || w2 < 0) continue;

                    const d = w0 * tri[2] + w1 * tri[5] + w2 * tri[8];
                    const di = py * W + px;
                    if (d >= depth[di]) continue;

                    const tu = w0 * uv[i0 * 2] + w1 * uv[i1 * 2] + w2 * uv[i2 * 2];
                    const tv = w0 * uv[i0 * 2 + 1] + w1 * uv[i1 * 2 + 1] + w2 * uv[i2 * 2 + 1];

                    // Nearest-neighbour keeps Minecraft's crisp pixels. Atlas rows and
                    // nucleation's V coords are both top-down, so do NOT flip V here.
                    let ax = Math.floor(tu * aW);
                    let ay = Math.floor(tv * aH);
                    ax = ax < 0 ? 0 : ax >= aW ? aW - 1 : ax;
                    ay = ay < 0 ? 0 : ay >= aH ? aH - 1 : ay;
                    const ai = (ay * aW + ax) * 4;

                    let a = atlas[ai + 3] / 255;
                    if (alphaTest !== undefined && a < alphaTest) continue;
                    if (a === 0) continue;

                    const cStride = col.length / (pos.length / 3);
                    const c0 = i0 * cStride, c1 = i1 * cStride, c2 = i2 * cStride;
                    const vr = w0 * col[c0] + w1 * col[c1] + w2 * col[c2];
                    const vg = w0 * col[c0 + 1] + w1 * col[c1 + 1] + w2 * col[c2 + 1];
                    const vb = w0 * col[c0 + 2] + w1 * col[c1 + 2] + w2 * col[c2 + 2];
                    if (cStride === 4) a *= w0 * col[c0 + 3] + w1 * col[c1 + 3] + w2 * col[c2 + 3];

                    const r = (atlas[ai] / 255) * vr * shade;
                    const g = (atlas[ai + 1] / 255) * vg * shade;
                    const b = (atlas[ai + 2] / 255) * vb * shade;

                    const ci = di * 4;
                    if (blend && a < 1) {
                        color[ci] = color[ci] * (1 - a) + r * a;
                        color[ci + 1] = color[ci + 1] * (1 - a) + g * a;
                        color[ci + 2] = color[ci + 2] * (1 - a) + b * a;
                        color[ci + 3] = color[ci + 3] * (1 - a) + a;
                    } else {
                        color[ci] = r; color[ci + 1] = g; color[ci + 2] = b; color[ci + 3] = a;
                        depth[di] = d;
                    }
                }
            }
        }
    }

    schem.free?.();
    return encodePng(downsample(color, W, H, ssaa), size, size);
}

// Box-filter the supersampled buffer down to output size. This is the antialiasing.
function downsample(src, W, H, ssaa) {
    const w = W / ssaa, h = H / ssaa;
    const out = Buffer.allocUnsafe(w * h * 4);
    const inv = 1 / (ssaa * ssaa);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < ssaa; sy++) {
                for (let sx = 0; sx < ssaa; sx++) {
                    const i = ((y * ssaa + sy) * W + (x * ssaa + sx)) * 4;
                    // Weight colour by alpha so transparent edges don't darken toward black.
                    const sa = src[i + 3];
                    r += src[i] * sa; g += src[i + 1] * sa; b += src[i + 2] * sa; a += sa;
                }
            }
            const o = (y * w + x) * 4;
            const norm = a > 0 ? 1 / a : 0;
            out[o] = Math.min(255, Math.round(r * norm * 255));
            out[o + 1] = Math.min(255, Math.round(g * norm * 255));
            out[o + 2] = Math.min(255, Math.round(b * norm * 255));
            out[o + 3] = Math.min(255, Math.round(a * inv * 255));
        }
    }
    return out;
}

// Minimal PNG writer; zlib is stdlib, so this isn't worth a dependency.
function encodePng(rgba, w, h) {
    const raw = Buffer.allocUnsafe((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0; // filter type 0
        rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
}

let crcTable = null;
function crc32(buf) {
    if (!crcTable) {
        crcTable = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c;
        }
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c ^ -1;
}
