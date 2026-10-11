import { Component, input, model, output } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-search-field',
    imports: [MatIconModule, TPipe, FormsModule, MatFormFieldModule, MatInputModule],
    template: `
        <mat-form-field appearance="outline" class="filter-search">
            <mat-label>{{ 'Search' | t }}</mat-label>
            <input matInput [(ngModel)]="value" (keyup.enter)="submitted.emit(value())"
                [placeholder]="placeholder()" />
            <mat-icon svgIcon="mc:ui/magnifying_glass" matPrefix></mat-icon>
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
