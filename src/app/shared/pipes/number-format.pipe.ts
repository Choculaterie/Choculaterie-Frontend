import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'numFmt', standalone: true })
export class NumberFormatPipe implements PipeTransform {
    transform(value: unknown, maxDecimals = 2): string {
        const n = Number(value);
        if (isNaN(n)) return String(value ?? '');
        // Use toFixed then parseFloat to strip trailing zeros
        return parseFloat(n.toFixed(maxDecimals)).toLocaleString('en-US', {
            maximumFractionDigits: maxDecimals,
        });
    }
}
