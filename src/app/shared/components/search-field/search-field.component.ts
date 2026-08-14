import { Component, input, model, output } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
    selector: 'app-search-field',
    imports: [TPipe, FormsModule, MatFormFieldModule, MatInputModule],
    template: `
        <mat-form-field appearance="outline" class="filter-search">
            <mat-label>{{ 'Search' | t }}</mat-label>
            <input matInput [(ngModel)]="value" (keyup.enter)="submitted.emit(value())"
                [placeholder]="placeholder()" />
            <img matPrefix src="/icons/weapons/fishing_rod.svg" alt="" aria-hidden="true" class="mc-icon" />
        </mat-form-field>
    `,
    styles: `
        .filter-search { width: 100%; }
    `,
})
export class SearchFieldComponent {
    readonly value = model('');
    readonly placeholder = input('');
    readonly submitted = output<string>();
}
