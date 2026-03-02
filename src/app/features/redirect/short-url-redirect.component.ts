import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ShortUrlService } from '../../api/short-url';

@Component({
    selector: 'app-short-url-redirect',
    standalone: true,
    imports: [MatProgressSpinnerModule],
    template: `
    <div class="redirect-page">
        <mat-spinner diameter="48" />
        <p>Redirecting…</p>
    </div>
    `,
    styles: [`
        .redirect-page {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 60vh; gap: 1rem;
            color: var(--mat-sys-on-surface-variant);
        }
    `],
})
export class ShortUrlRedirectComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private shortUrlApi = inject(ShortUrlService);

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id')!;
        this.shortUrlApi.getQsId(id).subscribe({
            next: (res: any) => {
                if (res?.longUrl) {
                    // If it's an internal URL, use router; otherwise open externally
                    try {
                        const url = new URL(res.longUrl);
                        if (url.origin === window.location.origin) {
                            this.router.navigateByUrl(url.pathname + url.search + url.hash);
                        } else {
                            window.location.href = res.longUrl;
                        }
                    } catch {
                        window.location.href = res.longUrl;
                    }
                } else {
                    this.router.navigate(['/not-found']);
                }
            },
            error: () => this.router.navigate(['/not-found']),
        });
    }
}
