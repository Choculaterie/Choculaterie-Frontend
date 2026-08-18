"""
Builds a companion font with the accented letters the Minecraft font lacks.

Glyphs are composed from artwork already in the font: letters sit on an exact
100-unit grid, so an accent is found by rasterising an existing accented letter and
its plain form and taking the difference. That also works in Bold, where the accent
shares a contour with the letter.

Writes src/accent-fonts.scss with content-hashed filenames.
Usage: python3 tools/build-accent-font.py [--dump]
"""
import glob
import hashlib
import os
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

STYLES = {
    'MinecraftRegular-Bmg3': ('MinecraftAccents-Regular', 400, False),
    'MinecraftBold-nMK1': ('MinecraftAccents-Bold', 700, False),
    'MinecraftItalic-R8Mo': ('MinecraftAccents-Italic', 400, True),
    'MinecraftBoldItalic-1y1e': ('MinecraftAccents-BoldItalic', 700, True),
}
SRC_DIR = 'public/static/fonts'
OUT_DIRS = ['public/fonts', 'public/static/fonts']
GRID = 100
X_HEIGHT_ROW = 5        # lowercase ink stops below this row; dots/accents sit above
CAP_ROW = 6             # capitals occupy rows 0-6

# target, base, accent donor, donor's plain form
COMPOSE = [
    ('é', 'e', 'á', 'a'), ('è', 'e', 'à', 'a'), ('ä', 'a', 'ë', 'e'),
    ('É', 'E', 'á', 'a'), ('È', 'E', 'à', 'a'), ('Ê', 'E', 'ê', 'e'), ('Ë', 'E', 'ë', 'e'),
    ('À', 'A', 'à', 'a'), ('Â', 'A', 'â', 'a'),
    ('Ù', 'U', 'ù', 'u'), ('Û', 'U', 'û', 'u'),
    ('Ô', 'O', 'ô', 'o'), ('Ö', 'O', 'ö', 'o'),
    ('Î', 'I', 'î', 'i'), ('Ï', 'I', 'ë', 'e'),
    ('Ÿ', 'Y', 'ÿ', 'y'),
    # Spanish, Portuguese and Dutch
    ('Á', 'A', 'á', 'a'), ('Í', 'I', 'í', 'i'), ('Ó', 'O', 'ó', 'o'), ('Ú', 'U', 'ú', 'u'),
    ('ã', 'a', 'ñ', 'n'), ('õ', 'o', 'ñ', 'n'),
    ('Ã', 'A', 'ñ', 'n'), ('Õ', 'O', 'ñ', 'n'),
]

# Ligatures, built by butting two letters together and sharing the middle column,
# which is how the joined form reads at this resolution.
LIGATURES = [('œ', 'o', 'e'), ('Œ', 'O', 'E')]

# The only glyph with nothing to derive from. Drawn on the same grid with the same
# one-cell stroke as the font's own b and B.
DRAWN = {
    'ß': [
        '.##..',
        '#..#.',
        '#..#.',
        '#.#..',
        '#..#.',
        '#..#.',
        '#.##.',
    ],
}
# The font draws a circumflex and a dieresis identically at this resolution, so
# these are exact copies of a glyph that already exists rather than compositions.
COPY = [('ï', 'î')]
NAMES = {
    'é': 'eacute', 'è': 'egrave', 'ä': 'adieresis', 'ï': 'idieresis',
    'É': 'Eacute', 'È': 'Egrave', 'Ê': 'Ecircumflex', 'Ë': 'Edieresis',
    'À': 'Agrave', 'Â': 'Acircumflex', 'Ù': 'Ugrave', 'Û': 'Ucircumflex',
    'Î': 'Icircumflex', 'Ï': 'Idieresis', 'Ô': 'Ocircumflex', 'Ö': 'Odieresis',
    'Ÿ': 'Ydieresis',
    'Á': 'Aacute', 'Í': 'Iacute', 'Ó': 'Oacute', 'Ú': 'Uacute',
    'ã': 'atilde', 'õ': 'otilde', 'Ã': 'Atilde', 'Õ': 'Otilde',
    'œ': 'oe', 'Œ': 'OE', 'ß': 'germandbls',
}


def contours_of(gs, cmap, ch):
    rp = RecordingPen()
    gs[cmap[ord(ch)]].draw(rp)
    out, cur = [], []
    for op, args in rp.value:
        if op == 'moveTo':
            if cur:
                out.append(cur)
            cur = [args[0]]
        elif op == 'lineTo':
            cur.append(args[0])
    if cur:
        out.append(cur)
    return out


def inside(polys, x, y):
    """Nonzero winding test, valid here because every edge is a straight line."""
    wind = 0
    for poly in polys:
        for i in range(len(poly)):
            x0, y0 = poly[i]
            x1, y1 = poly[(i + 1) % len(poly)]
            if y0 <= y < y1 or y1 <= y < y0:
                t = (y - y0) / (y1 - y0)
                if x0 + t * (x1 - x0) > x:
                    wind += 1 if y1 > y0 else -1
    return wind != 0


def cells(gs, cmap, ch, width):
    polys = contours_of(gs, cmap, ch)
    cols = width // GRID + 2
    return {(c, r) for c in range(-1, cols) for r in range(-3, 10)
            if inside(polys, c * GRID + GRID // 2, r * GRID + GRID // 2)}


def to_glyph(cell_set):
    """One rectangle per horizontal run, so contours stay few and axis-aligned."""
    pen = TTGlyphPen(None)
    for row in sorted({r for _, r in cell_set}):
        run_cols = sorted(c for c, r in cell_set if r == row)
        start = prev = None
        for c in run_cols + [None]:
            if start is None:
                start = prev = c
                continue
            if c is not None and c == prev + 1:
                prev = c
                continue
            x0, x1 = start * GRID, (prev + 1) * GRID
            y0, y1 = row * GRID, (row + 1) * GRID
            pen.moveTo((x0, y0))
            pen.lineTo((x1, y0))
            pen.lineTo((x1, y1))
            pen.lineTo((x0, y1))
            pen.closePath()
            start = prev = c
    return pen.glyph()


def build(src_name, out_name, weight, italic, dump=False):
    src = TTFont(f'{SRC_DIR}/{src_name}.otf')
    cmap, gs, hmtx = src.getBestCmap(), src.getGlyphSet(), src['hmtx']
    width_of = lambda ch: hmtx[cmap[ord(ch)]][0]

    glyphs, metrics, charmap = {}, {}, {}
    glyphs['.notdef'] = TTGlyphPen(None).glyph()
    metrics['.notdef'] = (600, 0)

    for target, base_ch, donor_ch, donor_base in COMPOSE:
        accent = cells(gs, cmap, donor_ch, width_of(donor_ch)) - cells(gs, cmap, donor_base, width_of(donor_base))
        base = cells(gs, cmap, base_ch, width_of(base_ch))
        if target.islower():
            base = {(c, r) for c, r in base if r < X_HEIGHT_ROW}   # drop the dot on i/j
            lift = 0                                               # already clears the x-height
        else:
            # Capitals reach row 6, so the accent has to start at row 7. A circumflex
            # is two rows tall, and lifting it by a fixed one row merged its lower
            # row into the letter's top, turning the caret into a solid bar.
            lift = (CAP_ROW + 1) - min(r for _, r in accent)

        # Only re-centre when the base is a different width from the donor, which is
        # just the narrow I. Otherwise keep the exact column the font designed the
        # accent at: an acute sits right of centre and a grave left, and centring
        # them turned both into the same flat bar in the middle.
        if width_of(base_ch) == width_of(donor_ch):
            dx = 0
        else:
            acc_cols = [c for c, _ in accent]
            base_cols = [c for c, _ in base]
            dx = round((min(base_cols) + max(base_cols) - min(acc_cols) - max(acc_cols)) / 2)
        placed = {(c + dx, r + lift) for c, r in accent}

        merged = base | placed
        shift = -min(c for c, _ in merged)                         # keep ink off negative x
        merged = {(c + shift, r) for c, r in merged}
        width = max(width_of(base_ch), (max(c for c, _ in merged) + 1) * GRID + GRID)

        name = NAMES[target]
        glyphs[name] = to_glyph(merged)
        metrics[name] = (width, 0)
        charmap[ord(target)] = name
        if dump:
            print(f'  {target}')
            for r in range(8, -1, -1):
                print('    ' + ''.join('#' if (c, r) in merged else '.' for c in range(width // GRID)))

    for target, left_ch, right_ch in LIGATURES:
        left = cells(gs, cmap, left_ch, width_of(left_ch))
        right = cells(gs, cmap, right_ch, width_of(right_ch))
        join = max(c for c, _ in left)                     # share one column
        merged = left | {(c + join, r) for c, r in right}
        name = NAMES[target]
        glyphs[name] = to_glyph(merged)
        metrics[name] = ((max(c for c, _ in merged) + 2) * GRID, 0)
        charmap[ord(target)] = name

    for target, art in DRAWN.items():
        merged = {(c, len(art) - 1 - r) for r, line in enumerate(art)
                  for c, ch in enumerate(line) if ch == '#'}
        name = NAMES[target]
        glyphs[name] = to_glyph(merged)
        metrics[name] = ((max(c for c, _ in merged) + 2) * GRID, 0)
        charmap[ord(target)] = name

    for target, source_ch in COPY:
        c = cells(gs, cmap, source_ch, width_of(source_ch))
        name = NAMES[target]
        glyphs[name] = to_glyph(c)
        metrics[name] = (width_of(source_ch), 0)
        charmap[ord(target)] = name

    fb = FontBuilder(src['head'].unitsPerEm, isTTF=True)
    order = ['.notdef'] + [n for n in glyphs if n != '.notdef']
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(charmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=src['hhea'].ascent, descent=src['hhea'].descent)
    fb.setupNameTable({'familyName': 'Minecraft Accents',
                       'styleName': ('Bold ' if weight == 700 else '') + ('Italic' if italic else 'Regular'),
                       'psName': out_name})
    fb.setupOS2(sTypoAscender=src['OS/2'].sTypoAscender, sTypoDescender=src['OS/2'].sTypoDescender,
                usWinAscent=src['OS/2'].usWinAscent, usWinDescent=src['OS/2'].usWinDescent,
                usWeightClass=weight)
    fb.setupPost()
    # Fixed timestamps, or every run produces different bytes and a new content hash
    # for identical glyphs, churning the filename and busting caches for nothing.
    fb.font['head'].created = fb.font['head'].modified = 0

    # The filename carries a content hash. Cloudflare caches these for four hours,
    # so a fix to a fixed-name font stayed invisible to everyone until it expired.
    tmp = f'{OUT_DIRS[0]}/.{out_name}.tmp'
    fb.save(tmp)
    digest = hashlib.sha1(open(tmp, 'rb').read()).hexdigest()[:8]
    os.remove(tmp)

    filename = f'{out_name}.{digest}.ttf'
    for d in OUT_DIRS:
        for old in glob.glob(f'{d}/{out_name}.*.ttf'):
            os.remove(old)
        fb.save(f'{d}/{filename}')
    return sorted(charmap), filename


def unicode_range(codepoints):
    ranges, start, prev = [], None, None
    for cp in sorted(codepoints):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            ranges.append((start, prev))
            start = prev = cp
    if start is not None:
        ranges.append((start, prev))
    return ', '.join(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}' for a, b in ranges)

FACE = """
@font-face {{
  font-family: 'Minecraft';
  src: url('/static/fonts/{filename}') format('truetype');
  font-weight: {weight};
  font-style: {style};
  unicode-range: {range};
}}"""

if __name__ == '__main__':
    import sys
    dump = '--dump' in sys.argv
    rules = ['// Generated by tools/build-accent-font.py. Do not edit by hand.',
             '// Companion faces for the characters the Minecraft font lacks, scoped by',
             '// unicode-range so they apply to nothing else.']

    for src_name, (out_name, weight, italic) in STYLES.items():
        added, filename = build(src_name, out_name, weight, italic,
                                dump=dump and 'Regular' in out_name)
        rules.append(FACE.format(filename=filename, weight=weight,
                                 style='italic' if italic else 'normal',
                                 range=unicode_range(added)))
        print(f'{out_name}: {len(added)} glyphs -> '
              + ''.join(chr(c) for c in added) + f'  [{filename}]')

    with open('src/accent-fonts.scss', 'w') as fh:
        fh.write('\n'.join(rules) + '\n')
    print('wrote src/accent-fonts.scss')
