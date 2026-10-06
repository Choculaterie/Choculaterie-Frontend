import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, firstValueFrom, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface VideoResponse {
    id: string;
    title: string;
    description: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    hasThumbnail: boolean;
    views: number;
    visibility: 'Public' | 'Unlisted' | 'Private';
    mediaBase: string;
    createdAt: string;
    updatedAt: string;
}

export interface AdminVideoResponse extends VideoResponse {
    status: 'Uploading' | 'Processing' | 'Ready' | 'Failed';
    progress: number;
    error: string | null;
    originalFileName: string;
    originalSize: number;
    uploadedBytes: number;
    hasCustomThumbnail: boolean;
}

export function videoStreamUrl(v: Pick<VideoResponse, 'mediaBase'>): string {
    return `${environment.apiBasePath}${v.mediaBase}/video.mp4`;
}

export function videoThumbnailUrl(v: Pick<VideoResponse, 'mediaBase' | 'updatedAt' | 'hasThumbnail'>): string | null {
    return v.hasThumbnail
        ? `${environment.apiBasePath}${v.mediaBase}/thumbnail/${new Date(v.updatedAt).getTime()}`
        : null;
}

export function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null) return '';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

@Injectable({ providedIn: 'root' })
export class VideosService {
    private http = inject(HttpClient);

    list(page = 1, pageSize = 24): Observable<{ items: VideoResponse[]; totalCount: number }> {
        return this.http.get<{ items: VideoResponse[]; totalCount: number }>('/api/Videos', { params: { page, pageSize } });
    }

    suggest(q: string): Observable<string[]> {
        return this.http.get<string[]>('/api/Videos/admin/suggest', { params: { q } });
    }

    get(id: string): Observable<VideoResponse> {
        return this.http.get<VideoResponse>(`/api/Videos/${encodeURIComponent(id)}`);
    }

    countView(id: string): Observable<unknown> {
        return this.http.post(`/api/Videos/${encodeURIComponent(id)}/view`, {});
    }

    update(id: string, title: string, description: string, visibility: string): Observable<AdminVideoResponse> {
        return this.http.put<AdminVideoResponse>(`/api/Videos/admin/${id}`, { title, description, visibility });
    }

    setThumbnail(id: string, image: File): Observable<AdminVideoResponse> {
        const form = new FormData();
        form.append('image', image);
        return this.http.put<AdminVideoResponse>(`/api/Videos/admin/${id}/thumbnail`, form);
    }

    removeThumbnail(id: string): Observable<AdminVideoResponse> {
        return this.http.delete<AdminVideoResponse>(`/api/Videos/admin/${id}/thumbnail`);
    }

    delete(id: string): Observable<unknown> {
        return this.http.delete(`/api/Videos/admin/${id}`);
    }

    async upload(file: File, title: string, description: string, visibility: string,
        onProgress: (sent: number, total: number) => void): Promise<AdminVideoResponse> {
        const { id, chunkSize } = await firstValueFrom(this.http.post<{ id: string; chunkSize: number }>(
            '/api/Videos/admin', { title, description, visibility, fileName: file.name, size: file.size }));

        const headers = new HttpHeaders({ 'Content-Type': 'application/octet-stream' });
        for (let offset = 0; offset < file.size; offset += chunkSize) {
            const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
            await this.withRetry(() => firstValueFrom(
                this.http.put(`/api/Videos/admin/${id}/chunk?offset=${offset}`, chunk, { headers, reportProgress: true, observe: 'events' }).pipe(
                    tap(e => { if (e.type === HttpEventType.UploadProgress) onProgress(offset + e.loaded, file.size); }),
                    filter(e => e.type === HttpEventType.Response),
                    map(() => undefined),
                )));
            onProgress(Math.min(offset + chunkSize, file.size), file.size);
        }

        return firstValueFrom(this.http.post<AdminVideoResponse>(`/api/Videos/admin/${id}/complete`, {}));
    }

    private async withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
        for (let i = 1; ; i++) {
            try {
                return await run();
            } catch (err) {
                if (i >= attempts) throw err;
                await new Promise(r => setTimeout(r, 1500 * i));
            }
        }
    }
}
