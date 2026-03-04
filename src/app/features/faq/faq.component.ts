import {
    Component, OnInit, ViewChild, signal, inject,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FaqService } from '../../api/faq';
import { ContactService } from '../../api/contact';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { CaptchaComponent } from '../../shared/components/captcha/captcha.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import type { FaqResponse, CaptchaPositionDto } from '../../api/generated.schemas';

@Component({
    selector: 'app-faq',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        MatExpansionModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatDividerModule,
        MatTooltipModule,
        CaptchaComponent,
        LoadingSpinnerComponent,
    ],
    templateUrl: './faq.component.html',
    styleUrl: './faq.component.scss',
})
export class FaqComponent implements OnInit {
    @ViewChild(CaptchaComponent) captcha?: CaptchaComponent;

    private faqApi = inject(FaqService);
    private contactApi = inject(ContactService);
    private fb = inject(FormBuilder);
    readonly session = inject(SessionService);
    private toast = inject(ToastService);

    readonly faqs = signal<FaqResponse[]>([]);
    readonly loadingFaqs = signal(true);
    readonly submitting = signal(false);
    readonly submitted = signal(false);

    readonly captchaData = signal<{ captchaId: string; captchaPositions: CaptchaPositionDto[] } | null>(null);

    readonly contactForm = this.fb.nonNullable.group({
        title: ['', [Validators.required, Validators.maxLength(200)]],
        description: ['', [Validators.required, Validators.maxLength(2000)]],
        contact: ['', Validators.maxLength(200)],
    });

    imageFiles: File[] = [];
    readonly imagePreviews = signal<string[]>([]);

    ngOnInit(): void {
        this.faqApi.getApiFaq().subscribe({
            next: (items) => { this.faqs.set(items); this.loadingFaqs.set(false); },
            error: () => this.loadingFaqs.set(false),
        });
    }

    onCaptchaSolved(data: { captchaId: string; captchaPositions: CaptchaPositionDto[] }): void {
        this.captchaData.set(data);
    }

    onImageChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files) return;
        const chosen = Array.from(input.files);
        const remaining = 5 - this.imageFiles.length;
        const toAdd = chosen.slice(0, remaining);
        this.imageFiles = [...this.imageFiles, ...toAdd];
        // Generate preview URLs
        const newPreviews = toAdd.map(f => URL.createObjectURL(f));
        this.imagePreviews.update(prev => [...prev, ...newPreviews]);
        if (chosen.length > remaining) {
            this.toast.error('Maximum 5 images allowed.');
        }
        input.value = '';
    }

    removeImage(index: number): void {
        const preview = this.imagePreviews()[index];
        if (preview) URL.revokeObjectURL(preview);
        this.imageFiles = this.imageFiles.filter((_, i) => i !== index);
        this.imagePreviews.update(prev => prev.filter((_, i) => i !== index));
    }

    openEmail(): void {
        window.location.href = ['mail', 'to:', 'support', '@choculaterie.com'].join('');
    }

    submit(): void {
        if (this.contactForm.invalid || this.submitting()) return;
        const needsCaptcha = !this.session.isAuthenticated();
        if (needsCaptcha && !this.captchaData()) {
            this.toast.error('Please complete the captcha first.');
            return;
        }

        this.submitting.set(true);
        const val = this.contactForm.getRawValue();
        const cd = this.captchaData();

        this.contactApi.postApiContact({
            Title: val.title,
            Description: val.description,
            Contact: val.contact || undefined,
            Images: this.imageFiles.length ? (this.imageFiles as any) : undefined,
            CaptchaId: cd?.captchaId,
            CaptchaPositions: cd ? JSON.stringify(cd.captchaPositions) : undefined,
        }).subscribe({
            next: () => {
                this.submitted.set(true);
                this.submitting.set(false);
            },
            error: (err) => {
                const msg = err.error?.detail ?? err.error?.title ?? err.error?.message ?? 'Failed to send your message. Please try again.';
                this.toast.error(msg);
                this.submitting.set(false);
                this.captchaData.set(null);
                this.captcha?.resetChallenge();
            },
        });
    }

    reset(): void {
        this.submitted.set(false);
        this.contactForm.reset({ title: '', description: '', contact: '' });
        this.imageFiles = [];
        this.captchaData.set(null);
    }
}
