import github from 'emojibase-data/en/shortcodes/github.json';
import iamcal from 'emojibase-data/en/shortcodes/iamcal.json';

let shortcodes: Map<string, string> | null = null;

function shortcodeMap(): Map<string, string> {
    if (shortcodes) return shortcodes;
    shortcodes = new Map();
    for (const dataset of [iamcal, github]) {
        for (const [hex, codes] of Object.entries(dataset)) {
            const emoji = hex.split('-').map(h => String.fromCodePoint(parseInt(h, 16))).join('');
            for (const code of Array.isArray(codes) ? codes : [codes]) shortcodes.set(code, emoji);
        }
    }
    return shortcodes;
}

export function emojify(text: string): string {
    if (!text.includes(':')) return text;
    const map = shortcodeMap();
    return text.replace(/:([a-z0-9_+-]+):/gi, (match, name: string) => map.get(name.toLowerCase()) ?? match);
}
