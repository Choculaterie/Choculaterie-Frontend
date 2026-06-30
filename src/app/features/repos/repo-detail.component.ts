import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { GitReposService } from '../../api/git-repos';
import type { GitRepoDetailResponse, GitReleaseResponse, GitCommitResponse } from '../../api/generated.schemas';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { CreateReleaseDialogComponent, CreateReleaseDialogData } from '../../shared/components/create-release-dialog/create-release-dialog.component';
import { LitematicViewerComponent, type LitematicViewerData } from '../../shared/components/litematic-viewer/litematic-viewer.component';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
    selector: 'app-repo-detail',
    standalone: true,
    imports: [
        RouterLink, DatePipe, MatTabsModule, MatButtonModule,
        MatFormFieldModule, MatSelectModule, MatPaginatorModule, MatTooltipModule, FormsModule,
        LoadingSpinnerComponent, EmptyStateComponent,
    ],
    templateUrl: './repo-detail.component.html',
    styleUrl: './repo-detail.component.scss',
})
export class RepoDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private gitReposApi = inject(GitReposService);
    private dialog = inject(MatDialog);
    private session = inject(SessionService);
    private toast = inject(ToastService);

    readonly loading = signal(true);
    readonly notFound = signal(false);
    readonly repo = signal<GitRepoDetailResponse | null>(null);

    isOwner(): boolean {
        return this.session.user()?.username === this.repo()?.ownerUsername;
    }

    // Releases
    readonly releases = signal<GitReleaseResponse[]>([]);
    readonly loadingReleases = signal(true);

    // Commits
    readonly selectedBranch = signal('');
    readonly commits = signal<GitCommitResponse[]>([]);
    readonly loadingCommits = signal(true);
    readonly commitsPage = signal(0);
    readonly commitsPageSize = signal(20);
    readonly commitsTotalCount = signal(0);

    ngOnInit(): void {
        const repoId = this.route.snapshot.paramMap.get('repoId')!;
        this.loadRepo(repoId);
        this.loadReleases(repoId);
    }

    private loadRepo(repoId: string): void {
        this.loading.set(true);
        this.gitReposApi.getApiGitReposRepoId(repoId).subscribe({
            next: (res) => {
                this.repo.set(res);
                this.selectedBranch.set(res.defaultBranchName);
                this.loading.set(false);
                this.loadCommits(repoId);
            },
            error: () => { this.loading.set(false); this.notFound.set(true); },
        });
    }

    private loadReleases(repoId: string): void {
        this.loadingReleases.set(true);
        this.gitReposApi.getApiGitReposRepoIdReleases(repoId, { page: 1, pageSize: 48 }).subscribe({
            next: (res) => { this.releases.set(res.items); this.loadingReleases.set(false); },
            error: () => this.loadingReleases.set(false),
        });
    }

    onBranchChange(branch: string): void {
        this.selectedBranch.set(branch);
        this.commitsPage.set(0);
        this.loadCommits(this.repo()!.id);
    }

    private loadCommits(repoId: string): void {
        this.loadingCommits.set(true);
        this.gitReposApi.getApiGitReposRepoIdBranchesBranchNameCommits(repoId, this.selectedBranch(), {
            page: this.commitsPage() + 1, pageSize: this.commitsPageSize(),
        }).subscribe({
            next: (res) => {
                this.commits.set(res.commits);
                this.commitsTotalCount.set(res.totalCount as any);
                this.loadingCommits.set(false);
            },
            error: () => this.loadingCommits.set(false),
        });
    }

    onCommitsPageChange(event: PageEvent): void {
        if (event.pageSize !== this.commitsPageSize()) this.commitsPageSize.set(event.pageSize);
        this.commitsPage.set(event.pageIndex);
        this.loadCommits(this.repo()!.id);
    }

    /** Opens the 3D viewer for a commit, diffed against its parent (GitHub-style green/red tint). */
    viewCommitIn3D(commit: GitCommitResponse): void {
        this.gitReposApi.getApiGitReposCommitsCommitIdDownload<Blob>(commit.id, { responseType: 'blob' } as any).subscribe({
            next: (newBlob) => {
                newBlob.arrayBuffer().then((newBuffer) => {
                    if (!commit.parentCommitId) {
                        this.openDiffViewer(commit, newBuffer, null);
                        return;
                    }
                    this.gitReposApi.getApiGitReposCommitsCommitIdDownload<Blob>(commit.parentCommitId, { responseType: 'blob' } as any).subscribe({
                        next: (oldBlob) => oldBlob.arrayBuffer().then((oldBuffer) => this.openDiffViewer(commit, newBuffer, oldBuffer)),
                        // Parent fetch failed (e.g. deleted) - still show the commit, just without a diff baseline.
                        error: () => this.openDiffViewer(commit, newBuffer, undefined),
                    });
                });
            },
            error: (err) => this.toast.error(err.error?.message ?? 'Failed to load commit for 3D viewer.'),
        });
    }

    private openDiffViewer(commit: GitCommitResponse, newBuffer: ArrayBuffer, parentBuffer: ArrayBuffer | null | undefined): void {
        this.dialog.open(LitematicViewerComponent, {
            data: {
                fileData: newBuffer,
                fileName: `${commit.message} (${commit.id.slice(0, 8)}).litematic`,
                parentFileData: parentBuffer,
            } as LitematicViewerData,
            width: '90vw',
            maxWidth: '1200px',
            panelClass: 'litematic-viewer-dialog',
        });
    }

    openCreateReleaseDialog(): void {
        const repo = this.repo();
        if (!repo) return;
        const dialogRef = this.dialog.open(CreateReleaseDialogComponent, {
            data: { repoId: repo.id, branches: repo.branches, defaultBranch: repo.defaultBranchName } as CreateReleaseDialogData,
            width: '480px',
        });
        dialogRef.afterClosed().subscribe((created: boolean) => {
            if (created) {
                this.toast.success('Release published!');
                this.loadReleases(repo.id);
            }
        });
    }
}
