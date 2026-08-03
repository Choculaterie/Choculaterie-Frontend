/** Renders a single block's icon as a data URL, driven by the /internal/icon-batch route. */
import * as THREE from 'three';
import { SchematicRenderer } from 'schematic-renderer';
import { RESOURCE_PACK_URL } from './resource-pack';

const ICON_SIZE = 128; // offline render, no client-side perf cost

let rendererPromise: Promise<SchematicRenderer> | null = null;

function getRenderer(): Promise<SchematicRenderer> {
    if (!rendererPromise) {
        rendererPromise = new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = ICON_SIZE;
            canvas.height = ICON_SIZE;
            Object.defineProperty(canvas, 'clientWidth', { value: ICON_SIZE });
            Object.defineProperty(canvas, 'clientHeight', { value: ICON_SIZE });

            const renderer = new SchematicRenderer(canvas, {}, {
                vanilla: () => fetch(RESOURCE_PACK_URL).then(r => r.blob()),
            }, {
                showGrid: false,
                enableInteraction: false,
                enableDragAndDrop: false,
                enableGizmos: false,
                enableProgressBar: false,
                sidebarOptions: { enabled: false } as any,
                postProcessingOptions: { enabled: false },
                callbacks: {
                    onRendererInitialized: async () => {
                        try {
                            await renderer.renderManager?.setBackgroundMode('transparent');
                            resolve(renderer);
                        } catch (err) {
                            reject(err);
                        }
                    },
                },
            });
        });
    }
    return rendererPromise;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// Connection-state blocks (walls, redstone wire...) render empty with no properties set.
function fallbackStateFor(name: string): string | null {
    if (name === 'redstone_wire') return '[east=none,north=none,south=none,west=none,power=0]';
    if (name.endsWith('_wall')) return '[up=true]';
    return '[north=true,east=true,south=true,west=true,up=true,down=true,bottom=true,waterlogged=false]';
}

/** Renders one block (e.g. "minecraft:oak_stairs") to a PNG data URL, or null if unresolvable. */
export async function renderBlockIconDataUrl(blockKey: string): Promise<string | null> {
    const renderer = await getRenderer();
    let mesh: THREE.Object3D | null | undefined = await renderer.cubane.getBlockMesh(blockKey);
    if (!mesh || new THREE.Box3().setFromObject(mesh).isEmpty()) {
        const name = blockKey.includes(':') ? blockKey.split(':')[1] : blockKey;
        const fallbackState = fallbackStateFor(name);
        mesh = fallbackState ? await renderer.cubane.getBlockMesh(blockKey + fallbackState) : null;
    }
    return mesh ? renderMesh(renderer, mesh) : null;
}

async function renderMesh(renderer: SchematicRenderer, mesh: THREE.Object3D): Promise<string | null> {
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    mesh.position.sub(center);

    renderer.sceneManager.scene.add(mesh);
    try {
        const radius = Math.max(size.x, size.y, size.z, 0.3) * 1.6 + 0.6;
        const direction = new THREE.Vector3(1, 0.9, 1).normalize().multiplyScalar(radius);
        renderer.cameraManager.activeCamera.setPositionLookAt(direction, new THREE.Vector3(0, 0, 0));

        const blob = await renderer.takeScreenshot({
            width: ICON_SIZE, height: ICON_SIZE, format: 'image/png', transparent: true,
        });
        return await blobToDataUrl(blob);
    } finally {
        renderer.sceneManager.scene.remove(mesh);
    }
}
