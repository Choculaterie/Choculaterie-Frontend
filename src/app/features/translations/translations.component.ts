import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { SearchFieldComponent } from '../../shared/components/search-field/search-field.component';
import { ToastService } from '../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SUPPORTED_LOCALES, SOURCE_LOCALE } from '../../core/i18n/locale';
import { SessionService } from '../../core/services/session.service';
import { Badge, resolveBadge } from '../../core/enums';
import ISO6391 from 'iso-639-1';

interface PlaceholderHint {
    token: string;   // what the app needs, e.g. {$PH_1}
    label: string;   // what the translator sees, e.g. "value 2"
    hint: string;
}

interface LocaleProgress {
    code: string;
    label: string;
    total: number;
    translated: number;
}

const ALL_LOCALES: { code: string; label: string }[] = ISO6391.getAllCodes()
    .map((code) => ({ code, label: `${ISO6391.getNativeName(code)} (${ISO6391.getName(code)})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

interface PageGroup {
    group: string;
    label: string;
    total: number;
    translated: number;
}

interface CatalogString {
    id: string;
    sourceText: string;
    description: string | null;
    sourceLocation: string | null;
    approved: string | null;
}

interface PendingItem {
    id: number;
    translationKeyId: string;
    locale: string;
    text: string;
    createdAt: string;
    authorName: string;
    authorMinecraftName: string | null;
    sourceText: string;
    currentApproved: string | null;
}

const PH_RE = /\{\$[A-Z0-9_]+\}|\$\{[A-Za-z0-9_.]+\}/g;
const PH_GROUP_RE = /(?:\{\$[A-Z0-9_]+\}|\$\{[A-Za-z0-9_.]+\})+/g;
const TAG_ONLY_RE = /^(?:\{\$(?:START|CLOSE)_(?:TAG|BLOCK)_[A-Z0-9_]+\})+$/;

function tokensOf(text: string): string[] {
    return [...new Set(text.match(PH_GROUP_RE) ?? [])];
}

function slugify(value: string): string {
    const last = value.split('/').filter(Boolean).pop() ?? value;
    return last.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const SAMPLES: [RegExp, string][] = [
    [/email|mail/i, 'player@example.com'],
    [/^max|maximum|limit|allowed$/i, '10'],
    [/current|used|have/i, '9'],
    [/tried|attempt|added/i, '4'],
    [/remaining|left|min|minimum/i, '1'],
    [/count|total|number|amount|size|qty|quantity|index|page/i, '3'],
    [/percent|pct/i, '75'],
    [/depend/i, 'Vanilib'],
    [/username|user name|player|author|owner|creator|user/i, 'Choculat'],
    [/version/i, '1.21.9'],
    [/date|time|day|month|year/i, '4 August 2026'],
    [/platform|loader/i, 'Fabric'],
    [/status|state|role|type|tag|category/i, 'Stable'],
    [/expires|expiry/i, '4 August 2026'],
    [/address|host|server|ip$|url|link/i, 'play.example.com'],
    [/quota|disk|gb|storage/i, '5'],
    [/length|order|deactivated|queue|^n$/i, '3'],
    [/map|world/i, 'Survival World'],
    [/^vis|visibility/i, 'Public'],
    [/file|schematic|mod|title|name/i, 'Cloud Save Manager'],
];

function sampleFor(label: string): string {
    const word = label.replace(/"/g, '');
    for (const [re, value] of SAMPLES) if (re.test(word)) return value;
    return word;
}

function countOf(text: string, needle: string): number {
    return needle ? text.split(needle).length - 1 : 0;
}

function labelFor(i: number): string {
    return i === 0 ? '"value"' : `"value ${i + 1}"`;
}

function tagLabel(group: string): string {
    const parts = [...group.matchAll(/\{\$(START|CLOSE)_(?:TAG|BLOCK)_([A-Z0-9_]+)\}/g)]
        .map((m) => `<${m[1] === 'CLOSE' ? '/' : ''}${m[2].toLowerCase()}>`);
    return parts.length ? parts.join('') : group;
}

function isValueGroup(group: string): boolean {
    return !TAG_ONLY_RE.test(group);
}

function nameFromDollar(group: string): string {
    const m = group.match(/^\$\{([A-Za-z0-9_.]+)\}$/);
    if (!m) return '';
    const last = m[1].split('.').pop() ?? '';
    const spaced = last.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return EXPANSIONS[spaced] ?? spaced;
}

function labelsOf(text: string, names: Record<string, string> = {}): { token: string; label: string }[] {
    const groups = tokensOf(text);
    const used = new Set<string>();
    let n = 0;
    return groups.map((g) => {
        if (!isValueGroup(g)) return { token: g, label: tagLabel(g) };
        const quoted = new RegExp(`["'\u201c\u201d]\\s*${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["'\u201c\u201d]`).test(text);
        const wrap = (v: string) => (quoted ? v : `"${v}"`);

        const named = names[g] || nameFromDollar(g);
        if (named && !used.has(named)) {
            used.add(named);
            return { token: g, label: wrap(named) };
        }
        const i = n++;
        return { token: g, label: wrap(i === 0 ? 'value' : `value ${i + 1}`) };
    });
}

function toDisplay(text: string | null | undefined, pairs: { token: string; label: string }[]): string {
    if (!text) return '';
    let out = text;
    for (const { token, label } of pairs) out = out.split(token).join(label);
    return out;
}

function toStorage(text: string, pairs: { token: string; label: string }[]): string {
    let out = text;
    [...pairs]
        .sort((a, b) => b.label.length - a.label.length)
        .forEach(({ token, label }) => { out = out.split(label).join(token); });
    return out;
}

const EXPANSIONS: Record<string, string> = {
    deps: 'dependencies', dep: 'dependency', ver: 'version', num: 'number',
    qty: 'quantity', msg: 'message', desc: 'description', pct: 'percent',
    img: 'image', usr: 'user', auth: 'author', cnt: 'count',
};

function describeExpr(expr: string): string {
    let inner = expr.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
    inner = inner.split('|')[0].trim();                 // drop any pipe
    inner = inner.replace(/\(.*\)$/, '');               // drop call parentheses
    const last = inner.split(/[.?]/).filter(Boolean).pop() ?? '';
    const word = last.replace(/[^A-Za-z0-9_]/g, '');
    if (!word || word.length > 24) return '';
    const spaced = word.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return EXPANSIONS[spaced] ?? spaced;
}

@Component({
    selector: 'app-translations',
    imports: [TPipe, 
        DatePipe, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
        MatSelectModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
        MatProgressBarModule, MatPaginatorModule, MatAutocompleteModule, SearchFieldComponent,
        LoadingSpinnerComponent, EmptyStateComponent,
    ],
    template: `
        <div class="page-container">
            <!-- ═══ FOCUS QUEUE ═══ -->
            @if (view() === 'focus') {
            <div class="fq">
                <div class="fq-bar">
                    <button mat-icon-button (click)="exitFocus()" [matTooltip]="'Back' | t"><img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" /></button>
                    <strong class="tr-crumb">{{ crumb() }}</strong>
                    <span class="fq-progress">{{ index() + 1 }} / {{ queue().length }}</span>
                    <span class="tr-spacer"></span>
                    <span class="fq-done">{{ translatedInQueue() }} {{ 'translated' | t }}</span>
                </div>
                <mat-progress-bar mode="determinate"
                    [value]="queue().length ? (index() + 1) / queue().length * 100 : 0" />

                @if (current(); as st) {
                <div class="fq-stage">
                    <div class="fq-box">
                        <div class="fq-box-title">{{ 'English' | t }}</div>
                        <p class="fq-source">@for (seg of segments(st.sourceText, st.id); track $index) {<span
                            [class.ph]="seg.isValue">{{ seg.text }}</span>}</p>
                        @if (example(st); as ex) {
                        <p class="fq-example">{{ ex }}</p>
                        }
                    </div>
                    @if (st.description) {
                    <p class="tr-desc">{{ st.description }}</p>
                    }

                    <div class="fq-box fq-box--target">
                        <div class="fq-box-title">{{ localeLabel() }}</div>
                        <textarea class="fq-textarea" rows="3" [ngModel]="draft(st)"
                            (ngModelChange)="setDraft(st, $event)"
                            (keydown.control.enter)="saveAndNext(st)" [readonly]="!canEdit()"
                            [placeholder]="'Type the translation here' | t"></textarea>
                    </div>

                    <div class="fq-bottom">
                        <div class="fq-ph">
                            @for (ph of placeholdersFor(st) ?? []; track ph.token) {
                            <button mat-stroked-button class="fq-ph-chip"
                                [disabled]="!canEdit() || remaining(st, ph) <= 0"
                                (mousedown)="$event.preventDefault()"
                                (click)="insert(st, ph.label)">
                                <strong>{{ ph.label }}</strong>
                            </button>
                            }
                        </div>

                        <div class="fq-actions">
                            <button mat-button (click)="prev()" [disabled]="index() === 0">{{ 'Previous' | t }}</button>
                            @if (canEdit()) {
                            <button mat-stroked-button (click)="generate(st)"
                                [disabled]="generating() === st.id">{{ (generating() === st.id ? 'Generating...' : 'Generate') | t }}</button>
                            }
                            <span [matTooltip]="problem(st) ?? ''" [matTooltipDisabled]="!problem(st)">
                                <button mat-flat-button color="primary" (click)="saveAndNext(st)"
                                    [disabled]="!canEdit() || saving() === st.id || !!problem(st)"
                                    >{{ 'Save & next' | t }}</button>
                            </span>
                            <button mat-stroked-button (click)="next()">{{ 'Skip' | t }}</button>
                        </div>
                    </div>
                </div>
                } @else {
                <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'Everything on this page is translated' | t" />
                }
            </div>

            } @else if (view() === 'languages') {
            <div class="tr-list">
                @if (!canEdit()) {
                <mat-card appearance="outlined" class="tr-notice">
                    <p>{{ 'You can browse every language and string here, but saving a translation
                        needs the Translator badge.' | t }}</p>
                    <p>{{ 'To request it, either open a' | t }}
                        <a routerLink="/faq" class="tr-link">{{ 'ticket' | t }}</a>
                        {{ 'on the contact page, send an' | t }}
                        <a routerLink="/faq" class="tr-link">{{ 'email' | t }}</a>
                        {{ 'or ask on' | t }}
                        <a routerLink="/faq" class="tr-link">{{ 'Discord' | t }}</a>.</p>
                </mat-card>
                }
                <div class="tr-row tr-head">
                    <h2 class="tr-h">{{ 'Choose a language' | t }}</h2>
                    <span class="tr-spacer"></span>
                    @if (isStaff()) {
                    <button mat-stroked-button (click)="syncCatalog()" [disabled]="syncing()"
                        [matTooltip]="'Push the strings extracted at build time into the catalog' | t">
                        <span>{{ 'Sync catalog' | t }}</span>
                    </button>
                    <button mat-stroked-button (click)="openAddLocale()">{{ 'Add a language' | t }}</button>
                    }
                </div>

                @for (l of locales(); track l.code) {
                <mat-card appearance="outlined" class="tr-nav" (click)="chooseLocale(l.code)">
                    <div class="tr-row">
                        <strong>{{ l.label }}</strong>
                        <span class="tr-loc">{{ l.code }}</span>
                        <span class="tr-spacer"></span>
                        <span class="tr-page-count tr-count-link"
                            (click)="showAllFor(l.code); $event.stopPropagation()">{{ l.translated }} / {{ l.total }} ({{ pctOf(l) }}%)</span>
                    </div>
                    <mat-progress-bar mode="determinate" [value]="barsIn() ? pctOf(l) : 0" />
                </mat-card>
                }

                @if (addingLocale()) {
                <mat-card appearance="outlined" class="tr-add">
                    <div class="tr-add-row">
                        <mat-form-field appearance="outline" class="tr-add-name">
                            <mat-label>{{ 'Language' | t }}</mat-label>
                            <input matInput [(ngModel)]="newLocaleLabel" [matAutocomplete]="auto"
                                (ngModelChange)="onLocaleNameTyped($event)" />
                            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pickSuggestion($event.option.value)">
                                @for (opt of suggestions(); track opt.code) {
                                <mat-option [value]="opt">{{ opt.label }} ({{ opt.code }})</mat-option>
                                }
                            </mat-autocomplete>
                        </mat-form-field>
                        <button mat-flat-button color="primary" (click)="addLocale()"
                            [disabled]="!newLocaleCode">{{ 'Add' | t }}</button>
                        <button mat-button (click)="addingLocale.set(false)">{{ 'Cancel' | t }}</button>
                    </div>
                </mat-card>
                }
            </div>

            } @else if (view() === 'sections') {
            <div class="tr-list">
                <div class="fq-bar">
                    <button mat-icon-button (click)="setView('languages')" [matTooltip]="'Back' | t"><img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" /></button>
                    <strong class="tr-crumb">{{ crumb() }}</strong>
                </div>
                <mat-card appearance="outlined" class="tr-nav" (click)="setView('pages')">
                    <div class="tr-row">
                        <strong>{{ 'Website' | t }}</strong>
                        <span class="tr-spacer"></span>
                        <span class="tr-page-count tr-count-link"
                            (click)="openList(null); $event.stopPropagation()">{{ currentLocale()?.translated ?? 0 }} /
                            {{ currentLocale()?.total ?? 0 }} ({{ websitePct() }}%)</span>
                    </div>
                    <mat-progress-bar mode="determinate" [value]="barsIn() ? websitePct() : 0" />
                </mat-card>
                <mat-card appearance="outlined" class="tr-nav" (click)="openMods()">
                    <div class="tr-row">
                        <strong>{{ 'Mods' | t }}</strong>
                        <span class="tr-spacer"></span>
                        <span class="tr-page-count">0 / 0 (0%)</span>
                    </div>
                    <mat-progress-bar mode="determinate" [value]="0" />
                </mat-card>
            </div>

            } @else if (view() === 'mods') {
            <div class="tr-list">
                <div class="fq-bar">
                    <button mat-icon-button (click)="setView('sections')" [matTooltip]="'Back' | t"><img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" /></button>
                    <strong class="tr-crumb">{{ crumb() }}</strong>
                </div>
                @for (m of mods(); track m.id) {
                <mat-card appearance="outlined" class="tr-nav" (click)="openMod(m.name)">
                    <div class="tr-row">
                        <strong>{{ m.name }}</strong>
                        <span class="tr-spacer"></span>
                        <span class="tr-page-count">0 / 0 (0%)</span>
                    </div>
                    <mat-progress-bar mode="determinate" [value]="0" />
                </mat-card>
                } @empty {
                <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'No mods found' | t" />
                }
            </div>

            } @else if (view() === 'mod') {
            <div class="tr-list">
                <div class="fq-bar">
                    <button mat-icon-button (click)="openMods()" [matTooltip]="'Back' | t"><img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" /></button>
                    <strong class="tr-crumb">{{ crumb() }}</strong>
                </div>
                <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'No translatable text for this mod yet' | t" [subtitle]="'Mod titles and descriptions are not in the catalog yet, so there is nothing to fill in here.' | t" />
            </div>

            } @else {
            <!-- ═══ TOOLBAR ═══ -->
            <div class="tr-toolbar">
                <button mat-icon-button (click)="goBack()" [matTooltip]="'Back' | t"><img src="/icons/arrows/arrow_left.svg" alt="" aria-hidden="true" class="mc-icon" /></button>
                <strong class="tr-crumb">{{ crumb() }}</strong>
                <span class="tr-spacer"></span>
            </div>

            @if (syncResult(); as r) { <p class="tr-sync-result">{{ r }}</p> }

            @if (loading()) {
            @for (n of [1, 2, 3, 4, 5]; track n) {
            <mat-card appearance="outlined" class="tr-page-row">
                <div class="tr-row">
                    <div class="sk-line sk-name"></div>
                    <span class="tr-spacer"></span>
                    <div class="sk-line sk-count"></div>
                </div>
                <div class="sk-line sk-bar"></div>
            </mat-card>
            }
            <app-loading-spinner />

            <!-- ═══ PAGES ═══ -->
            } @else if (view() === 'pages') {
            @if (groups().length) {
            @for (g of groups(); track g.group) {
            <mat-card appearance="outlined" class="tr-page-row tr-nav" (click)="startQueue(g)">
                <div class="tr-row">
                    <strong>{{ g.label }}</strong>
                    <span class="tr-spacer"></span>
                    <span class="tr-page-count tr-count-link"
                        (click)="openList(g); $event.stopPropagation()">{{ g.translated }} / {{ g.total }} ({{ pct(g) }}%)</span>
                </div>
                <mat-progress-bar mode="determinate" [value]="barsIn() ? pct(g) : 0" />
            </mat-card>
            }
            } @else {
            <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'No strings in the catalog. Press Sync catalog' | t" />
            }

            <!-- ═══ ALL STRINGS ═══ -->
            } @else if (view() === 'list') {
            <app-search-field [(value)]="search" (submitted)="applyListSearch()"
                [placeholder]="'Search strings...' | t" />
            @for (st of listed(); track st.id) {
            <mat-card appearance="outlined" class="tr-page-row tr-nav" (click)="openFromList(st)">
                <div class="tr-row">
                    <span class="tr-list-src">{{ display(st.sourceText, st.id) }}</span>
                    <span class="tr-spacer"></span>
                    @if (st.approved) {
                    <span class="tr-list-done">{{ display(st.approved, st.id) }}</span>
                    } @else {
                    <span class="tr-untranslated">{{ 'Not translated' | t }}</span>
                    }
                </div>
            </mat-card>
            } @empty {
            <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'No strings match' | t" />
            }
            <mat-paginator [length]="listTotal()" [pageSize]="listPageSize"
                [pageIndex]="listPage()" [pageSizeOptions]="[25, 50, 100]"
                (page)="onListPage($event)" />

            <!-- ═══ REVIEW QUEUE ═══ -->
            } @else {
            @for (it of pending(); track it.id) {
            <mat-card appearance="outlined" class="tr-card">
                <div class="tr-body">
                    <div class="tr-texts">
                        <label>{{ 'English' | t }}</label>
                        <p class="tr-source">@for (seg of segments(it.sourceText); track $index) {<span
                            [class.ph]="seg.isValue">{{ seg.text }}</span>}</p>
                        @if (it.currentApproved) {
                        <label>{{ 'Currently live' | t }}</label>
                        <p class="tr-current">{{ display(it.currentApproved) }}</p>
                        }
                        <label>{{ 'Proposed' | t }}</label>
                        <p class="tr-proposed">{{ display(it.text) }}</p>
                        <p class="tr-author">
                            <span>{{ 'by' | t }}</span> {{ it.authorName }}
                            @if (it.authorMinecraftName) { <span>({{ it.authorMinecraftName }})</span> }
                            · {{ it.createdAt | date: 'short' }}
                        </p>
                    </div>
                </div>
                <mat-card-actions class="tr-actions">
                    <button mat-flat-button color="primary" (click)="approve(it)">{{ 'Approve' | t }}</button>
                    <button mat-stroked-button (click)="reject(it)">{{ 'Reject' | t }}</button>
                </mat-card-actions>
            </mat-card>
            } @empty {
            <app-empty-state icon="/icons/ui/question_mark!.svg" [title]="'Nothing waiting for review' | t" />
            }
            }
            }
        </div>
    `,
    styles: `
        .tr-toolbar { display: flex; gap: 1rem; flex-wrap: wrap; }
        code { font-family: inherit; }
        .tr-h { margin: 0; font-size: 1.1rem; }
        .tr-head, .fq-bar, .tr-toolbar { min-height: 3.5rem; align-items: center;
                                         margin-bottom: 1.25rem; padding-top: 0; }
        .tr-crumb { font-size: 1.1rem; }
        .tr-list { padding-top: 0; }
        .tr-nav { display: flex; flex-direction: column; gap: 0; padding: 1rem;
                  margin-bottom: .5rem; cursor: pointer; }
        .tr-nav .tr-row { margin-bottom: .9rem; }
        .tr-nav:hover { border-color: var(--mat-sys-primary); }
        .tr-add { padding: 1rem 1rem 0; margin-bottom: .6rem; }
        .tr-add-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .tr-add-row button { margin-bottom: 1.25rem; }
        .tr-notice { padding: 1rem 1.25rem; margin-bottom: 1rem; }
        .tr-notice p { margin: 0 0 .35rem; font-size: .9rem; opacity: .85; }
        .tr-link { color: var(--mat-sys-primary); font-weight: 700; text-decoration: none; }
        .tr-add-name { flex: 1 1 260px; min-width: 200px; }
        .tr-add-code { flex: 0 0 150px; }
        .tr-spacer { flex: 1 1 auto; }
        .sk-line { height: 13px; border-radius: 6px; animation: shimmer 1.5s infinite;
                   background: linear-gradient(90deg, var(--mat-sys-surface-variant) 25%,
                       var(--mat-sys-surface-container-highest) 50%,
                       var(--mat-sys-surface-variant) 75%);
                   background-size: 200% 100%; }
        .sk-name { width: 30%; }
        .sk-count { width: 18%; }
        .sk-bar { width: 100%; height: 6px; margin-top: .9rem; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .tr-count-link { cursor: pointer; }
        .tr-count-link:hover { text-decoration: underline; }
        .tr-list-src { flex: 1 1 50%; min-width: 0; }
        .tr-list-done { flex: 0 1 40%; opacity: .7; text-align: right; }
        .tr-views { display: flex; gap: .25rem; }
        .tr-view-on { text-decoration: underline; font-weight: 700; }
        .tr-sync-result { padding: .5rem .75rem; border-radius: 4px; font-size: .9rem;
                          background: rgba(128,128,128,.12); }
        .tr-row { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
        .tr-page-row { padding: 1rem; margin-bottom: .5rem; }
        .tr-page-row .tr-row { margin-bottom: .9rem; }
        .tr-page-row button { flex: 0 0 auto; min-width: 9rem; }
        .tr-page-name { display: flex; flex-direction: column; }
        .tr-page-count { opacity: .7; font-size: .9rem; }
        .tr-loc { font-size: .72rem; opacity: .55; word-break: break-all; }
        .tr-card { margin-bottom: 1rem; padding: 1rem; }
        .tr-body { display: flex; gap: 1.5rem; flex-wrap: wrap; }
        .tr-context { flex: 0 0 20rem; max-width: 100%; }
        .tr-shot { width: 100%; border-radius: 6px; border: 1px solid rgba(128,128,128,.3); }
        .tr-noshot { padding: 2rem; text-align: center; opacity: .5;
                     border: 1px dashed rgba(128,128,128,.4); border-radius: 6px; }
        .tr-texts { flex: 1 1 20rem; min-width: 0; }
        .tr-texts label { display: block; font-size: .75rem; text-transform: uppercase;
                          letter-spacing: .05em; opacity: .6; margin-top: .75rem; }
        .tr-source, .tr-current, .tr-proposed { margin: .25rem 0; white-space: pre-wrap; word-break: break-word; }
        .tr-proposed { font-weight: 600; }
        .tr-current { opacity: .75; }
        .tr-desc { font-size: .85rem; opacity: .6; font-style: italic; }
        .tr-author { font-size: .8rem; opacity: .6; margin-top: .5rem; }
        .tr-actions { display: flex; gap: .5rem; padding-top: .75rem; }

        .fq { padding-top: 0; }
        .fq-bar { display: flex; gap: 1rem; flex-wrap: wrap; }
        .fq-progress { opacity: .7; }
        .fq-done { opacity: .7; font-size: .85rem; }
        .fq-stage { display: flex; flex-direction: column; padding: 1.5rem 0; min-width: 0; }
        .fq-box { position: relative; width: 100%; box-sizing: border-box; margin: 0 0 1.25rem;
                  border: 1px solid rgba(128,128,128,.45); border-radius: 8px;
                  padding: 1.25rem 1.25rem 1rem; }
        .fq-box--target { border-color: var(--mat-sys-primary, #a900a9); }
        .fq-box-title { position: absolute; top: -.7rem; left: .9rem; padding: 0 .45rem;
                        background: var(--mat-sys-surface, #14121600); font-size: .78rem;
                        text-transform: uppercase; letter-spacing: .06em; opacity: .8; }
        .fq-textarea { width: 100%; box-sizing: border-box; background: transparent; border: 0; outline: 0;
                       color: inherit; font: inherit; resize: vertical; min-height: 4.5rem; }
        .fq-shot { max-width: 100%; max-height: 22rem; border-radius: 8px;
                   border: 1px solid rgba(128,128,128,.3); }
        .fq-noshot { width: 100%; padding: 3rem 1rem; border: 1px dashed rgba(128,128,128,.4);
                     border-radius: 8px; opacity: .6; }
        .fq-noshot code { font-size: .75rem; word-break: break-all; }
        .fq-example { font-size: .78rem; opacity: .55; margin: .5rem 0 0; }
        .fq-source { font-size: 1.25rem; font-weight: 600; margin: 0 0 .35rem;
                     white-space: pre-wrap; word-break: break-word; }
        .fq-actions { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
                      margin-left: auto; }
        .fq-bottom { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .fq-ph { display: flex; gap: .5rem; flex-wrap: wrap; flex: 1 1 auto; }
        .fq-ph-help { font-size: .82rem; opacity: .75; margin-bottom: .5rem; }
        .fq-ph-chip { margin: 0 .5rem .5rem 0; display: inline-flex; gap: .5rem; align-items: center; }
        .fq-ph-expr { opacity: .6; font-size: .78rem; }
        .ph { color: var(--mat-sys-primary); font-weight: 700; }
        .fq-ph-chip strong { color: var(--mat-sys-primary); }
    `,
})
export class TranslationsComponent implements OnInit {
    private http = inject(HttpClient);
    private toast = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private session = inject(SessionService);

    readonly targetLocales = SUPPORTED_LOCALES.filter((l) => l.code !== SOURCE_LOCALE);
    locale: string = this.targetLocales[0]?.code ?? 'fr';

    readonly view = signal<'languages' | 'sections' | 'mods' | 'mod' | 'pages' | 'list' | 'queue' | 'focus'>('languages');
    readonly listed = signal<CatalogString[]>([]);
    private restoring = false;
    readonly listPage = signal(0);
    listPageSize = 25;
    readonly listTotal = signal(0);
    readonly mods = signal<{ id: string; name: string }[]>([]);
    readonly locales = signal<LocaleProgress[]>([]);
    readonly barsIn = signal(false);
    readonly addingLocale = signal(false);
    readonly suggestions = signal<{ code: string; label: string }[]>([]);
    search = '';
    untranslatedOnly = false;
    newLocaleLabel = '';
    newLocaleCode = '';
    readonly activeMod = signal<string | null>(null);
    readonly loading = signal(false);
    readonly syncing = signal(false);
    readonly syncResult = signal<string | null>(null);

    readonly groups = signal<PageGroup[]>([]);
    readonly overallTotal = signal(0);
    readonly overallTranslated = signal(0);

    readonly pending = signal<PendingItem[]>([]);
    readonly pendingTotal = signal(0);

    readonly activeGroup = signal<PageGroup | null>(null);
    readonly queue = signal<CatalogString[]>([]);
    readonly index = signal(0);
    readonly saving = signal<string | null>(null);
    readonly generating = signal<string | null>(null);
    private readonly drafts = signal<Record<string, string>>({});
    private readonly phMeta = signal<Record<string, PlaceholderHint[]>>({});

    readonly current = computed(() => this.queue()[this.index()] ?? null);
    readonly translatedInQueue = computed(() => this.queue().filter((s) => s.approved).length);
    readonly overallPct = computed(() =>
        this.overallTotal() ? Math.round((this.overallTranslated() / this.overallTotal()) * 100) : 0);

    ngOnInit(): void {
        this.loadPlaceholderMeta();
        this.loadLocales();
        this.restoring = true;
        setTimeout(() => { this.restoring = false; });

        const p = this.route.snapshot.paramMap;
        const loc = p.get('loc');
        const section = p.get('section');
        const group = p.get('group');
        const index = Number(p.get('index') ?? 0);

        if (!loc) { this.view.set('languages'); return; }
        this.locale = loc;

        if (!section) { this.view.set('sections'); return; }

        if (section === 'mods') {
            if (group) { this.activeMod.set(group); this.view.set('mod'); }
            else this.openMods();
            return;
        }

        if (!group) { this.setView('pages'); return; }

        if (group === 'all') {
            this.openList(null);
            return;
        }

        this.view.set('pages');
        this.loading.set(true);
        this.http.get<any>(`/api/Translations/groups/${this.locale}`).subscribe({
            next: (r) => {
                const groups: PageGroup[] = r.groups ?? [];
                this.groups.set(groups);
                this.overallTotal.set(r.total ?? 0);
                this.overallTranslated.set(r.translated ?? 0);
                const match = groups.find((g) => slugify(g.group) === group);
                if (match && p.get('index') === 'all') this.openList(match);
                else if (match) this.startQueue(match, index);
                else { this.view.set('pages'); this.loading.set(false); }
            },
            error: () => { this.setView('pages'); },
        });
    }

    private syncUrl(): void {
        if (this.restoring) return;
        const target = this.urlFor().join('/').replace('//', '/');
        if (this.router.url.split('?')[0] === target) return;
        this.router.navigate(this.urlFor(), { replaceUrl: true });
    }

    private urlFor(): string[] {
        const base = ['/translations'];
        const v = this.view();
        if (v === 'languages') return base;

        base.push(this.locale);
        if (v === 'sections') return base;

        base.push(v === 'mods' || v === 'mod' ? 'mods' : 'website');
        if (v === 'mods') return base;

        if (v === 'mod') { base.push(slugify(this.activeMod() ?? '')); return base; }
        if (v === 'pages' || v === 'queue') return base;

        if (v === 'list') {
            const lg = this.activeGroup();
            if (lg) base.push(slugify(lg.group));
            base.push('all');
            return base;
        }

        const g = this.activeGroup();
        if (g) { base.push(slugify(g.group)); base.push(String(this.index())); }
        return base;
    }

    private loadPlaceholderMeta(): void {
        this.http
            .get<{ keys: { id: string; placeholders: { token: string; expr: string }[] | null }[] }>(
                '/assets/i18n-messages.json')
            .subscribe({
                next: (c) => {
                    const map: Record<string, PlaceholderHint[]> = {};
                    for (const k of c.keys ?? []) {
                        if (!k.placeholders?.length) continue;
                        map[k.id] = k.placeholders.map((p, i) => ({
                            token: p.token,
                            label: labelFor(i),
                            hint: describeExpr(p.expr),
                        }));
                    }
                    this.phMeta.set(map);
                },
                error: () => this.phMeta.set({}),
            });
    }

    private names(id: string): Record<string, string> {
        const out: Record<string, string> = {};
        for (const p of this.phMeta()[id] ?? []) if (p.hint) out[p.token] = p.hint;
        return out;
    }

    placeholdersFor(st: CatalogString): PlaceholderHint[] | null {
        const pairs = labelsOf(st.sourceText, this.names(st.id));
        return pairs.length ? pairs.map((p) => ({ ...p, hint: '' })) : null;
    }

    display(text: string | null | undefined, id?: string): string {
        return toDisplay(text, labelsOf(text ?? '', id ? this.names(id) : {}));
    }

    example(st: CatalogString): string | null {
        const phs = this.placeholdersFor(st);
        if (!phs?.length) return null;
        let out = this.display(st.sourceText, st.id);
        for (const p of phs) out = out.split(p.label).join(sampleFor(p.label));
        return out;
    }

    segments(text: string | null | undefined, id?: string): { text: string; isValue: boolean }[] {
        const shown = this.display(text, id);
        const out: { text: string; isValue: boolean }[] = [];
        const re = /"[a-z0-9 ]{1,24}"/gi;
        let last = 0;
        for (const m of shown.matchAll(re)) {
            if (m.index! > last) out.push({ text: shown.slice(last, m.index), isValue: false });
            out.push({ text: m[0], isValue: true });
            last = m.index! + m[0].length;
        }
        if (last < shown.length) out.push({ text: shown.slice(last), isValue: false });
        return out;
    }

    insert(st: CatalogString, label: string): void {
        if (this.remaining(st, { token: '', label, hint: '' }) <= 0) return;
        const current = this.draft(st);
        const needsSpace = current.length > 0 && !/\s$/.test(current);
        this.setDraft(st, `${current}${needsSpace ? ' ' : ''}${label}`);
    }

    remaining(st: CatalogString, ph: PlaceholderHint): number {
        return countOf(this.display(st.sourceText, st.id), ph.label) - countOf(this.draft(st), ph.label);
    }

    isStaff(): boolean {
        return this.session.isAdminOrMod();
    }

    canEdit(): boolean {
        if (this.isStaff()) return true;
        const badges = (this.session.profile() as { badges?: { badge: number; locale?: string | null }[] } | null)?.badges ?? [];
        return badges.some((b) => b.badge === Badge.Translator && b.locale === this.locale);
    }

    currentLocale(): LocaleProgress | undefined {
        return this.locales().find((l) => l.code === this.locale);
    }

    pctOf(l: LocaleProgress): number {
        return l.total ? Math.round((l.translated / l.total) * 100) : 0;
    }

    websitePct(): number {
        const l = this.currentLocale();
        return l ? this.pctOf(l) : 0;
    }

    private loadLocales(): void {
        this.http.get<{ locales: LocaleProgress[] }>('/api/Translations/progress').subscribe({
            next: (r) => { this.locales.set(r.locales ?? []); this.growBars(); },
            error: () => this.locales.set([]),
        });
    }

    openAddLocale(): void {
        this.newLocaleLabel = '';
        this.newLocaleCode = '';
        this.suggestions.set(ALL_LOCALES.slice(0, 40));
        this.addingLocale.set(true);
    }

    onLocaleNameTyped(value: string): void {
        const q = (typeof value === 'string' ? value : '').toLowerCase().trim();
        this.suggestions.set((!q ? ALL_LOCALES
            : ALL_LOCALES.filter((l) => l.label.toLowerCase().includes(q) || l.code.toLowerCase() === q)).slice(0, 40));
    }

    pickSuggestion(opt: { code: string; label: string }): void {
        this.newLocaleLabel = ISO6391.getNativeName(opt.code) || opt.label;
        this.newLocaleCode = opt.code;
    }

    addLocale(): void {
        if (!ALL_LOCALES.some((l) => l.code === this.newLocaleCode)) {
            this.toast.error($localize`Pick a language from the list.`);
            return;
        }
        const label = typeof this.newLocaleLabel === 'string' ? this.newLocaleLabel : '';
        this.http.post('/api/Translations/admin/locales', { code: this.newLocaleCode, label }).subscribe({
            next: () => {
                this.toast.success($localize`Language added.`);
                this.addingLocale.set(false);
                this.loadLocales();
            },
            error: (e) => this.toast.error(e?.error?.error ?? $localize`Could not add that language.`),
        });
    }

    crumb(): string {
        const parts = [this.localeLabel()];
        const v = this.view();
        if (v === 'mods' || v === 'mod') parts.push($localize`Mods`);
        else if (v === 'pages' || v === 'focus' || v === 'queue' || v === 'list') parts.push($localize`Website`);
        if (v === 'list') parts.push(this.activeGroup()?.label ?? $localize`All strings`);
        if (v === 'mod') parts.push(this.activeMod() ?? '');
        if (v === 'focus') parts.push(this.activeGroup()?.label ?? '');
        return parts.filter(Boolean).join('/');
    }

    localeLabel(): string {
        return this.targetLocales.find((l) => l.code === this.locale)?.label ?? this.locale;
    }

    pct(g: PageGroup): number {
        return g.total ? Math.round((g.translated / g.total) * 100) : 0;
    }

    private growBars(): void {
        this.barsIn.set(false);
        setTimeout(() => this.barsIn.set(true), 40);
    }

    openList(g: PageGroup | null): void {
        this.activeGroup.set(g);
        this.search = '';
        this.listPage.set(0);
        this.view.set('list');
        this.syncUrl();
        this.fetchList();
    }

    goBack(): void {
        this.setView(this.view() === 'list' ? 'pages' : 'sections');
    }

    showAllFor(code: string): void {
        this.locale = code;
        this.openList(null);
    }

    applyListSearch(): void {
        this.listPage.set(0);
        this.fetchList();
    }

    onListPage(e: PageEvent): void {
        this.listPage.set(e.pageIndex);
        this.listPageSize = e.pageSize;
        this.fetchList();
    }

    private fetchList(): void {
        this.loading.set(true);
        const g = this.activeGroup();
        this.http
            .get<{ total: number; items: CatalogString[] }>(`/api/Translations/strings/${this.locale}`, {
                params: {
                    page: this.listPage() + 1,
                    pageSize: this.listPageSize,
                    ...(g ? { group: g.group } : {}),
                    ...(this.search.trim() ? { search: this.search.trim() } : {}),
                },
            })
            .subscribe({
                next: (r) => {
                    this.listed.set(r.items ?? []);
                    this.listTotal.set(r.total ?? 0);
                    this.loading.set(false);
                },
                error: () => { this.listed.set([]); this.listTotal.set(0); this.loading.set(false); },
            });
    }

    openFromList(st: CatalogString): void {
        const items = this.listed();
        const at = items.findIndex((x) => x.id === st.id);
        if (at < 0) return;

        this.queue.set(items);
        this.index.set(at);
        this.drafts.set({});
        this.view.set('focus');
        this.syncUrl();
    }

    setView(v: 'languages' | 'sections' | 'mods' | 'mod' | 'pages' | 'list' | 'queue'): void {
        this.view.set(v);
        this.growBars();
        this.syncUrl();
        this.reload();
    }

    chooseLocale(code: string): void {
        this.locale = code;
        this.setView('sections');
    }

    private modLabel(slug: string): string {
        return this.mods().find((m) => slugify(m.name) === slug)?.name ?? slug;
    }

    openMods(): void {
        this.view.set('mods');
        this.syncUrl();
        this.loading.set(true);
        this.http.get<any>('/api/Mods', { params: { page: 1, pageSize: 100 } }).subscribe({
            next: (r) => {
                const list = Array.isArray(r) ? r : (r.items ?? r.mods ?? []);
                const titles = [...new Set(list.map((m: any) => m.title).filter(Boolean))] as string[];
                titles.sort((a, b) => a.localeCompare(b));
                this.mods.set(titles.map((t) => ({ id: t, name: t })));
                this.loading.set(false);
                this.growBars();
            },
            error: () => { this.mods.set([]); this.loading.set(false); },
        });
    }

    openMod(name: string): void {
        this.activeMod.set(name);
        this.view.set('mod');
        this.syncUrl();
    }

    reload(): void {
        const v = this.view();
        if (v === 'focus' || v === 'languages' || v === 'sections' || v === 'mods' || v === 'mod') return;
        this.loading.set(true);
        const isPages = this.view() === 'pages';
        const url = isPages
            ? `/api/Translations/groups/${this.locale}`
            : '/api/Translations/admin/pending';

        this.http
            .get<any>(url, isPages ? {} : { params: { locale: this.locale, pageSize: 50 } })
            .subscribe({
                next: (r) => {
                    if (isPages) {
                        this.groups.set(r.groups ?? []);
                        this.overallTotal.set(r.total ?? 0);
                        this.overallTranslated.set(r.translated ?? 0);
                        this.growBars();
                    } else {
                        this.pending.set(r.items ?? []);
                        this.pendingTotal.set(r.total ?? 0);
                    }
                    this.loading.set(false);
                },
                error: () => {
                    this.toast.error($localize`Failed to load translations.`);
                    this.loading.set(false);
                },
            });
    }

    startQueue(g: PageGroup, startAt = 0): void {
        this.loading.set(true);
        this.activeGroup.set(g);
        this.http
            .get<{ items: CatalogString[] }>(`/api/Translations/strings/${this.locale}`, {
                params: {
                    group: g.group,
                    pageSize: 200,
                    ...(this.search.trim() ? { search: this.search.trim() } : {}),
                    ...(this.untranslatedOnly ? { untranslatedOnly: true } : {}),
                },
            })
            .subscribe({
                next: (r) => {
                    const items = r.items ?? [];
                    items.sort((a, b) => Number(!a.approved) - Number(!b.approved));
                    this.queue.set(items);
                    const done = items.filter((x) => x.approved).length;
                    const target = startAt > 0 ? startAt : Math.min(done, Math.max(items.length - 1, 0));
                    this.index.set(Math.max(target, 0));
                    this.drafts.set({});
                    this.view.set('focus');
                    this.loading.set(false);
                    this.syncUrl();
                },
                error: () => {
                    this.toast.error($localize`Failed to load this page's strings.`);
                    this.loading.set(false);
                },
            });
    }

    exitFocus(): void {
        this.view.set('pages');
        this.syncUrl();
        this.reload();
    }

    next(): void {
        if (this.index() < this.queue().length - 1) { this.index.update((i) => i + 1); this.syncUrl(); }
        else this.exitFocus();
    }

    prev(): void {
        if (this.index() > 0) { this.index.update((i) => i - 1); this.syncUrl(); }
    }

    draft(st: CatalogString): string {
        const stored = this.drafts()[st.id];
        if (stored !== undefined) return stored;
        return toDisplay(st.approved, labelsOf(st.sourceText, this.names(st.id)));
    }

    setDraft(st: CatalogString, value: string): void {
        this.drafts.update((d) => ({ ...d, [st.id]: value }));
    }

    problem(st: CatalogString): string | null {
        const shown = this.draft(st).trim();
        if (!shown) return $localize`Write a translation before saving.`;

        const phs = this.placeholdersFor(st) ?? [];

        let words = shown;
        for (const p of phs) words = words.split(p.label).join(' ');
        if (!words.trim()) return $localize`Write a translation before saving.`;

        const missing = phs.filter((p) => this.remaining(st, p) > 0);
        if (missing.length)
            return $localize`Add ${missing.map((m) => m.label).join(', ')} to your translation. It stands for real data.`;

        const extra = phs.filter((p) => this.remaining(st, p) < 0);
        if (extra.length)
            return $localize`${extra.map((m) => m.label).join(', ')} appears too many times.`;

        return null;
    }

    generate(st: CatalogString): void {
        this.generating.set(st.id);
        this.http
            .post<{ text: string; missing: string[] }>('/api/Translations/suggest',
                { keyId: st.id, locale: this.locale })
            .subscribe({
                next: (r) => {
                    this.setDraft(st, toDisplay(r.text, labelsOf(st.sourceText, this.names(st.id))));
                    this.generating.set(null);
                    if (r.missing?.length) {
                        this.toast.error($localize`The suggestion lost a value. Check it before saving.`);
                    }
                },
                error: (e) => {
                    this.toast.error(e?.error?.error ?? $localize`Could not generate a suggestion.`);
                    this.generating.set(null);
                },
            });
    }

    saveAndNext(st: CatalogString): void {
        if (this.problem(st)) return;
        const shown = this.draft(st);
        const text = toStorage(shown, labelsOf(st.sourceText, this.names(st.id)));
        if (text === (st.approved ?? '')) { this.next(); return; }

        this.saving.set(st.id);
        const staff = this.isStaff();
        const url = staff ? '/api/Translations/admin/set' : '/api/Translations/submit';
        this.http
            .post(url, { keyId: st.id, locale: this.locale, text })
            .subscribe({
                next: () => {
                    if (staff) st.approved = text.trim() ? text : null;
                    else this.toast.success($localize`Sent for review.`);
                    this.saving.set(null);
                    this.next();
                },
                error: (e) => {
                    this.toast.error(e?.error?.error ?? $localize`Failed to save translation.`);
                    this.saving.set(null);
                },
            });
    }

    approve(it: PendingItem): void {
        this.http.post(`/api/Translations/admin/${it.id}/approve`, {}).subscribe({
            next: () => { this.toast.success($localize`Translation approved.`); this.reload(); },
            error: () => this.toast.error($localize`Failed to approve.`),
        });
    }

    reject(it: PendingItem): void {
        this.http.post(`/api/Translations/admin/${it.id}/reject`, {}).subscribe({
            next: () => { this.toast.success($localize`Translation rejected.`); this.reload(); },
            error: () => this.toast.error($localize`Failed to reject.`),
        });
    }

    syncCatalog(): void {
        this.syncing.set(true);
        this.syncResult.set(null);
        this.http.get<{ keys: unknown[] }>('/assets/i18n-messages.json').subscribe({
            next: (catalog) => {
                if (!catalog?.keys?.length) {
                    this.toast.error($localize`Catalog asset is empty. Run npm run i18n:catalog and redeploy.`);
                    this.syncing.set(false);
                    return;
                }
                this.http
                    .post<{ added: number; updated: number; deactivated: number; total: number }>(
                        '/api/Translations/admin/sync-catalog', catalog)
                    .subscribe({
                        next: (r) => {
                            this.syncResult.set(
                                $localize`Synced ${r.total} strings: ${r.added} new, ${r.updated} updated, ${r.deactivated} retired.`);
                            this.syncing.set(false);
                            this.loadLocales();
                        },
                        error: () => {
                            this.toast.error($localize`Catalog sync failed.`);
                            this.syncing.set(false);
                        },
                    });
            },
            error: () => {
                this.toast.error($localize`Could not load the catalog asset.`);
                this.syncing.set(false);
            },
        });
    }

}
