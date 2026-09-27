import { Pipe, PipeTransform } from '@angular/core';
import { translateText } from './translation.store';

@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
    transform(text: string): string {
        return translateText(text);
    }
}
