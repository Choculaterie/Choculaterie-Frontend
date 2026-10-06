const NAVBAR_ROOM = 80;

export function scrollIntoViewSoon(selector: string, options: { onlyIfHidden?: boolean } = {}, delay = 60): void {
    setTimeout(() => {
        const el = document.querySelector(selector);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const hidden = r.bottom < NAVBAR_ROOM || r.top > window.innerHeight;
        const partly = r.top < NAVBAR_ROOM || r.bottom > window.innerHeight;
        if (options.onlyIfHidden ? hidden : partly) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, delay);
}

export function scrollBackTo(selector: string): void {
    setTimeout(() => {
        const el = document.querySelector(selector);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top < NAVBAR_ROOM || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}
