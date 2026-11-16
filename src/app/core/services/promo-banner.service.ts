import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PromoBannerService {
    readonly version = signal(0);

    refresh(): void {
        this.version.update(v => v + 1);
    }
}
