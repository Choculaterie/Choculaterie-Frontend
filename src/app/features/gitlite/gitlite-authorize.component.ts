import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import {
    SaveManagerFlowService,
    type SaveManagerFlowInfo,
    type SaveManagerApproveResponse,
} from '../../api/save-manager-flow';

type PageState = 'loading' | 'pending' | 'approved' | 'cancelled' | 'expired' | 'error';

@Component({
    selector: 'app-gitlite-authorize',
    standalone: true,
    imports: [
        DatePipe,
        RouterLink,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './gitlite-authorize.component.html',
    styleUrl: './gitlite-authorize.component.scss',
})
export class GitLiteAuthorizeComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private flowApi = inject(SaveManagerFlowService);
    private session = inject(SessionService);
    private toast = inject(ToastService);

    readonly state = signal<PageState>('loading');
    readonly flow = signal<SaveManagerFlowInfo | null>(null);
    readonly approveResult = signal<SaveManagerApproveResponse | null>(null);
    readonly errorMsg = signal('');
    readonly actionLoading = signal(false);

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
                this.state.set('cancelled');
                this.actionLoading.set(false);
            },
        });
    }

    get username(): string {
        return this.session.profile()?.username ?? this.session.user()?.username ?? '';
    }
}
