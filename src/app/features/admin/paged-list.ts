import { HttpClient, HttpParams } from '@angular/common/http';
import { WritableSignal, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
}

export class PagedList<T> {
    readonly total = signal(0);
    readonly pageIndex = signal(0);
    readonly pageSize = signal(25);
    readonly search = signal('');

    constructor(
        private http: HttpClient,
        private url: string,
        readonly items: WritableSignal<T[]>,
        readonly loading: WritableSignal<boolean>,
        private extraParams: () => Record<string, string> = () => ({}),
        private onLoaded: () => void = () => { },
    ) { }

    load(): void {
        this.loading.set(true);
        let params = new HttpParams().set('page', this.pageIndex() + 1).set('pageSize', this.pageSize());
        const q = this.search().trim();
        if (q) params = params.set('search', q);
        for (const [k, v] of Object.entries(this.extraParams())) if (v) params = params.set(k, v);
        this.http.get<PagedResult<T>>(this.url, { params }).subscribe({
            next: (r) => {
                this.items.set(r.items);
                this.total.set(r.totalCount);
                this.loading.set(false);
                this.onLoaded();
            },
            error: () => this.loading.set(false),
        });
    }

    onPage(e: PageEvent): void {
        if (e.pageSize !== this.pageSize()) {
            this.pageSize.set(e.pageSize);
            this.pageIndex.set(0);
        } else {
            this.pageIndex.set(e.pageIndex);
        }
        this.load();
    }

    runSearch(): void {
        const q = this.search().trim();
        if (q.length === 1) return;
        this.reload();
    }

    reload(): void {
        this.pageIndex.set(0);
        this.load();
    }
}
