import { Component, signal, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { TagsService } from '../../../api/tags';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-tag-suggest-dialog',
    standalone: true,
    imports: [TPipe, 
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        ReactiveFormsModule,
    ],
    template: `
        <h2 mat-dialog-title>{{ 'Propose a new tag' | t }}</h2>
        <mat-dialog-content>
            <p class="dialog-hint">{{ 'Suggest a tag you\'d like to see added. An admin will review it before it becomes available.' | t }}</p>
            <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'Tag name' | t }}</mat-label>
                <input matInput [formControl]="nameCtrl" placeholder="e.g. oak log"
                    (keydown.enter)="submit()" autocomplete="off" maxlength="30" />
                <mat-hint>{{ 'Lowercase letters, numbers, spaces, hyphens and underscores only' | t }}</mat-hint>
                @if (nameCtrl.hasError('pattern')) {
                <mat-error>{{ 'Only lowercase letters, numbers, spaces, hyphens and underscores are allowed' | t }}</mat-error>
                }
            </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>{{ 'Cancel' | t }}</button>
            <button mat-flat-button [disabled]="nameCtrl.invalid || submitting()" (click)="submit()">{{ 'Submit' | t }}</button>
        </mat-dialog-actions>
    `,
    styles: [`
        .full-width { width: 100%; margin-top: 0.25rem; }
        .dialog-hint { font-size: 0.88rem; margin: 0 0 1rem; opacity: 0.75; line-height: 1.4; }
        mat-dialog-content { max-height: none !important; overflow: visible !important; }
    `],
})
export class TagSuggestDialogComponent {
    private tagsApi = inject(TagsService);
    private toast = inject(ToastService);
    private dialogRef = inject(MatDialogRef<TagSuggestDialogComponent>);

    readonly nameCtrl = new FormControl('', [
        Validators.required,
        Validators.maxLength(30),
        Validators.pattern(/^[a-z0-9 _-]+$/),
    ]);
    readonly submitting = signal(false);

    submit(): void {
        if (this.nameCtrl.invalid || this.submitting()) return;
        this.submitting.set(true);
        this.tagsApi.postApiTagsSuggest({ name: this.nameCtrl.value! }).subscribe({
            next: () => {
                this.toast.success('Tag suggestion submitted!');
                this.dialogRef.close(true);
            },
            error: (err) => {
                this.toast.error(err.error?.detail ?? 'Failed to submit suggestion.');
                this.submitting.set(false);
            },
        });
    }
}
