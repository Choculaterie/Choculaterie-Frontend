import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TPipe } from '../../core/i18n/t.pipe';
import { ToastService } from '../../core/services/toast.service';

export interface ContentTranslationsData {
    /** Which admin endpoint family to talk to. */
    kind: 'tag' | 'faq';
    id: number;
    /** The English text, shown as the reference to translate from. */
    question: string;
    answer?: string;
}

interface Row {
    code: string;
    label: string;
    question: string;
    answer: string;
    saving: boolean;
}

/** Tags and FAQ are database rows, not catalog strings, so they are edited here. */
@Component({
    selector: 'app-content-translations-dialog',
    standalone: true,
    imports: [
        FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
        MatButtonModule, MatProgressSpinnerModule, TPipe,
    ],
    template: `
        <h2 mat-dialog-title>{{ (data.kind === 'tag' ? 'Translate tag' : 'Translate FAQ entry') | t }}</h2>
        <mat-dialog-content>
            <div class="source">
                <div class="source-label">{{ 'English' | t }}</div>
                <div class="source-text">{{ data.question }}</div>
                @if (data.answer) { <div class="source-text source-answer">{{ data.answer }}</div> }
            </div>

            @if (loading()) {
                <div class="centred"><mat-spinner diameter="32" /></div>
            } @else if (!rows().length) {
                <p>{{ 'No languages yet. Add one from the translations tab.' | t }}</p>
            } @else {
                @for (r of rows(); track r.code) {
                    <div class="locale-block">
                        <div class="locale-name">{{ r.label }}</div>
                        <mat-form-field appearance="outline" class="full">
                            <mat-label>{{ (data.kind === 'tag' ? 'Name' : 'Question') | t }}</mat-label>
                            <input matInput [(ngModel)]="r.question"
                                   [maxlength]="data.kind === 'tag' ? 30 : 300" />
                        </mat-form-field>
                        @if (data.kind === 'faq') {
                            <mat-form-field appearance="outline" class="full">
                                <mat-label>{{ 'Answer' | t }}</mat-label>
                                <textarea matInput rows="3" maxlength="2000" [(ngModel)]="r.answer"></textarea>
                            </mat-form-field>
                        }
                        <button mat-stroked-button (click)="save(r)" [disabled]="r.saving">
                            {{ (r.saving ? 'Saving…' : 'Save') | t }}
                        </button>
                    </div>
                }
            }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>{{ 'Close' | t }}</button>
        </mat-dialog-actions>
    `,
    styles: [`
        .source { margin-bottom: 1rem; padding: .75rem; border-radius: 6px; background: rgba(128,128,128,.12); }
        .source-label { font-size: .75rem; opacity: .7; margin-bottom: .25rem; }
        .source-text { word-break: break-word; }
        .source-answer { margin-top: .35rem; opacity: .85; font-size: .9rem; }
        .locale-block { padding: .75rem 0; border-top: 1px solid rgba(128,128,128,.25); }
        .locale-name { font-weight: 600; margin-bottom: .5rem; }
        .full { width: 100%; }
        .centred { display: flex; justify-content: center; padding: 1.5rem; }
    `],
})
export class ContentTranslationsDialogComponent implements OnInit {
    private http = inject(HttpClient);
    private toast = inject(ToastService);
    readonly data = inject<ContentTranslationsData>(MAT_DIALOG_DATA);
    private ref = inject(MatDialogRef<ContentTranslationsDialogComponent>);

    readonly loading = signal(true);
    readonly rows = signal<Row[]>([]);

    private get base(): string {
        return this.data.kind === 'tag'
            ? `/api/Admin/tags/${this.data.id}/translations`
            : `/api/Admin/faq/${this.data.id}/translations`;
    }

    ngOnInit(): void {
        this.http.get<{ code: string; label: string }[]>('/api/Translations/locales').subscribe({
            next: (locales) => {
                this.http.get<{ locale: string; name?: string; question?: string; answer?: string }[]>(this.base)
                    .subscribe({
                        next: (existing) => {
                            const by = new Map(existing.map((e) => [e.locale, e]));
                            this.rows.set(locales
                                .filter((l) => l.code !== 'en')
                                .map((l) => {
                                    const e = by.get(l.code);
                                    return {
                                        code: l.code,
                                        label: l.label,
                                        question: (this.data.kind === 'tag' ? e?.name : e?.question) ?? '',
                                        answer: e?.answer ?? '',
                                        saving: false,
                                    };
                                }));
                            this.loading.set(false);
                        },
                        error: () => this.loading.set(false),
                    });
            },
            error: () => this.loading.set(false),
        });
    }

    save(row: Row): void {
        row.saving = true;
        const body = this.data.kind === 'tag'
            ? { locale: row.code, name: row.question }
            : { locale: row.code, question: row.question, answer: row.answer };

        this.http.put(this.base, body).subscribe({
            next: () => {
                row.saving = false;
                this.toast.success('Translation saved.');
                this.ref.disableClose = false;
            },
            error: (e) => {
                row.saving = false;
                this.toast.error(e?.error?.message ?? 'Failed to save translation.');
            },
        });
    }
}
