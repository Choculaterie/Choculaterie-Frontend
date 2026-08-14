import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
    selector: 'app-i18n-harness',
    template: `
        <div class="harness">
            <h1>i18n context harness</h1>
            <p>Used by tools/i18n-context-shots.mjs. Nothing to see here.</p>
        </div>
    `,
    styles: `
        .harness { padding: 4rem 2rem; opacity: .5; }
    `,
})
export class I18nHarnessComponent implements OnInit, OnDestroy {
    private toast = inject(ToastService);

    ngOnInit(): void {
        const w = window as unknown as Record<string, unknown>;
        w['__i18nShow'] = (text: string, kind: 'success' | 'error' | 'info' = 'info') => {
            if (kind === 'error') this.toast.error(text, 60_000);
            else if (kind === 'success') this.toast.success(text, { duration: 60_000 });
            else this.toast.info(text, 60_000);
            return true;
        };
        w['__i18nReady'] = true;
    }

    ngOnDestroy(): void {
        const w = window as unknown as Record<string, unknown>;
        delete w['__i18nShow'];
        delete w['__i18nReady'];
    }
}
