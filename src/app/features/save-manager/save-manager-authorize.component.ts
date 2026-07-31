import { Component, OnInit, inject, signal, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import {
    SaveManagerFlowService,
    type SaveManagerFlowInfo,
    type SaveManagerApproveResponse,
} from '../../api/save-manager-flow';

type PageState = 'loading' | 'pending' | 'approved' | 'cancelled' | 'expired' | 'error';

@Component({
    selector: 'app-save-manager-authorize',
    standalone: true,
    imports: [
        DatePipe,
        RouterLink,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
    ],
    templateUrl: './save-manager-authorize.component.html',
    styleUrl: './save-manager-authorize.component.scss',
})
export class SaveManagerAuthorizeComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private flowApi = inject(SaveManagerFlowService);
    private session = inject(SessionService);
    private toast = inject(ToastService);
    private el = inject(ElementRef);

    readonly state = signal<PageState>('loading');
    readonly flow = signal<SaveManagerFlowInfo | null>(null);
    readonly approveResult = signal<SaveManagerApproveResponse | null>(null);
    readonly errorMsg = signal('');
    readonly actionLoading = signal(false);
    readonly copiedKey = signal(false);
    readonly copiedCode = signal(false);
    readonly showManualKey = signal(false);
    private keyPositionLocked = false;

    private flowId!: string;

    ngOnInit(): void {
        this.flowId = this.route.snapshot.paramMap.get('flowId')!;

        this.flowApi.getFlow(this.flowId).subscribe({
            next: (info) => {
                const expiresAt = new Date(info.expiresAt);
                if (expiresAt < new Date()) {
                    this.state.set('expired');
                    return;
                }
                this.flow.set(info);
                this.state.set('pending');
            },
            error: (err) => {
                if (err.status === 404) {
                    this.state.set('expired');
                } else {
                    this.errorMsg.set(err.error?.detail ?? err.error?.message ?? 'Failed to load authorization request.');
                    this.state.set('error');
                }
            },
        });
    }

    approve(): void {
        this.actionLoading.set(true);
        this.flowApi.approve(this.flowId).subscribe({
            next: (res) => {
                this.approveResult.set(res);
                this.state.set('approved');
                this.actionLoading.set(false);
            },
            error: (err) => {
                this.actionLoading.set(false);
                this.toast.error(err.error?.detail ?? err.error?.message ?? 'Failed to approve. The request may have expired.');
            },
        });
    }

    cancel(): void {
        this.actionLoading.set(true);
        this.flowApi.cancel(this.flowId).subscribe({
            next: () => {
                this.state.set('cancelled');
                this.actionLoading.set(false);
            },
            error: () => {
                // Even if backend errors, treat as cancelled from user perspective
                this.state.set('cancelled');
                this.actionLoading.set(false);
            },
        });
    }

    toggleManualKey(): void {
        if (!this.keyPositionLocked && !this.showManualKey()) {
            const page = this.el.nativeElement.querySelector('.authorize-page') as HTMLElement;
            if (page) {
                page.style.marginTop = getComputedStyle(page).marginTop;
                page.style.marginBottom = '2rem';
            }
            this.keyPositionLocked = true;
        }
        this.showManualKey.update(v => !v);
    }

    copyKey(): void {
        const key = this.approveResult()?.saveKey;
        if (!key) return;
        navigator.clipboard.writeText(key).then(() => {
            this.copiedKey.set(true);
            setTimeout(() => this.copiedKey.set(false), 2000);
        });
    }

    copyCode(): void {
        const code = this.approveResult()?.linkCode;
        if (!code) return;
        navigator.clipboard.writeText(code).then(() => {
            this.copiedCode.set(true);
            setTimeout(() => this.copiedCode.set(false), 2000);
        });
    }

    get username(): string {
        return this.session.profile()?.username ?? this.session.user()?.username ?? '';
    }
}
