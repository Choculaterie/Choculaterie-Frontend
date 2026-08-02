import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

export function encodePathSegments(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
}

export function schematicImageUrl(filePath: string | null | undefined): string {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    return `${environment.apiBasePath}/images/schematics/${encodePathSegments(filePath)}`;
}

@Pipe({ name: 'userImg', standalone: true })
export class UserImgPipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        return `${environment.apiBasePath}/images/users/${encodePathSegments(filePath)}`;
    }
}

@Pipe({ name: 'schematicImg', standalone: true })
export class SchematicImgPipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        return schematicImageUrl(filePath);
    }
}

@Pipe({ name: 'modFile', standalone: true })
export class ModFilePipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        return `${environment.apiBasePath}/files/mods/${encodePathSegments(filePath)}`;
    }
}

@Pipe({ name: 'ticketImg', standalone: true })
export class TicketImgPipe implements PipeTransform {
    transform(filePath: string | null | undefined): string {
        if (!filePath) return '';
        if (filePath.startsWith('http')) return filePath;
        return `${environment.apiBasePath}/images/tickets/${encodePathSegments(filePath)}`;
    }
}
