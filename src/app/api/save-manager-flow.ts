import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SaveManagerFlowInfo {
    flowId: string;
    clientIdentifier: string;
    expiresAt: string;
}

export interface SaveManagerApproveResponse {
    saveKey: string;
    isMinecraftLinked: boolean;
    /** Only present when Minecraft is not yet linked at approval time */
    linkCode?: string | null;
    linkCodeExpiresAt?: string | null;
    instructions?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SaveManagerFlowService {
    private http = inject(HttpClient);

    getFlow(flowId: string): Observable<SaveManagerFlowInfo> {
        return this.http.get<SaveManagerFlowInfo>(`/api/SaveManager/flow/${flowId}`);
    }

    approve(flowId: string): Observable<SaveManagerApproveResponse> {
        return this.http.post<SaveManagerApproveResponse>(`/api/SaveManager/flow/${flowId}/approve`, null);
    }

    cancel(flowId: string): Observable<void> {
        return this.http.post<void>(`/api/SaveManager/flow/${flowId}/cancel`, null);
    }
}
