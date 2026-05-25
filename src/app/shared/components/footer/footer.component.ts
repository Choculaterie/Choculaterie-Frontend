import { Component } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { simpleGithub, simpleDiscord } from '@ng-icons/simple-icons';

@Component({
    selector: 'app-footer',
    standalone: true,
    imports: [MatDividerModule, NgIconComponent],
    viewProviders: [provideIcons({ simpleGithub, simpleDiscord })],
    template: `
        <mat-divider />
        <footer class="footer">
            <span class="disclaimer">Choculaterie is not affiliated with Mojang Studios or Microsoft.</span>
            <div class="footer-links">
                <a href="https://github.com/Choculaterie" target="_blank" rel="noopener" aria-label="GitHub">
                    <ng-icon name="simpleGithub" size="18" /> GitHub
                </a>
                <a href="https://discord.gg/choculaterie" target="_blank" rel="noopener" aria-label="Discord">
                    <ng-icon name="simpleDiscord" size="18" /> Discord
                </a>
            </div>
        </footer>
    `,
    styles: `
        .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.5rem;
            font-size: 0.8rem;
            color: var(--mat-sys-on-surface-variant);
            flex-wrap: wrap;
            gap: 0.75rem;
        }
        .disclaimer {
            opacity: 0.7;
        }
        .footer-links {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        .footer-links a {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            color: var(--mat-sys-on-surface-variant);
            text-decoration: none;
            transition: color 0.2s;
            &:hover { color: var(--mat-sys-primary); }
        }
    `,
})
export class FooterComponent { }
