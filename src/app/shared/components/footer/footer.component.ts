import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
    selector: 'app-footer',
    standalone: true,
    imports: [MatIconModule, MatDividerModule],
    template: `
        <mat-divider />
        <footer class="footer">
            <span class="disclaimer">Choculaterie is not affiliated with Mojang Studios or Microsoft.</span>
            <div class="footer-links">
                <a href="https://github.com/Choculaterie" target="_blank" rel="noopener" aria-label="GitHub">
                    <mat-icon>code</mat-icon> GitHub
                </a>
                <a href="https://discord.gg/choculaterie" target="_blank" rel="noopener" aria-label="Discord">
                    <mat-icon>forum</mat-icon> Discord
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
            gap: 0.25rem;
            color: var(--mat-sys-on-surface-variant);
            text-decoration: none;
            transition: color 0.2s;
            &:hover { color: var(--mat-sys-primary); }
            mat-icon { font-size: 18px; width: 18px; height: 18px; }
        }
    `,
})
export class FooterComponent {}
