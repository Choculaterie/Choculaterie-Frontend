import { Component, input, inject, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { SchematicListItemResponse } from '../../../api/generated.schemas';
import { UserLinkComponent } from '../user-link/user-link.component';
import { SchematicImgPipe } from '../../pipes/image-url.pipe';
import { NumberFormatPipe } from '../../pipes/number-format.pipe';

@Component({
    selector: 'app-schematic-card',
    standalone: true,
    imports: [
        RouterLink,
        DatePipe,
        MatCardModule,
        MatIconModule,
        MatChipsModule,
        MatButtonModule,
        MatTooltipModule,
        UserLinkComponent,
        SchematicImgPipe,
        NumberFormatPipe,
    ],
    templateUrl: './schematic-card.component.html',
    styleUrl: './schematic-card.component.scss',
})
export class SchematicCardComponent {
    schematic = input.required<SchematicListItemResponse>();
    private router = inject(Router);

    private readonly maxTags = 3;
    visibleTags = computed(() => this.schematic().tags.slice(0, this.maxTags));
    hasOverflowTags = computed(() => this.schematic().tags.length > this.maxTags);

    onTagClick(event: Event, tag: string): void {
        event.stopPropagation();
        event.preventDefault();
        this.router.navigate(['/schematics'], { queryParams: { tag } });
    }

    onTypeClick(event: Event): void {
        event.stopPropagation();
        event.preventDefault();
        this.router.navigate(['/schematics'], { queryParams: { type: this.schematic().schematicType } });
    }
}
