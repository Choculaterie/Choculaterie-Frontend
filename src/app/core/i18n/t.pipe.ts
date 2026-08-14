import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, effect, inject } from '@angular/core';
import { TranslationStore } from './translation.store';

@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform, OnDestroy {
    private store = inject(TranslationStore);
    private cdr = inject(ChangeDetectorRef);

    private lastKey: string | null = null;
    private lastLocale = '';
    private lastValue = '';

    private readonly watcher = effect(() => {
        this.store.locale();
        this.store.revision();
        this.lastKey = null;
        this.cdr.markForCheck();
    });

    transform(text: string): string {
        if (text === this.lastKey && this.store.locale() === this.lastLocale) return this.lastValue;

        this.lastKey = text;
        this.lastLocale = this.store.locale();
        this.lastValue = this.store.translate(text);
        return this.lastValue;
    }

    ngOnDestroy(): void {
        this.watcher.destroy();
    }
}
