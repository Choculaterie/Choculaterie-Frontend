import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { debounceTime, Subject, switchMap, of } from 'rxjs';
import { UserBrowseService } from '../../api/user-browse';
import type { UserListItemResponse } from '../../api/generated.schemas';
import { UserCardComponent } from '../../shared/components/user-card/user-card.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
    selector: 'app-user-browse',
    standalone: true,
    imports: [
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatIconModule,
        MatPaginatorModule,
        MatAutocompleteModule,
        UserCardComponent,
        LoadingSpinnerComponent,
        EmptyStateComponent,
    ],
    templateUrl: './user-browse.component.html',
    styleUrl: './user-browse.component.scss',
})
export class UserBrowseComponent implements OnInit {
    private userBrowseApi = inject(UserBrowseService);

    readonly users = signal<UserListItemResponse[]>([]);
    readonly totalCount = signal(0);
    readonly currentPage = signal(1);
    readonly pageSize = signal(20);
    readonly loading = signal(true);

    readonly userSuggestions = signal<string[]>([]);
    private searchInput$ = new Subject<string>();

    search = '';
    sort = 'username';
    direction = 'asc';

    ngOnInit(): void {
        this.searchInput$.pipe(
            debounceTime(300),
            switchMap(q => q.length >= 2
                ? this.userBrowseApi.getApiUserBrowseSearch({ q })
                : of([]))
        ).subscribe(results => this.userSuggestions.set(results as string[]));

        this.loadPage(1);
    }

    onSearchInput(query: string): void {
        this.searchInput$.next(query);
    }

    loadPage(page: number): void {
        this.loading.set(true);
        this.currentPage.set(page);
        this.userBrowseApi.getApiUserBrowse({
            page,
            search: this.search || undefined,
            sort: this.sort || undefined,
            direction: this.direction || undefined,
        }).subscribe({
            next: (res) => {
                this.users.set(res.items);
                this.totalCount.set(res.totalCount as any);
                this.pageSize.set(res.pageSize as any);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    onPageChange(event: PageEvent): void {
        this.loadPage(event.pageIndex + 1);
    }

    toggleDirection(): void {
        this.direction = this.direction === 'asc' ? 'desc' : 'asc';
        this.loadPage(1);
    }
}
