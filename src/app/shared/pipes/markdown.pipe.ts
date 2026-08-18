import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Returns a plain string on purpose: binding a string to [innerHTML] runs
 * Angular's sanitizer, which keeps markdown's tags and strips scripts and
 * javascript: URLs. marked has shipped no sanitizer since v8.
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';
        return marked.parse(value, { async: false, breaks: true }) as string;
    }
}
