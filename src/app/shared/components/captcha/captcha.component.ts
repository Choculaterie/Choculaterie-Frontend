import {
    Component, ElementRef, ViewChild,
    inject, signal, output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CaptchaService } from '../../../api/captcha';
import type { CaptchaPositionDto, CaptchaShape, CaptchaTrackPointDto } from '../../../api/generated.schemas';

const CANVAS_W = 400;
const CANVAS_H = 300;
const SNAP_THRESHOLD = 20; // backend tolerance in px

@Component({
    selector: 'app-captcha',
    standalone: true,
    imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
    templateUrl: './captcha.component.html',
    styleUrl: './captcha.component.scss',
})
export class CaptchaComponent {
    @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

    private captchaService = inject(CaptchaService);

    readonly solved = output<{ captchaId: string; captchaPositions: CaptchaPositionDto[] }>();
    readonly reset = output<void>();

    readonly phase = signal<'checkbox' | 'loading' | 'error' | 'challenge' | 'solved'>('checkbox');
    readonly errorMsg = signal('');
    readonly instructions = signal('');

    readonly canvasWidth = CANVAS_W;
    readonly canvasHeight = CANVAS_H;

    private captchaId = '';
    private allShapes: CaptchaShape[] = [];
    private draggables: DraggableShape[] = [];
    private ctx: CanvasRenderingContext2D | null = null;

    // Drag state
    private dragTarget: DraggableShape | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;

    // Timing — all timestamps are ms since captchaLoadTime
    private captchaLoadTime = 0;
    private dragStartTime = 0;
    private currentDragPath: CaptchaTrackPointDto[] = [];
    private completedDrags = new Map<string, {
        timestamp: number;
        dragDuration: number;
        dragPath: CaptchaTrackPointDto[];
    }>();

    onCheckboxClick(): void {
        this.loadChallenge();
    }

    resetChallenge(): void {
        this.phase.set('checkbox');
        this.completedDrags.clear();
        this.draggables = [];
        this.allShapes = [];
        this.reset.emit();
    }

    /** Fetch captcha challenge from the backend API. */
    private loadChallenge(): void {
        this.phase.set('loading');
        this.errorMsg.set('');
        this.completedDrags.clear();
        this.reset.emit();

        this.captchaService.getApiCaptcha().subscribe({
            next: (challenge) => {
                this.captchaId = challenge.captchaId;
                this.instructions.set(challenge.instructions);
                this.allShapes = challenge.shapes;
                this.captchaLoadTime = Date.now();

                // Build draggables with center-based positions from the API
                this.draggables = challenge.shapes
                    .filter(s => s.isDraggable)
                    .map(s => ({
                        shapeId: s.id,
                        type: s.type,
                        color: s.color,
                        size: Number(s.size),
                        cx: Number(s.x),
                        cy: Number(s.y),
                        placed: false,
                    }));

                this.phase.set('challenge');
                setTimeout(() => {
                    this.ctx = this.canvasRef?.nativeElement?.getContext('2d') ?? null;
                    this.draw();
                });
            },
            error: () => {
                this.phase.set('error');
                this.errorMsg.set('Failed to load captcha. Please retry.');
            },
        });
    }

    // ── Pointer events ──

    onPointerDown(e: MouseEvent): void {
        const pos = this.canvasPos(e);
        this.startDrag(pos.x, pos.y);
    }

    onPointerMove(e: MouseEvent): void {
        if (!this.dragTarget) return;
        const pos = this.canvasPos(e);
        this.moveDrag(pos.x, pos.y);
    }

    onPointerUp(_e: MouseEvent): void {
        this.endDrag();
    }

    onTouchStart(e: TouchEvent): void {
        e.preventDefault();
        const pos = this.canvasTouchPos(e);
        this.startDrag(pos.x, pos.y);
    }

    onTouchMove(e: TouchEvent): void {
        e.preventDefault();
        if (!this.dragTarget) return;
        const pos = this.canvasTouchPos(e);
        this.moveDrag(pos.x, pos.y);
    }

    onTouchEnd(e: TouchEvent): void {
        e.preventDefault();
        this.endDrag();
    }

    // ── Drag logic (all coordinates are center-based) ──

    private startDrag(x: number, y: number): void {
        // Find topmost draggable under pointer (reverse = top first)
        for (let i = this.draggables.length - 1; i >= 0; i--) {
            const d = this.draggables[i];
            if (d.placed) continue;
            const half = d.size / 2;
            if (Math.abs(x - d.cx) < half && Math.abs(y - d.cy) < half) {
                this.dragTarget = d;
                this.dragOffsetX = x - d.cx;
                this.dragOffsetY = y - d.cy;
                this.dragStartTime = Date.now();
                this.currentDragPath = [{
                    x: Math.round(x),
                    y: Math.round(y),
                    timestamp: Date.now() - this.captchaLoadTime,
                }];
                // Move to end of array for top z-order rendering
                this.draggables.splice(i, 1);
                this.draggables.push(d);
                this.draw();
                return;
            }
        }
    }

    private moveDrag(x: number, y: number): void {
        if (!this.dragTarget) return;
        this.dragTarget.cx = x - this.dragOffsetX;
        this.dragTarget.cy = y - this.dragOffsetY;
        this.currentDragPath.push({
            x: Math.round(x),
            y: Math.round(y),
            timestamp: Date.now() - this.captchaLoadTime,
        });
        this.draw();
    }

    private endDrag(): void {
        if (!this.dragTarget) return;
        const drag = this.dragTarget;
        this.dragTarget = null;

        // Find matching cutout by shapeId
        const cutout = this.allShapes.find(
            s => s.isCutout && s.id === drag.shapeId,
        );

        if (cutout) {
            const cutX = Number(cutout.x);
            const cutY = Number(cutout.y);
            const dist = Math.hypot(drag.cx - cutX, drag.cy - cutY);

            if (dist <= SNAP_THRESHOLD) {
                // Snap center to cutout center
                drag.cx = cutX;
                drag.cy = cutY;
                drag.placed = true;

                this.completedDrags.set(drag.shapeId, {
                    timestamp: Date.now() - this.captchaLoadTime,
                    dragDuration: Date.now() - this.dragStartTime,
                    dragPath: [...this.currentDragPath],
                });
            }
        }

        this.currentDragPath = [];
        this.draw();
        this.checkCompletion();
    }

    private checkCompletion(): void {
        if (this.draggables.every(d => d.placed) && this.captchaId) {
            const positions: CaptchaPositionDto[] = this.draggables.map(d => {
                const timing = this.completedDrags.get(d.shapeId)!;
                return {
                    shapeId: d.shapeId,
                    x: Math.round(d.cx),
                    y: Math.round(d.cy),
                    timestamp: timing.timestamp,
                    dragDuration: timing.dragDuration,
                    dragPath: timing.dragPath,
                };
            });

            this.phase.set('solved');
            this.solved.emit({
                captchaId: this.captchaId,
                captchaPositions: positions,
            });
        }
    }

    // ── Drawing (all shapes use center-based x, y) ──

    private draw(): void {
        if (!this.ctx) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Background
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // 1. Cutout targets (gray dashed)
        for (const s of this.allShapes.filter(sh => sh.isCutout)) {
            this.drawShape(ctx, s.type, Number(s.x), Number(s.y), Number(s.size), s.color, { dashed: true });
        }

        // 2. Decorative shapes (not cutout, not draggable)
        for (const s of this.allShapes.filter(sh => !sh.isCutout && !sh.isDraggable)) {
            this.drawShape(ctx, s.type, Number(s.x), Number(s.y), Number(s.size), s.color, {});
        }

        // 3. Draggable shapes at their current positions
        for (const d of this.draggables) {
            this.drawShape(ctx, d.type, d.cx, d.cy, d.size,
                d.placed ? d.color + '99' : d.color,
                { shadow: !d.placed });
        }
    }

    /**
     * Draw a shape centered at (cx, cy) with the given size.
     * Supported types: circle, triangle, rectangle.
     */
    private drawShape(
        ctx: CanvasRenderingContext2D,
        type: string, cx: number, cy: number, size: number, color: string,
        opts: { dashed?: boolean; shadow?: boolean },
    ): void {
        ctx.save();
        ctx.fillStyle = color;

        if (opts.dashed) {
            ctx.strokeStyle = 'rgba(158, 158, 158, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
        } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        }

        if (opts.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }

        const half = size / 2;
        ctx.beginPath();
        switch (type) {
            case 'circle':
                ctx.arc(cx, cy, half, 0, Math.PI * 2);
                break;
            case 'triangle':
                ctx.moveTo(cx, cy - half);
                ctx.lineTo(cx - half, cy + half);
                ctx.lineTo(cx + half, cy + half);
                ctx.closePath();
                break;
            default: // rectangle
                this.roundRect(ctx, cx - half, cy - half, size, size, 6);
                break;
        }
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ── Helpers ──

    private canvasPos(e: MouseEvent): { x: number; y: number } {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const scaleY = CANVAS_H / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    private canvasTouchPos(e: TouchEvent): { x: number; y: number } {
        const touch = e.touches[0] || e.changedTouches[0];
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const scaleY = CANVAS_H / rect.height;
        return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY,
        };
    }
}

/** Internal shape used for draggable pieces — center-based coordinates. */
interface DraggableShape {
    shapeId: string;
    type: string;
    color: string;
    size: number;
    cx: number; // current center X
    cy: number; // current center Y
    placed: boolean;
}
