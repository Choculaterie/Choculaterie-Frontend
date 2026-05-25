import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'fileSize', standalone: true })
export class FileSizePipe implements PipeTransform {
    transform(bytes: unknown, decimals = 2): string {
        const b = Number(bytes);
        if (!b || isNaN(b)) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        const value = b / Math.pow(k, i);
        const maxDecimals = Math.min(decimals, 2);
        // Remove trailing zeros for cleaner display
        const formatted = parseFloat(value.toFixed(i === 0 ? 0 : maxDecimals));
        return `${formatted} ${sizes[i]}`;
    }
}
