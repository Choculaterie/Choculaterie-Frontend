import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';
import { emojify } from '../utils/emojify';

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';
        return marked.parse(emojify(value), { async: false, breaks: true }) as string;
    }
}
