import {
    Component,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    Inject,
    signal,
    computed,
    NgZone,
} from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import {
    BlockDefinition,
    BlockModel,
    TextureAtlas,
    Structure,
    StructureRenderer,
    type Resources,
    type Identifier,
    type BlockPos,
} from 'deepslate';
import { mat4, vec3 } from 'gl-matrix';


import { parseLitematic, structureFromLitematicAsync, countNonAirBlocks, computeLitematicDiff, type Litematic, type LitematicDiffResult } from './litematic-utils';
import { OPAQUE_BLOCKS, TRANSPARENT_BLOCKS, NON_SELF_CULLING } from './opaque-blocks';

export interface LitematicViewerData {
    fileData: ArrayBuffer;
    fileName: string;
    /**
     * Enables diff mode: blocks added/changed relative to this older snapshot render with a
     * green tint, blocks removed render as a red-tinted ghost of the old block. Pass `null`
     * (rather than omitting the field) to diff against "nothing" - i.e. treat every block as
     * added, matching how GitHub renders the diff for a commit with no parent.
     */
    parentFileData?: ArrayBuffer | null;
}

@Component({
    selector: 'app-litematic-viewer',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatSliderModule,
        MatTooltipModule,
        FormsModule,
    ],
    templateUrl: './litematic-viewer.component.html',
    styleUrl: './litematic-viewer.component.scss',
})
export class LitematicViewerComponent implements AfterViewInit, OnDestroy {
    // Max non-air blocks to render before auto-limiting Y range
    private static readonly MAX_BLOCKS = 250_000;

    @ViewChild('viewerCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

    readonly loading = signal(true);
    readonly loadingProgress = signal(0);
    readonly loadingStatus = signal('Loading block definitions…');
    readonly error = signal('');
    readonly blockCountInfo = signal('');
    readonly isDiffMode = signal(false);
    readonly diffSummary = signal<{ added: number; removed: number } | null>(null);

    // Region navigation - .litematic files can contain multiple named regions (Litematica's
    // multi-area capture mode); only one is shown at a time, switched via arrows in the header.
    readonly regionCount = signal(1);
    readonly regionIndex = signal(0);
    readonly currentRegionName = computed(() => this.litematic?.regions[this.regionIndex()]?.name ?? '');

    // Y-layer sliders
    minY = 0;
    maxY = 0;
    currentMinY = 0;
    currentMaxY = 0;

    private gl!: WebGLRenderingContext;
    private renderer!: StructureRenderer;
    private resources!: Resources;
    private litematic!: Litematic;
    private structure!: Structure;
    private chunkSize = 16;
    // Cached full blocks array from the initial structure build
    private allBlocks: { pos: [number, number, number]; state: number; nbt?: unknown }[] = [];
    // Track previous Y range for partial chunk updates
    private prevMinY = 0;
    private prevMaxY = 0;

    // Diff overlay - a small, separate WebGL program drawing translucent colour-tinted "glow
    // shells" slightly outside each diffed block's bounds, so they win the depth test against
    // the real (opaque) block geometry instead of being hidden behind it.
    private diffTints = new Map<string, [number, number, number, number]>();
    private overlayProgram: WebGLProgram | null = null;
    private overlayPositionBuffer: WebGLBuffer | null = null;
    private overlayColorBuffer: WebGLBuffer | null = null;
    private overlayVertexCount = 0;

    // Camera state
    private cameraPitch = 0.8;
    private cameraYaw = 0.5;
    private cameraPos = vec3.create();

    // Input tracking
    private leftPos: [number, number] | null = null;
    private middlePos: [number, number] | null = null;
    private pressedKeys = new Set<string>();
    private keyInterval: ReturnType<typeof setInterval> | null = null;
    private cleanupFns: (() => void)[] = [];
    private destroyed = false;
    private yChangeTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: LitematicViewerData,
        private dialogRef: MatDialogRef<LitematicViewerComponent>,
        private http: HttpClient,
        private zone: NgZone,
    ) { }

    ngAfterViewInit(): void {
        this.initViewer();
    }

    downloadFile(): void {
        const blob = new Blob([this.data.fileData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.data.fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];
        if (this.keyInterval) {
            clearInterval(this.keyInterval);
        }
        if (this.yChangeTimeout) {
            clearTimeout(this.yChangeTimeout);
        }
    }

    private initViewer(): void {
        this.loadingProgress.set(0);
        this.loadingStatus.set('Loading block definitions\u2026');

        // Step 1: Load assets.json with download progress tracking
        this.http.get<{
            blockstates: Record<string, unknown>;
            models: Record<string, unknown>;
            textures: Record<string, [number, number, number, number]>;
        }>('/assets/litematic-viewer/assets.json', {
            reportProgress: true,
            observe: 'events',
        }).subscribe({
            next: (event) => {
                if (event.type === HttpEventType.DownloadProgress) {
                    if (event.total) {
                        this.loadingProgress.set(Math.round((event.loaded / event.total) * 70));
                    }
                } else if (event.type === HttpEventType.Response) {
                    this.loadingProgress.set(70);
                    this.loadingStatus.set('Loading textures\u2026');
                    this.loadAtlas(event.body!);
                }
            },
            error: () => {
                this.error.set('Failed to load viewer resources.');
                this.loading.set(false);
            },
        });
    }

    private loadAtlas(assets: {
        blockstates: Record<string, unknown>;
        models: Record<string, unknown>;
        textures: Record<string, [number, number, number, number]>;
    }): void {
        this.http.get('/assets/litematic-viewer/atlas.png', { responseType: 'blob' }).subscribe({
            next: (atlasBlob) => {
                this.loadingProgress.set(80);
                this.loadingStatus.set('Parsing litematic\u2026');
                const img = new Image();
                img.onload = async () => {
                    try {
                        this.loadingProgress.set(82);
                        this.loadingStatus.set('Parsing litematic\u2026');
                        await new Promise<void>(r => setTimeout(r, 0));
                        if (this.destroyed) return;

                        this.resources = this.buildResources(assets, img);
                        this.litematic = await parseLitematic(new Uint8Array(this.data.fileData));
                        if (this.destroyed) return;

                        if (!this.litematic.regions.length) {
                            this.error.set('No regions found in litematic file.');
                            this.loading.set(false);
                            return;
                        }

                        this.loadingProgress.set(85);
                        this.loadingStatus.set('Counting blocks…');
                        await new Promise<void>(r => setTimeout(r, 0));
                        if (this.destroyed) return;

                        const hasDiff = this.data.parentFileData !== undefined;
                        let diffResult: LitematicDiffResult | null = null;
                        if (hasDiff) {
                            this.isDiffMode.set(true);
                            this.loadingStatus.set('Diffing against previous commit…');
                            const parentLitematic = this.data.parentFileData
                                ? await parseLitematic(new Uint8Array(this.data.parentFileData))
                                : null;
                            if (this.destroyed) return;
                            diffResult = await computeLitematicDiff(
                                parentLitematic, this.litematic,
                                (frac) => this.loadingProgress.set(85 + Math.round(frac * 2)),
                            );
                            if (this.destroyed) return;

                            if (diffResult.tooLarge) {
                                this.error.set(`Diff bounding box is too large to preview (${diffResult.width}×${diffResult.height}×${diffResult.depth}).`);
                                this.loading.set(false);
                                return;
                            }

                            this.diffSummary.set({
                                added: diffResult.addedCount + diffResult.changedCount,
                                removed: diffResult.removedCount,
                            });

                            if (diffResult.blocks.length > LitematicViewerComponent.MAX_BLOCKS) {
                                this.error.set(`Diff is too large to preview (${diffResult.blocks.length.toLocaleString()} blocks, max ${LitematicViewerComponent.MAX_BLOCKS.toLocaleString()}).`);
                                this.loading.set(false);
                                return;
                            }
                        }

                        this.setupCanvas();
                        this.setupControls();
                        this.initOverlayProgram();

                        if (diffResult) {
                            this.regionCount.set(1);
                            this.regionIndex.set(0);
                            this.minY = 0;
                            this.maxY = diffResult.height;
                            this.currentMinY = 0;
                            this.currentMaxY = this.maxY;
                            this.blockCountInfo.set(`${diffResult.blocks.length.toLocaleString()} blocks total`);
                            this.loadingProgress.set(87);
                            this.loadingStatus.set('Building 3D structure\u2026');
                            const structure = new Structure([diffResult.width, diffResult.height, diffResult.depth]);
                            // Chunked, same as structureFromLitematicAsync below - addBlock() does real
                            // work per call (model/state resolution), so a tight synchronous loop over a
                            // large diff is exactly the kind of thing that freezes the tab.
                            const DIFF_BATCH_SIZE = 5_000;
                            for (let i = 0; i < diffResult.blocks.length; i++) {
                                const b = diffResult.blocks[i];
                                if (b.properties) structure.addBlock(b.pos, b.name, b.properties);
                                else structure.addBlock(b.pos, b.name);
                                if ((i + 1) % DIFF_BATCH_SIZE === 0) {
                                    this.loadingProgress.set(87 + Math.round(((i + 1) / diffResult.blocks.length) * 8));
                                    await new Promise<void>(r => setTimeout(r, 0));
                                    if (this.destroyed) return;
                                }
                            }
                            this.diffTints = diffResult.tints;

                            if (this.destroyed) return;

                            this.loadingProgress.set(96);
                            this.loadingStatus.set('Generating mesh\u2026');
                            await new Promise<void>(r => setTimeout(r, 0));
                            if (this.destroyed) return;

                            this.setStructure(structure, true);
                            this.structure = structure;
                            this.allBlocks = (structure as any).blocks.slice();
                            this.prevMinY = this.currentMinY;
                            this.prevMaxY = this.currentMaxY;
                            await this.buildOverlayBuffers();
                            if (this.destroyed) return;
                        } else {
                            this.regionCount.set(this.litematic.regions.length);
                            this.regionIndex.set(0);
                            await this.loadRegion(0, true);
                            if (this.destroyed) return;
                        }

                        this.loadingProgress.set(100);
                        this.loading.set(false);
                    } catch (e) {
                        console.error('Litematic viewer init error:', e);
                        this.error.set('Failed to parse litematic file.');
                        this.loading.set(false);
                    }
                };
                img.onerror = () => {
                    this.error.set('Failed to load texture atlas.');
                    this.loading.set(false);
                };
                img.src = URL.createObjectURL(atlasBlob);
            },
            error: () => {
                this.error.set('Failed to load viewer resources.');
                this.loading.set(false);
            },
        });
    }

    /** Switch to the previous/next region (wraps around). No-op during diff mode or mid-load. */
    async switchRegion(delta: number): Promise<void> {
        const count = this.regionCount();
        if (count <= 1 || this.loading()) return;
        const next = (this.regionIndex() + delta + count) % count;
        this.regionIndex.set(next);

        this.loading.set(true);
        this.loadingProgress.set(0);
        this.loadingStatus.set('Building 3D structure…');
        try {
            await this.loadRegion(next, true);
        } catch (e) {
            console.error('Litematic region switch error:', e);
            this.error.set('Failed to load region.');
        }
        if (this.destroyed) return;
        this.loadingProgress.set(100);
        this.loading.set(false);
    }

    /** Builds and displays the Structure for a single region of the parsed litematic. */
    private async loadRegion(idx: number, resetView: boolean): Promise<void> {
        const region = this.litematic.regions[idx];
        const single: Litematic = { regions: [region] };

        this.minY = 0;
        this.maxY = region.absHeight;
        this.currentMinY = 0;
        this.currentMaxY = this.maxY;

        const totalBlocks = countNonAirBlocks(single);
        if (totalBlocks > LitematicViewerComponent.MAX_BLOCKS) {
            // Binary-search for how many Y layers we can afford
            let lo = 1, hi = region.absHeight;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                const c = countNonAirBlocks(single, 0, mid);
                if (c <= LitematicViewerComponent.MAX_BLOCKS) lo = mid; else hi = mid - 1;
            }
            this.currentMaxY = lo;
            this.blockCountInfo.set(
                `Showing Y 0–${lo} of ${region.absHeight} (${totalBlocks.toLocaleString()} blocks total, limited for performance)`,
            );
        } else {
            this.blockCountInfo.set(`${totalBlocks.toLocaleString()} blocks`);
        }

        this.loadingProgress.set(87);
        this.loadingStatus.set('Building 3D structure…');
        await new Promise<void>(r => setTimeout(r, 0));
        if (this.destroyed) return;

        const structure = await structureFromLitematicAsync(
            single, this.currentMinY, this.currentMaxY,
            (frac) => this.loadingProgress.set(87 + Math.round(frac * 8)),
        );
        if (!structure || this.destroyed) return;

        this.loadingProgress.set(96);
        this.loadingStatus.set('Generating mesh…');
        await new Promise<void>(r => setTimeout(r, 0));
        if (this.destroyed) return;

        this.diffTints = new Map();
        this.setStructure(structure, resetView);

        // Cache the full blocks array for fast Y-range filtering later
        this.structure = structure;
        this.allBlocks = (structure as any).blocks.slice();
        this.prevMinY = this.currentMinY;
        this.prevMaxY = this.currentMaxY;
        await this.buildOverlayBuffers();
    }

    private buildResources(
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
        // Register built-in parent stubs so flatten() can resolve them
        for (const builtin of ['builtin/generated', 'builtin/entity', 'builtin/block']) {
            if (!blockModels['minecraft:' + builtin]) {
                blockModels['minecraft:' + builtin] = BlockModel.fromJson(builtin, {});
            }
        }
        Object.values(blockModels).forEach(m =>
            m.flatten({ getBlockModel: (id: Identifier) => blockModels[id.toString()] ?? null }),
        );

        // Build texture atlas
        const atlasSize = this.upperPowerOfTwo(
            Math.max(textureImage.width, textureImage.height),
        );
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = textureImage.width;
        atlasCanvas.height = textureImage.height;
        const ctx = atlasCanvas.getContext('2d')!;
        ctx.drawImage(textureImage, 0, 0);
        const atlasData = ctx.getImageData(0, 0, atlasSize, atlasSize);

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

    private setupCanvas(): void {
        const canvas = this.canvasRef.nativeElement;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        this.gl = canvas.getContext('webgl')!;
        if (!this.gl) {
            this.error.set('WebGL is not supported in this browser.');
            return;
        }
    }

    private setStructure(structure: Structure, resetView: boolean): void {
        // Choose chunk size based on structure volume for better performance
        const size = structure.getSize();
        const volume = size[0] * size[1] * size[2];
        this.chunkSize = volume > 500_000 ? 32 : 16;

        if (!this.renderer) {
            this.renderer = new StructureRenderer(this.gl, structure, this.resources, {
                chunkSize: this.chunkSize,
            });
        } else {
            this.renderer.setStructure(structure);
        }

        if (resetView) {
            this.cameraPitch = 0.8;
            this.cameraYaw = 0.5;
            const size = structure.getSize();
            vec3.set(this.cameraPos, -size[0] / 2, -size[1] / 2, -size[2] / 2);
        }

        this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.render()));
    }

    private render(): void {
        if (!this.renderer) return;

        this.cameraYaw = this.cameraYaw % (Math.PI * 2);
        this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));

        const view = mat4.create();
        mat4.rotateX(view, view, this.cameraPitch);
        mat4.rotateY(view, view, this.cameraYaw);
        mat4.translate(view, view, this.cameraPos);

        this.renderer.drawStructure(view);
        this.drawDiffOverlay(view);
        this.renderer.drawGrid(view);
    }

    private renderStructureOnly(): void {
        if (!this.renderer) return;

        this.cameraYaw = this.cameraYaw % (Math.PI * 2);
        this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));

        const view = mat4.create();
        mat4.rotateX(view, view, this.cameraPitch);
        mat4.rotateY(view, view, this.cameraYaw);
        mat4.translate(view, view, this.cameraPos);

        this.renderer.drawStructure(view);
        this.drawDiffOverlay(view);
        // deliberately skip drawGrid so screenshot has no grid lines
    }

    // --- Diff overlay rendering ---
    //
    // deepslate's own colour shader programs aren't suited to this: vsColor encodes block
    // position as colour (used for mouse-picking, not freely settable colour), and vsGrid
    // hardcodes alpha to 1.0 (no translucency). So this is a small, separate WebGL program
    // sharing the same gl context, drawn after the textured structure each frame.

    private initOverlayProgram(): void {
        const gl = this.gl;
        if (!gl || this.overlayProgram) return;

        const vsSource = `
            attribute vec3 aPos;
            attribute vec4 aColor;
            uniform mat4 mView;
            uniform mat4 mProj;
            varying vec4 vColor;
            void main(void) {
                gl_Position = mProj * mView * vec4(aPos, 1.0);
                vColor = aColor;
            }
        `;
        const fsSource = `
            precision mediump float;
            varying vec4 vColor;
            void main(void) {
                gl_FragColor = vColor;
            }
        `;

        const compile = (type: number, source: string): WebGLShader => {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return shader;
        };

        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(program);

        this.overlayProgram = program;
        this.overlayPositionBuffer = gl.createBuffer();
        this.overlayColorBuffer = gl.createBuffer();
    }

    /**
     * Rebuilds the overlay's vertex buffers from {@link diffTints}, restricted to the current
     * Y range. Each tinted position gets a cube slightly *larger* than the real block (a "glow
     * shell") so its near faces win the depth test against the real, opaque block geometry
     * instead of being hidden behind it.
     */
    private async buildOverlayBuffers(): Promise<void> {
        const gl = this.gl;
        if (!gl || !this.overlayProgram) return;

        const MARGIN = 0.03;
        const lo = -MARGIN, hi = 1 + MARGIN;
        // 6 faces, 2 triangles each, wound CCW when viewed from outside.
        const cubeTriangles: [number, number, number][][] = [
            // -X / +X
            [[lo, lo, lo], [lo, lo, hi], [lo, hi, hi]], [[lo, lo, lo], [lo, hi, hi], [lo, hi, lo]],
            [[hi, lo, hi], [hi, lo, lo], [hi, hi, lo]], [[hi, lo, hi], [hi, hi, lo], [hi, hi, hi]],
            // -Y / +Y
            [[lo, lo, lo], [hi, lo, lo], [hi, lo, hi]], [[lo, lo, lo], [hi, lo, hi], [lo, lo, hi]],
            [[lo, hi, hi], [hi, hi, hi], [hi, hi, lo]], [[lo, hi, hi], [hi, hi, lo], [lo, hi, lo]],
            // -Z / +Z
            [[hi, lo, lo], [lo, lo, lo], [lo, hi, lo]], [[hi, lo, lo], [lo, hi, lo], [hi, hi, lo]],
            [[lo, lo, hi], [hi, lo, hi], [hi, hi, hi]], [[lo, lo, hi], [hi, hi, hi], [lo, hi, hi]],
        ];

        const positions: number[] = [];
        const colors: number[] = [];
        // Chunked - building geometry for a large diff (thousands of tinted cubes x 36 verts
        // each) synchronously was the other half of what froze the tab on large diffs.
        const BATCH_SIZE = 2_000;
        let processed = 0;
        for (const [key, color] of this.diffTints) {
            const [x, y, z] = key.split(',').map(Number);
            if (y >= this.currentMinY && y < this.currentMaxY) {
                for (const tri of cubeTriangles) {
                    for (const [dx, dy, dz] of tri) {
                        positions.push(x + dx, y + dy, z + dz);
                        colors.push(...color);
                    }
                }
            }

            processed++;
            if (processed % BATCH_SIZE === 0) {
                await new Promise<void>(r => setTimeout(r, 0));
                if (this.destroyed) return;
            }
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayPositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
        this.overlayVertexCount = positions.length / 3;
        this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.render()));
    }

    private drawDiffOverlay(view: mat4): void {
        const gl = this.gl;
        if (!gl || !this.overlayProgram || this.overlayVertexCount === 0) return;

        gl.useProgram(this.overlayProgram);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.overlayProgram, 'mProj'), false, (this.renderer as any).projMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.overlayProgram, 'mView'), false, view);

        const posLoc = gl.getAttribLocation(this.overlayProgram, 'aPos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayPositionBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        const colorLoc = gl.getAttribLocation(this.overlayProgram, 'aColor');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayColorBuffer);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);

        // Ghost cubes should be visible from inside (e.g. a removed block the camera is near).
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, this.overlayVertexCount);
        gl.enable(gl.CULL_FACE);
    }

    // --- Camera movement ---

    private move3d(direction: vec3, relativeVertical = true, sensitivity = 1): void {
        const offset = vec3.create();
        vec3.set(offset, direction[0] * sensitivity, direction[1] * sensitivity, direction[2] * sensitivity);
        if (relativeVertical) {
            vec3.rotateX(offset, offset, [0, 0, 0], -this.cameraPitch * sensitivity);
        }
        vec3.rotateY(offset, offset, [0, 0, 0], -this.cameraYaw * sensitivity);
        vec3.add(this.cameraPos, this.cameraPos, offset);
    }

    private pan(dx: number, dy: number): void {
        this.cameraYaw += dx / 200;
        this.cameraPitch += dy / 200;
    }

    private move(dx: number, dy: number): void {
        const xOff = dx / 500;
        const yOff = dy / 500;
        const offset = vec3.create();
        vec3.set(offset, xOff, -yOff, 0);
        vec3.rotateX(offset, offset, [0, 0, 0], -this.cameraPitch);
        vec3.rotateY(offset, offset, [0, 0, 0], -this.cameraYaw);
        vec3.add(this.cameraPos, this.cameraPos, offset);
    }

    // --- Controls ---

    private setupControls(): void {
        const canvas = this.canvasRef.nativeElement;

        this.zone.runOutsideAngular(() => {
            const onMouseDown = (evt: MouseEvent) => {
                if (evt.button === 0) {
                    evt.preventDefault();
                    this.leftPos = [evt.clientX, evt.clientY];
                } else if (evt.button === 1) {
                    evt.preventDefault();
                    this.middlePos = [evt.clientX, evt.clientY];
                }
            };

            const onMouseMove = (evt: MouseEvent) => {
                if (this.middlePos) {
                    this.move(evt.clientX - this.middlePos[0], evt.clientY - this.middlePos[1]);
                    this.middlePos = [evt.clientX, evt.clientY];
                    requestAnimationFrame(() => this.render());
                } else if (this.leftPos) {
                    this.pan(evt.clientX - this.leftPos[0], evt.clientY - this.leftPos[1]);
                    this.leftPos = [evt.clientX, evt.clientY];
                    requestAnimationFrame(() => this.render());
                }
            };

            const onMouseUp = (evt: MouseEvent) => {
                if (evt.button === 0) this.leftPos = null;
                else if (evt.button === 1) {
                    this.middlePos = null;
                    evt.preventDefault();
                }
            };

            const onMouseOut = (evt: MouseEvent) => {
                this.leftPos = null;
                this.middlePos = null;
                evt.preventDefault();
            };

            const onWheel = (evt: WheelEvent) => {
                evt.preventDefault();
                this.move3d(vec3.fromValues(0, 0, -evt.deltaY / 200));
                requestAnimationFrame(() => this.render());
            };

            const moveDist = 0.2;
            const keyMoves: Record<string, [number, number, number]> = {
                KeyW: [0, 0, moveDist],
                KeyS: [0, 0, -moveDist],
                KeyA: [moveDist, 0, 0],
                KeyD: [-moveDist, 0, 0],
                ArrowUp: [0, 0, moveDist],
                ArrowDown: [0, 0, -moveDist],
                ArrowLeft: [moveDist, 0, 0],
                ArrowRight: [-moveDist, 0, 0],
                ShiftLeft: [0, moveDist, 0],
                Space: [0, -moveDist, 0],
            };

            const onKeyDown = (evt: KeyboardEvent) => {
                if (evt.code in keyMoves) {
                    evt.preventDefault();
                    this.pressedKeys.add(evt.code);
                }
            };

            const onKeyUp = (evt: KeyboardEvent) => {
                this.pressedKeys.delete(evt.code);
            };

            const onBlur = () => this.pressedKeys.clear();

            // Touch support
            let prevDist: number | null = null;
            let prevAvgX: number | null = null;
            let prevAvgY: number | null = null;
            let touchSinglePos: [number, number] | null = null;

            const onTouchStart = (evt: TouchEvent) => {
                evt.preventDefault();
                if (evt.touches.length === 1) {
                    touchSinglePos = [evt.touches[0].pageX, evt.touches[0].pageY];
                }
            };

            const onTouchMove = (evt: TouchEvent) => {
                evt.preventDefault();
                if (evt.touches.length === 1 && touchSinglePos) {
                    this.pan(
                        evt.touches[0].pageX - touchSinglePos[0],
                        evt.touches[0].pageY - touchSinglePos[1],
                    );
                    touchSinglePos = [evt.touches[0].pageX, evt.touches[0].pageY];
                    requestAnimationFrame(() => this.render());
                } else if (evt.touches.length === 2) {
                    const dx = evt.touches[0].pageX - evt.touches[1].pageX;
                    const dy = evt.touches[0].pageY - evt.touches[1].pageY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (prevDist === null) prevDist = dist;

                    const avgX = (evt.touches[0].pageX + evt.touches[1].pageX) / 2;
                    const avgY = (evt.touches[0].pageY + evt.touches[1].pageY) / 2;
                    if (prevAvgX === null) prevAvgX = avgX;
                    if (prevAvgY === null) prevAvgY = avgY;

                    const distX = (avgX - prevAvgX) * 0.01;
                    const distY = (prevAvgY - avgY) * 0.01;
                    this.move3d(vec3.fromValues(distX, distY, (dist - prevDist) * 0.015));
                    requestAnimationFrame(() => this.render());
                    prevDist = dist;
                    prevAvgX = avgX;
                    prevAvgY = avgY;
                }
            };

            const onTouchEnd = () => {
                touchSinglePos = null;
                prevDist = null;
                prevAvgX = null;
                prevAvgY = null;
            };

            canvas.addEventListener('mousedown', onMouseDown);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseup', onMouseUp);
            canvas.addEventListener('mouseout', onMouseOut);
            canvas.addEventListener('wheel', onWheel, { passive: false });
            canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            canvas.addEventListener('touchend', onTouchEnd);
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            window.addEventListener('blur', onBlur);

            // Keyboard movement interval
            this.keyInterval = setInterval(() => {
                if (this.pressedKeys.size === 0) return;
                const direction = vec3.create();
                for (const key of this.pressedKeys) {
                    if (keyMoves[key]) {
                        vec3.add(direction, direction, keyMoves[key]);
                    }
                }
                this.move3d(direction, false);
                requestAnimationFrame(() => this.render());
            }, 1000 / 60);

            // Cleanup tracking
            this.cleanupFns.push(() => {
                canvas.removeEventListener('mousedown', onMouseDown);
                canvas.removeEventListener('mousemove', onMouseMove);
                canvas.removeEventListener('mouseup', onMouseUp);
                canvas.removeEventListener('mouseout', onMouseOut);
                canvas.removeEventListener('wheel', onWheel);
                canvas.removeEventListener('touchstart', onTouchStart);
                canvas.removeEventListener('touchmove', onTouchMove);
                canvas.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('keydown', onKeyDown);
                document.removeEventListener('keyup', onKeyUp);
                window.removeEventListener('blur', onBlur);
            });
        });

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            const c = this.canvasRef?.nativeElement;
            if (c) {
                c.width = c.clientWidth;
                c.height = c.clientHeight;
                this.gl?.viewport(0, 0, c.width, c.height);
                requestAnimationFrame(() => this.render());
            }
        });
        resizeObserver.observe(canvas);
        this.cleanupFns.push(() => resizeObserver.disconnect());
    }

    onYRangeChange(): void {
        if (this.yChangeTimeout) clearTimeout(this.yChangeTimeout);
        this.yChangeTimeout = setTimeout(() => this.applyYFilter(), 150);
    }

    /**
     * Fast Y-range update: filter cached blocks, patch the structure directly,
     * and only regenerate the chunk columns whose Y range actually changed.
     */
    private applyYFilter(): void {
        if (!this.structure || !this.allBlocks.length || this.destroyed) return;

        const yMin = this.currentMinY;
        const yMax = this.currentMaxY;
        const cs = this.chunkSize;
        const size = this.structure.getSize();

        // Determine which chunk Y-slabs are affected (symmetric difference of old/new Y range)
        const oldChunkMin = Math.floor(this.prevMinY / cs);
        const oldChunkMax = Math.floor(Math.max(this.prevMaxY - 1, 0) / cs);
        const newChunkMin = Math.floor(yMin / cs);
        const newChunkMax = Math.floor(Math.max(yMax - 1, 0) / cs);

        // Collect affected chunk positions: any chunk Y slab in old-but-not-new or new-but-not-old
        const affectedChunkYSet = new Set<number>();
        for (let cy = Math.min(oldChunkMin, newChunkMin); cy <= Math.max(oldChunkMax, newChunkMax); cy++) {
            const inOld = cy >= oldChunkMin && cy <= oldChunkMax;
            const inNew = cy >= newChunkMin && cy <= newChunkMax;
            if (inOld !== inNew) {
                affectedChunkYSet.add(cy);
            } else if (inOld && inNew) {
                // Boundary chunks may partially change if yMin/yMax cuts through them
                const chunkYStart = cy * cs;
                const chunkYEnd = (cy + 1) * cs;
                const oldStart = Math.max(this.prevMinY, chunkYStart);
                const oldEnd = Math.min(this.prevMaxY, chunkYEnd);
                const newStart = Math.max(yMin, chunkYStart);
                const newEnd = Math.min(yMax, chunkYEnd);
                if (oldStart !== newStart || oldEnd !== newEnd) {
                    affectedChunkYSet.add(cy);
                }
            }
        }

        // Filter blocks by new Y range
        const filtered = this.allBlocks.filter(b => b.pos[1] >= yMin && b.pos[1] < yMax);

        // Patch the structure's internal arrays
        (this.structure as any).blocks = filtered;
        const blocksMap: any[] = [];
        for (const block of filtered) {
            blocksMap[block.pos[0] * size[1] * size[2] + block.pos[1] * size[2] + block.pos[2]] = block;
        }
        (this.structure as any).blocksMap = blocksMap;

        // Update the renderer's structure reference
        (this.renderer as any).structure = this.structure;

        // Build list of affected chunk positions [cx, cy, cz] for all X/Z columns at affected Y slabs
        const xChunks = Math.ceil(size[0] / cs);
        const zChunks = Math.ceil(size[2] / cs);
        const chunkPositions: [number, number, number][] = [];
        for (const cy of affectedChunkYSet) {
            for (let cx = 0; cx < xChunks; cx++) {
                for (let cz = 0; cz < zChunks; cz++) {
                    chunkPositions.push([cx, cy, cz]);
                }
            }
        }

        // Partial mesh rebuild - only affected chunks
        (this.renderer as any).updateStructureBuffers(chunkPositions);

        this.prevMinY = yMin;
        this.prevMaxY = yMax;
        void this.buildOverlayBuffers();

        this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.render()));
    }

    private upperPowerOfTwo(x: number): number {
        x -= 1;
        x |= x >> 1;
        x |= x >> 2;
        x |= x >> 4;
        x |= x >> 8;
        x |= x >> 16;
        return x + 1;
    }
}
