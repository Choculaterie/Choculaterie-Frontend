import { Pipe, PipeTransform } from '@angular/core';
import { translateText } from './translation.store';

/**
 * Impure so a language switch re-renders in place instead of reloading. Kept
 * trivial on purpose: a signal read and one lookup per binding per pass.
 */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
    transform(text: string): string {
        return translateText(text);
    }
}
