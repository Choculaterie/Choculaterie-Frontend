import { Pipe, PipeTransform } from '@angular/core';

export function toMcIcon(path: string | null | undefined): string {
    if (!path) return '';
    const m = /^\/?icons\/(.+)\.svg$/.exec(path);
    return m ? `mc:${m[1]}` : path;
}

@Pipe({ name: 'mcIcon', standalone: true })
export class McIconPipe implements PipeTransform {
    transform(path: string | null | undefined): string {
        return toMcIcon(path);
    }
}
