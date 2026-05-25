import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { simpleDiscord } from '@ng-icons/simple-icons';
import { matfMinecraftColored } from '@ng-icons/material-file-icons/colored';
import type { PublicUserListItemResponse, UserListItemResponse } from '../../../api/generated.schemas';
import { UserImgPipe } from '../../pipes/image-url.pipe';
import { SkeletonImgComponent } from '../skeleton-img/skeleton-img.component';

@Component({
    selector: 'app-user-card',
    standalone: true,
    imports: [RouterLink, MatCardModule, MatIconModule, MatTooltipModule, NgIconComponent, UserImgPipe, SkeletonImgComponent],
    viewProviders: [provideIcons({ simpleDiscord, matfMinecraftColored })],
    template: `
        <a class="card-link" [routerLink]="['/users', user().username]">
        <mat-card class="user-card" appearance="outlined">
            <mat-card-content>
                <div class="user-avatar">
                    @if (user().filePath) {
                        <app-skeleton-img [src]="user().filePath! | userImg" [alt]="user().username!" height="64px" />
                    } @else {
                        <img src="/icons/ui/smile_circle.svg" alt="" aria-hidden="true" class="mc-icon" />
                    }
                </div>
                <div class="user-name-row">
                    <span class="user-name">{{ user().username }}</span>
                    @if (memberYears() !== null) {
                        <span class="year-badge" [matTooltip]="memberYears() === 0 ? 'Joined this year' : 'Member for ' + memberYears() + (memberYears() === 1 ? ' year' : ' years')">{{ memberYears() === 0 ? '&lt;1' : memberYears() }}</span>
                    }
                </div>
                <div class="user-links">
                    @if ($any(user()).isMinecraftLinked) {
                        <span class="link-badge" title="Minecraft"><ng-icon name="matfMinecraftColored" size="14" /> {{ $any(user()).minecraftUsername }}</span>
                    }
                    @if ($any(user()).isDiscordLinked) {
                        <span class="link-badge" title="Discord"><ng-icon name="simpleDiscord" size="14" /> {{ $any(user()).discordUsername }}</span>
                    }
                </div>
            </mat-card-content>
        </mat-card>
        </a>
    `,
    styles: [`
        .card-link {
            text-decoration: none;
            color: inherit;
            display: block;
            height: 100%;
        }
        .user-card {
            cursor: pointer;
            transition: box-shadow 0.2s;
            min-height: 180px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            &:hover { box-shadow: var(--mat-sys-level2); }
        }
        mat-card-content {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; text-align: center;
            gap: 0.5rem; padding: 1rem;
        }
        .user-avatar {
            width: 64px; height: 64px; border-radius: 50%; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            background: var(--mat-sys-surface-variant);
            app-skeleton-img { width: 100%; height: 100%; }
            mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--mat-sys-on-surface-variant); }
            img.mc-icon { width: 48px; height: 48px; transform: translate(1px,1px); }
        }
        .user-name-row {
            display: flex; align-items: center; gap: 0.35rem;
        }
        .user-name {
            font: var(--mat-sys-title-small);
            color: var(--mat-sys-on-surface);
        }
        .year-badge {
            font-size: 0.65rem; font-weight: 600;
            background: var(--mat-sys-surface-variant);
            color: var(--mat-sys-on-surface-variant);
            width: 1.4rem; height: 1.4rem; border-radius: 50%;
            display: inline-flex; align-items: center; justify-content: center; padding: 0;
            line-height: 1;
        }
        .user-links {
            display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center;
        }
        .link-badge {
            display: flex; align-items: center; gap: 0.2rem;
            font-size: 0.7rem; color: var(--mat-sys-on-surface-variant);
            mat-icon { font-size: 14px; width: 14px; height: 14px; }
        }
    `],
})
export class UserCardComponent {
    user = input.required<PublicUserListItemResponse | UserListItemResponse>();

    memberYears = computed(() => {
        const regDate = (this.user() as any).registrationDate;
        if (!regDate) return null;
        const joined = new Date(regDate);
        const now = new Date();
        let years = now.getFullYear() - joined.getFullYear();
        if (now.getMonth() < joined.getMonth() ||
            (now.getMonth() === joined.getMonth() && now.getDate() < joined.getDate())) {
            years--;
        }
        return Math.max(0, years);
    });
}
