import { Injectable, effect } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { translateText } from './translation.store';
import { PAGINATOR } from '../../i18n/labels';

/**
 * Material builds the paginator labels in TypeScript, so they never pass through the
 * `t` pipe and stayed English. Reading translateText inside an effect re-runs this on
 * a language change, and `changes` is what tells live paginators to repaint.
 */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
    constructor() {
        super();
        effect(() => {
            this.itemsPerPageLabel = translateText(PAGINATOR.itemsPerPage);
            this.nextPageLabel = translateText(PAGINATOR.nextPage);
            this.previousPageLabel = translateText(PAGINATOR.previousPage);
            this.firstPageLabel = translateText(PAGINATOR.firstPage);
            this.lastPageLabel = translateText(PAGINATOR.lastPage);
            this.changes.next();
        });
    }

    override getRangeLabel = (page: number, pageSize: number, length: number): string => {
        const total = Math.max(1, Math.ceil(length / pageSize));
        return translateText(PAGINATOR.range)
            .replace('${page}', String(page + 1))
            .replace('${total}', String(total));
    };
}
