import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { GitReposService } from '../../../api/git-repos';
import type { GitBranchResponse, GitCommitResponse } from '../../../api/generated.schemas';
import { ToastService } from '../../../core/services/toast.service';

export interface CreateReleaseDialogData {
    repoId: string;
    branches: GitBranchResponse[];
    defaultBranch: string;
}

@Component({
    selector: 'app-create-release-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, FormsModule],
    template: `
        <h2 mat-dialog-title>Create release</h2>
        <mat-dialog-content style="display: flex; flex-direction: column; gap: 0.75rem; min-width: 360px;">
            <mat-form-field appearance="outline">
                <mat-label>Branch</mat-label>
                <mat-select [(ngModel)]="selectedBranch" (selectionChange)="onBranchChange($event.value)" [disabled]="submitting()">
                    @for (b of data.branches; track b.name) {
                    <mat-option [value]="b.name">{{ b.name }}</mat-option>
                    }
                </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
                <mat-label>Commit</mat-label>
                <mat-select [(ngModel)]="selectedCommitId" [disabled]="submitting() || loadingCommits()">
                    @for (c of commits(); track c.id) {
                    <mat-option [value]="c.id">{{ c.message }} ({{ c.id.slice(0, 8) }})</mat-option>
                    }
                </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
                <mat-label>Tag name</mat-label>
                <input matInput [(ngModel)]="tagName" placeholder="v1.0" [disabled]="submitting()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
                <mat-label>Name (optional)</mat-label>
                <input matInput [(ngModel)]="name" [disabled]="submitting()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
                <mat-label>Description (optional)</mat-label>
                <textarea matInput rows="3" [(ngModel)]="description" [disabled]="submitting()"></textarea>
            </mat-form-field>

            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem;">
                Thumbnail (required)
                <input type="file" accept="image/png,image/jpeg,image/webp" (change)="onThumbnailSelected($event)" [disabled]="submitting()" />
            </label>

            @if (error()) {
            <p style="color: var(--mat-sys-error); font-size: 0.85rem;">{{ error() }}</p>
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-stroked-button [mat-dialog-close]="false" [disabled]="submitting()">Cancel</button>
            <button mat-flat-button (click)="submit()" [disabled]="!canSubmit() || submitting()">
                @if (submitting()) { <img src="loading.gif" alt="" class="btn-loading-gif" /> } @else { Publish }
            </button>
        </mat-dialog-actions>
    `,
})
export class CreateReleaseDialogComponent {
    private gitReposApi = inject(GitReposService);
    private toast = inject(ToastService);
    data = inject<CreateReleaseDialogData>(MAT_DIALOG_DATA);
    private dialogRef = inject(MatDialogRef<CreateReleaseDialogComponent>);

    selectedBranch = this.data.defaultBranch;
    selectedCommitId = '';
    tagName = '';
    name = '';
    description = '';

    readonly commits = signal<GitCommitResponse[]>([]);
    readonly loadingCommits = signal(true);
    readonly submitting = signal(false);
    readonly error = signal<string | null>(null);
    private thumbnailFile: File | null = null;

    constructor() {
        this.loadCommits(this.selectedBranch);
    }

    canSubmit(): boolean {
        return !!this.tagName.trim() && !!this.selectedCommitId && !!this.thumbnailFile;
    }

    onBranchChange(branch: string): void {
        this.selectedBranch = branch;
        this.loadCommits(branch);
    }

    onThumbnailSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.thumbnailFile = input.files?.[0] ?? null;
    }

    private loadCommits(branch: string): void {
        this.loadingCommits.set(true);
        this.gitReposApi.getApiGitReposRepoIdBranchesBranchNameCommits(this.data.repoId, branch, { page: 1, pageSize: 20 }).subscribe({
            next: (res) => {
                this.commits.set(res.commits);
                this.selectedCommitId = res.commits[0]?.id ?? '';
                this.loadingCommits.set(false);
            },
            error: () => this.loadingCommits.set(false),
        });
    }

    submit(): void {
        if (!this.canSubmit()) return;
        this.submitting.set(true);
        this.error.set(null);
        this.gitReposApi.postApiGitReposRepoIdReleases(this.data.repoId, {
            CommitId: this.selectedCommitId,
            TagName: this.tagName.trim(),
            Name: this.name.trim() || undefined,
            Description: this.description.trim() || undefined,
            Thumbnail: this.thumbnailFile!,
        } as any).subscribe({
            next: () => {
                this.submitting.set(false);
                this.dialogRef.close(true);
            },
            error: (err) => {
                this.submitting.set(false);
                this.error.set(err.error?.message ?? 'Failed to create release.');
                this.toast.error(err.error?.message ?? 'Failed to create release.');
            },
        });
    }
}
