import { Pipe, PipeTransform } from '@angular/core';
import { emojify } from '../utils/emojify';

@Pipe({ name: 'emojify', standalone: true })
export class EmojifyPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        return value ? emojify(value) : '';
    }
}
