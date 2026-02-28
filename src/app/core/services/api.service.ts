import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class ApiService {
    private baseUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    get<T>(path: string, params?: HttpParams): Observable<T> {
        return this.http.get<T>(`${this.baseUrl}/${path}`, { params });
    }

    post<T>(path: string, body: object = {}): Observable<T> {
        return this.http.post<T>(`${this.baseUrl}/${path}`, body);
    }

    put<T>(path: string, body: object = {}): Observable<T> {
        return this.http.put<T>(`${this.baseUrl}/${path}`, body);
    }

    patch<T>(path: string, body: object = {}): Observable<T> {
        return this.http.patch<T>(`${this.baseUrl}/${path}`, body);
    }

    delete<T>(path: string): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}/${path}`);
    }
}
