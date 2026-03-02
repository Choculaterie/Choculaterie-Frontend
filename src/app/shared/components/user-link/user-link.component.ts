import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-user-link',
    standalone: true,
    imports: [RouterLink],
    template: `<a [routerLink]="['/users', username()]" class="user-link" (click)="$event.stopPropagation()">{{ username() }}</a>`,
    styles: [`
        .user-link {
            color: var(--mat-sys-primary);
            text-decoration: none;
            font-weight: 500;
            &:hover { text-decoration: underline; }
        }
    `],
})
export class UserLinkComponent {
    username = input.required<string>();
}
