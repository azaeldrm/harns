"""Renders the orbs Monochrome shows as sprite sheets in src/shared/orbs/: each a loop of 60 frames a second, drawn by
scripts/orb-frames.mjs from the vendored thinking-orbs engine at twice the size it's shown, laid out left to right and
top to bottom in one lossless WebP, with src/shared/orb-clips.js telling orbs.js each sheet's frames and columns. A
sheet, not an animated WebP: herdr starts an animated picture over whenever its view redraws, while orbs.js shows a
sheet's frame by the clock, so a redraw can't reset it. Home's large orb is drawn live instead (live-orb.js): herdr
placed a big sheet a pixel or two off from frame to frame, and it shook. The engine's licence goes with them. Run after
`npm run vendor:orbs`, or with clips to render only those: `python scripts/render-orbs.py [state-size ...]`."""

import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'shared' / 'orbs'
TABLE = ROOT / 'src' / 'shared' / 'orb-clips.js'
SCALE = 2
WIDEST = 2048
"""How many times its size each orb is drawn, and the widest a sheet may be: herdr draws a 4096 px wide picture a
little narrower than its size, which moved an orb a few pixels along each row of its sheet."""

CLIPS = ['working-20', 'searching-20', 'solving-20', 'connecting-20', 'weaving-20', 'listening-20', 'breathing-20']
"""Each clip, as `<state>-<size>`: the working states, needing you (also the logo) and idle in the sidebar and chat."""


def frames(state, size, scale, fps):
    """The clip's frames as orb-frames.mjs draws them at `scale`: its header ({ frames, side, loop }) and the raw RGBA."""
    raw = subprocess.run(['node', str(ROOT / 'scripts' / 'orb-frames.mjs'), state, str(size), str(scale), str(fps)],
                         check=True, capture_output=True).stdout
    head, _, body = raw.partition(b'\n')
    return json.loads(head), body


def tile(info, body):
    """The frames laid out left to right and top to bottom, at most WIDEST wide: the sheet, its columns and rows."""
    side, count = info['side'], info['frames']
    cols = min(count, WIDEST // side)
    rows = math.ceil(count / cols)
    sheet = Image.new('RGBA', (cols * side, rows * side), (0, 0, 0, 0))
    step = side * side * 4
    for n in range(count):
        frame = Image.frombytes('RGBA', (side, side), body[n * step:(n + 1) * step])
        sheet.paste(frame, ((n % cols) * side, (n // cols) * side))
    return sheet, cols, rows


def render(clip, fps=60):
    """Draws one clip with orb-frames.mjs and saves it as a sheet, answering its row of the table."""
    OUT.mkdir(parents=True, exist_ok=True)
    state, size = clip.rsplit('-', 1)
    info, body = frames(state, size, SCALE, fps)
    sheet, cols, rows = tile(info, body)
    path = OUT / f'{clip}.webp'
    sheet.save(path, lossless=True, quality=100, method=6)
    print(f'{clip}: {info["frames"]} frames, {info["loop"]:.2f} s loop, {cols}x{rows} of {info["side"]} px, '
          f'{path.stat().st_size // 1024} KB')
    return clip, {'frames': info['frames'], 'cols': cols, 'rows': rows, 'fps': fps}


def write_table(rows):
    """Writes orb-clips.js, keeping the rows of clips not rendered this time."""
    table = {}
    if TABLE.exists():
        table = json.loads(re.search(r'= (\{.*\});', TABLE.read_text(encoding='utf-8'), re.S).group(1))
    table.update(rows)
    table = {clip: row for clip, row in table.items() if clip in CLIPS}
    body = json.dumps(dict(sorted(table.items())), indent=2)
    TABLE.write_text('/**\n * Each orb sheet of src/shared/orbs as scripts/render-orbs.py laid it out, by `<state>-<size>`: how many frames it\n'
                     ' * holds, in how many columns and rows, at how many frames a second. Written by that script: don\'t edit.\n */\n'
                     f'export const ORB_CLIPS = {body};\n', encoding='utf-8', newline='\r\n')


if __name__ == '__main__':
    write_table(dict(render(clip) for clip in sys.argv[1:] or CLIPS))
    shutil.copy2(ROOT / 'src' / 'shared' / 'vendor' / 'thinking-orbs' / 'LICENSE', OUT / 'LICENSE')
