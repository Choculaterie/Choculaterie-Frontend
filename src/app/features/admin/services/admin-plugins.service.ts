import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminPlugin {
    id: string;
    name: string;
    version: string;
    homepage: string;
    kind: string;
    hosts: string[];
    size: number;
    file: string;
}

export interface PluginUploadResult {
    accepted: AdminPlugin[];
    rejected: { file: string; error: string }[];
}

@Injectable({ providedIn: 'root' })
export class AdminPluginsService {
    private http = inject(HttpClient);
    private base = `${environment.apiBasePath}/api/Plugins`;

    list(): Observable<AdminPlugin[]> {
        return this.http.get<AdminPlugin[]>(this.base);
    }

    upload(files: File[]): Observable<PluginUploadResult> {
        const form = new FormData();
        for (const file of files) {
            form.append('files', file, file.name);
        }
        return this.http.post<PluginUploadResult>(this.base, form);
    }

    remove(id: string): Observable<void> {
        return this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`);
    }

    restore(id: string): Observable<AdminPlugin> {
        return this.http.post<AdminPlugin>(`${this.base}/${encodeURIComponent(id)}/restore`, {});
    }
}
