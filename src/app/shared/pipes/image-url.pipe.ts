import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

@Pipe({ name: 'userImg', standalone: true })
export class UserImgPipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        return `${environment.apiBasePath}/images/users/${filePath}`;
    }
}

@Pipe({ name: 'schematicImg', standalone: true })
export class SchematicImgPipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        return `${environment.apiBasePath}/images/schematics/${filePath}`;
    }
}

@Pipe({ name: 'modFile', standalone: true })
export class ModFilePipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        return `${environment.apiBasePath}/files/mods/${filePath}`;
    }
}
