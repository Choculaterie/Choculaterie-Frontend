import { Component } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-footer',
    standalone: true,
    imports: [MatIconModule, TPipe, MatDividerModule],
    template: `
        <mat-divider />
        <footer class="footer">
            <span class="disclaimer">{{ 'Choculaterie is not affiliated with Mojang Studios or Microsoft.' | t }}</span>
            <div class="footer-links">
                <a href="https://github.com/Choculaterie" target="_blank" rel="noopener" aria-label="GitHub">
                    <mat-icon svgIcon="mc:logos/github"></mat-icon> GitHub
                </a>
                <a href="https://discord.gg/choculaterie" target="_blank" rel="noopener" aria-label="Discord">
                    <mat-icon svgIcon="mc:logos/discord"></mat-icon> Discord
                </a>
                <a href="https://status.choculaterie.com/" target="_blank" rel="noopener" [attr.aria-label]="'Status' | t">
                    <mat-icon svgIcon="mc:data/graph_up" class="status-icon"></mat-icon> {{ 'Status' | t }}
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
        .footer-links .mc-icon {
            width: var(--icon-size);
            height: var(--icon-size);
        }
    `,
})
export class FooterComponent { }
