/** Headless isometric renderer for .litematic files, on a canvas never attached to the DOM. */

import { SchematicRenderer } from 'schematic-renderer';
import { RESOURCE_PACK_URL } from './resource-pack';

const RENDER_WIDTH = 1024;
const RENDER_HEIGHT = 1024;

/** Renders a .litematic file to a PNG File. */
export async function renderLitematicHeadless(
    fileData: ArrayBuffer,
    yaw = 45,
    pitch = 35,
): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = RENDER_WIDTH;
    canvas.height = RENDER_HEIGHT;
    // Detached canvas: clientWidth/clientHeight default to 0, so spoof them.
    Object.defineProperty(canvas, 'clientWidth', { value: RENDER_WIDTH });
    Object.defineProperty(canvas, 'clientHeight', { value: RENDER_HEIGHT });

    let onReady!: () => void;
    const ready = new Promise<void>(resolve => { onReady = resolve; });
    const renderer = new SchematicRenderer(canvas, {}, {
        vanilla: () => fetch(RESOURCE_PACK_URL).then(r => r.blob()),
    }, {
        showGrid: false,
        enableDragAndDrop: false,
        enableGizmos: false,
        enableInteraction: false,
        enableProgressBar: false,
        sidebarOptions: { enabled: false } as any,
        cameraOptions: { defaultCameraPreset: 'isometric' },
        callbacks: { onRendererInitialized: () => onReady() },
    });

    try {
        await ready;
        await renderer.schematicManager!.loadSchematic('main', fileData);
        // Meshes never get inserted into the group on a detached canvas without this.
        await (renderer.schematicManager!.getSchematic('main') as any)?.rebuildMesh();

        renderer.setCameraMode('isometric');
        // refocus:false + focusOnSchematics(), not setIsometricAngles(..., true): the latter's
        // refocus is an unawaited tween, so a screenshot right after would catch it mid-flight.
        renderer.setIsometricAngles(pitch, yaw, false);
        await renderer.cameraManager.focusOnSchematics();
        // setCameraMode() resets scene.background to opaque, which wins over the capture's alpha.
        await renderer.renderManager?.setBackgroundMode('transparent');

        const blob = await renderer.takeScreenshot({
            width: RENDER_WIDTH,
            height: RENDER_HEIGHT,
            format: 'image/png',
            transparent: true,
        });
        return new File([blob], 'preview.png', { type: 'image/png' });
    } finally {
        renderer.dispose();
    }
}
