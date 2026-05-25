import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OgMetaService {
    private meta = inject(Meta);
    private title = inject(Title);

    private readonly siteName = 'Choculaterie';

    setSchematic(s: {
        name: string;
        description: string | null;
        pictures: { filePath: string | null }[];
        authorName?: string;
    }): void {
        const description = s.description?.trim().substring(0, 200)
            ?? `A Minecraft schematic by ${s.authorName ?? 'unknown'} on Choculaterie.`;

        const rawPath = s.pictures[0]?.filePath;
        const imageUrl = rawPath
            ? (rawPath.startsWith('http') ? rawPath : `${environment.apiBasePath}/images/schematics/${rawPath}`)
            : null;

        const pageTitle = s.name;
        this.title.setTitle(pageTitle);
        this.set('og:title', pageTitle);
        this.set('og:description', description);
        this.set('og:type', 'website');
        this.set('og:site_name', this.siteName);
        if (imageUrl) {
            this.set('og:image', imageUrl);
        }
    }

    setUser(u: { username: string | null; biographie?: string | null; filePath?: string | null }): void {
        const pageTitle = u.username ?? 'User';
        const description = u.biographie?.trim().substring(0, 200)
            ?? `${u.username ?? 'A user'}'s profile on Choculaterie.`;
        const imageUrl = u.filePath
            ? (u.filePath.startsWith('http') ? u.filePath : `${environment.apiBasePath}/images/users/${u.filePath}`)
            : null;

        this.title.setTitle(pageTitle);
        this.set('og:title', pageTitle);
        this.set('og:description', description);
        this.set('og:type', 'profile');
        this.set('og:site_name', this.siteName);
        if (imageUrl) {
            this.set('og:image', imageUrl);
        }
    }

    setQuickShare(fileName: string): void {
        const pageTitle = `${fileName} · Quick Share`;
        const description = `Minecraft litematic quick share, expires in 48\u00a0hours`;
        this.title.setTitle(pageTitle);
        this.set('og:title', pageTitle);
        this.set('og:description', description);
        this.set('og:type', 'website');
        this.set('og:site_name', this.siteName);
    }

    clear(): void {
        this.title.setTitle(this.siteName);
        for (const p of ['og:title', 'og:description', 'og:image', 'og:type', 'og:site_name', 'og:url']) {
            this.meta.removeTag(`property='${p}'`);
        }
    }

    private set(property: string, content: string): void {
        this.meta.updateTag({ property, content });
    }
}
