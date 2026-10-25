"""Export Windows cursor packs (.cur / .ani) as web cursors: PNG frames, hotspots and frame timings.

    python cursor_export.py <bundled packs dir> <output site dir>

For each pack it writes <site>/cursors/<id>/<role>-<n>.png at 32 px for the arrow, link and text roles, plus a
larger preview of the arrow for the cards, and <site>/js/packs.js describing them. Community sets are fetched
from rw-designer.com set pages, the same way the Cursors app finds them.
"""
import io
import json
import re
import struct
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

PNG = b"\x89PNG\r\n\x1a\n"
SITE = "https://www.rw-designer.com"
UA = {"User-Agent": "Mozilla/5.0 (cursors landing page export)"}

# id, name, vibe, source: ("bundled", folder) or ("community", slug, author)
PACKS = [
    ("plasma", "Lightning Plasma", "Animated", ("community", "lightning-plasma", "Censor_Not")),
    ("fire", "Internal Combustion", "Animated", ("community", "internal-combustion-animated-", "Censor_Not")),
    ("glitch", "Glitch", "Animated", ("community", "szubidub-s-glitch-pack", "Szubidub")),
    ("psychedelic", "Psychedelic", "Animated", ("community", "psychedeliic-animated", "Censor_Not")),
    ("rainbow", "Rainbow Modern", "Animated", ("bundled", "bibata-rainbow-modern")),
    ("bee", "Bee", "Animated", ("bundled", "bibata-bee")),
    ("bear", "Kawaii Little Bear", "Kawaii", ("community", "kawaiilitbearmimidestino", "NaLexnu")),
    ("bunny", "Sparkly Bunny", "Kawaii", ("community", "bunnysparkle", "Lights")),
    ("banana", "Banana", "Kawaii", ("bundled", "banana")),
    ("mocha", "Catppuccin Mocha", "Kawaii", ("bundled", "catppuccin-mocha")),
    ("magenta", "Neon Magenta", "Neon", ("bundled", "neon-magenta")),
    ("bluefire", "Electric Cyan Blue Fire", "Neon", ("community", "electric-cyan-blue-fire", "TheCurGuy")),
    ("purple", "Purple Glowing", "Neon", ("community", "purple-glowing", "Diamond")),
    ("pixel", "Pixel", "Retro and games", ("bundled", "kenney-pixel")),
    ("terminal", "Retrosmart Terminal", "Retro and games", ("bundled", "retrosmart-terminal")),
    ("steampunk", "Steampunk", "Retro and games", ("community", "steampunk-cursors", "JDDellGuy")),
    ("space", "Space Theme", "Retro and games", ("community", "space-theme", "nightklp")),
    ("macos", "macOS", "Clean", ("bundled", "macos")),
    ("ghost", "Ghost", "Clean", ("bundled", "bibata-ghost")),
]

BUNDLED_FILES = {"arrow": "Arrow", "link": "Hand", "text": "IBeam"}
COMMUNITY_CLASSES = {"arrow": "curarrow", "link": "curlink", "text": "curtext"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def decode_entry(w, h, blob):
    """One image from a .cur/.ico directory entry, as RGBA."""
    if blob[:8] == PNG:
        return Image.open(io.BytesIO(blob)).convert("RGBA")
    return decode_dib(blob)


def decode_dib(blob):
    """A cursor bitmap: a DIB whose height counts the colour rows and the 1-bit AND mask below them. 32-bit
    images carry their own alpha (the mask is only a fallback); the rest get transparency from the mask."""
    bsize, w, h2, _, bpp, _, _, _, _, used, _ = struct.unpack_from("<IiiHHIIiiII", blob, 0)
    h = abs(h2) // 2
    off = bsize
    pal = []
    if bpp <= 8:
        n = used or (1 << bpp)
        pal = [(blob[off + 4 * i + 2], blob[off + 4 * i + 1], blob[off + 4 * i]) for i in range(n)]
        off += 4 * n
    row = ((w * bpp + 31) // 32) * 4
    xor = blob[off:off + row * h]
    mrow = ((w + 31) // 32) * 4
    andm = blob[off + row * h:off + row * h + mrow * h]
    alpha = bpp == 32 and any(xor[i] for i in range(3, len(xor), 4))
    img = Image.new("RGBA", (w, h))
    px = img.load()
    for y in range(h):
        sy = h - 1 - y  # bottom-up
        r0 = sy * row
        for x in range(w):
            if bpp == 32:
                b, g, r, a = xor[r0 + 4 * x:r0 + 4 * x + 4]
            elif bpp == 24:
                b, g, r = xor[r0 + 3 * x:r0 + 3 * x + 3]
                a = 255
            else:
                if bpp == 8:
                    idx = xor[r0 + x]
                elif bpp == 4:
                    byte = xor[r0 + x // 2]
                    idx = byte >> 4 if x % 2 == 0 else byte & 15
                else:
                    idx = (xor[r0 + x // 8] >> (7 - x % 8)) & 1
                r, g, b = pal[idx] if idx < len(pal) else (0, 0, 0)
                a = 255
            if not alpha:
                masked = andm and (andm[sy * mrow + x // 8] >> (7 - x % 8)) & 1
                a = 0 if masked else 255
            px[x, y] = (r, g, b, a)
    return img


def read_cur(data):
    """Every image in a .cur/.ico with its hotspot: [(image, hx, hy)]."""
    _, kind, count = struct.unpack_from("<HHH", data, 0)
    out = []
    for i in range(count):
        w, h, _, _, hx, hy, size, off = struct.unpack_from("<BBBBHHII", data, 6 + 16 * i)
        w, h = w or 256, h or 256
        img = decode_entry(w, h, data[off:off + size])
        if kind != 2:
            hx = hy = 0  # an .ico has no hotspot
        out.append((img, hx, hy))
    return out


def read_ani(data):
    """An .ani as (frames, steps): frames are .cur byte strings, steps are (frame index, milliseconds)."""
    assert data[:4] == b"RIFF" and data[8:12] == b"ACON", "not an .ani"
    pos, frames, rate, seq, disp = 12, [], None, None, 6
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack_from("<I", data, pos + 4)[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"anih" and size >= 36:
            disp = struct.unpack_from("<9I", body, 0)[7] or 6
        elif cid == b"rate":
            rate = list(struct.unpack_from("<%dI" % (size // 4), body))
        elif cid == b"seq ":
            seq = list(struct.unpack_from("<%dI" % (size // 4), body))
        elif cid == b"LIST" and body[:4] == b"fram":
            p = 4
            while p + 8 <= len(body):
                sid, ssz = body[p:p + 4], struct.unpack_from("<I", body, p + 4)[0]
                if sid == b"icon":
                    frames.append(body[p + 8:p + 8 + ssz])
                p += 8 + ssz + (ssz & 1)
        pos += 8 + size + (size & 1)
    order = seq or list(range(len(frames)))
    jiffies = rate or [disp] * len(order)
    steps = [(i, max(20, round(j * 1000 / 60))) for i, j in zip(order, jiffies)]
    return frames, steps


def pick(images, size):
    """The image for a size, with its hotspot: the exact size if the cursor has it, else a smaller one blown up by
    whole pixels (sharp, never soft), else the nearest larger one scaled down. The last value says it was blown up."""
    exact = [e for e in images if e[0].width == size]
    whole = sorted((e for e in images if e[0].width < size and size % e[0].width == 0), key=lambda e: -e[0].width)
    larger = sorted((e for e in images if e[0].width > size), key=lambda e: e[0].width)
    img, hx, hy = (exact or whole or larger or sorted(images, key=lambda e: -e[0].width))[0]
    if img.width > size:
        k = size / img.width
        img = img.resize((size, round(img.height * k)), Image.LANCZOS)
        return img, min(round(hx * k), size - 1), min(round(hy * k), img.height - 1), False
    if img.width < size:
        k = size // img.width
        big = img.resize((img.width * k, img.height * k), Image.NEAREST)
        img = Image.new("RGBA", (size, max(size, big.height)))
        img.paste(big, (0, 0))
        return img, min(hx * k, size - 1), min(hy * k, img.height - 1), k > 1
    return img, min(hx, size - 1), min(hy, img.height - 1), False


def centred(frames, size):
    """Frames moved so what they draw sits in the middle of a size x size square, all by the same amount."""
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    if not boxes:
        return frames
    left, top = min(x[0] for x in boxes), min(x[1] for x in boxes)
    right, bottom = max(x[2] for x in boxes), max(x[3] for x in boxes)
    out = []
    for f in frames:
        square = Image.new("RGBA", (size, size))
        square.paste(f.crop((left, top, right, bottom)), ((size - (right - left)) // 2, (size - (bottom - top)) // 2))
        out.append(square)
    return out


def frames_of(data, name):
    """[(images, ms)] for a .cur or .ani file's bytes."""
    if data[:4] == b"RIFF":
        frames, steps = read_ani(data)
        decoded = [read_cur(f) for f in frames]
        return decoded, steps
    return [read_cur(data)], [(0, 0)]


def export_role(data, name, outdir, role, sizes):
    decoded, steps = frames_of(data, name)
    files, hot, blocky = {}, None, set()
    for size, prefix in sizes:
        imgs = []
        for images in decoded:
            img, hx, hy, scaled_up = pick(images, size)
            if hot is None and prefix == role:
                hot = (hx, hy)
            if scaled_up:
                blocky.add(prefix)
            imgs.append(img)
        if prefix == "preview":
            imgs = centred(imgs, size)  # the hotspot doesn't matter on a card, being in the middle does
        names = []
        for i, img in enumerate(imgs):
            fname = f"{prefix}-{i}.png"
            img.save(outdir / fname, optimize=True)
            names.append(fname)
        files[prefix] = names
    return files, steps, hot, blocky


def community_files(slug):
    html = fetch(f"{SITE}/cursor-set/{slug}").decode("utf-8", "replace")
    found = {}
    for cls, href in re.findall(r'class="itemteaser\s+([^"]*)"><a class="download" href="(/cursor-download/\d+/[^"]+)"', html):
        for role, want in COMMUNITY_CLASSES.items():
            if cls.split()[0] == want and role not in found:
                found[role] = SITE + href
    return found


def main(bundled_dir, site_dir):
    bundled_dir, site_dir = Path(bundled_dir), Path(site_dir)
    out_root = site_dir / "cursors"
    manifest = []
    for pid, name, vibe, src in PACKS:
        outdir = out_root / pid
        outdir.mkdir(parents=True, exist_ok=True)
        entry = {"id": pid, "name": name, "vibe": vibe, "roles": {}}
        if src[0] == "bundled":
            folder = bundled_dir / src[1]
            ini = dict(l.split("=", 1) for l in (folder / "pack.ini").read_text("utf-8").splitlines() if "=" in l)
            entry.update(author=ini.get("author", ""), license=ini.get("license", ""), source=ini.get("url", ""), via="Bundled with Cursors")
            blobs = {}
            for role, stem in BUNDLED_FILES.items():
                for ext in (".ani", ".cur"):
                    f = folder / (stem + ext)
                    if f.exists():
                        blobs[role] = f.read_bytes()
                        break
        else:
            _, slug, author = src
            entry.update(author=author, license="Public domain", source=f"{SITE}/cursor-set/{slug}", via="Community set on rw-designer.com")
            blobs = {}
            for role, url in community_files(slug).items():
                blobs[role] = fetch(url)
                time.sleep(0.4)
        for role, data in blobs.items():
            sizes = [(32, role)] + ([(96, "preview")] if role == "arrow" else [])
            files, steps, hot, blocky = export_role(data, name, outdir, role, sizes)
            entry["roles"][role] = {"frames": files[role], "steps": steps, "hx": hot[0], "hy": hot[1]}
            if role == "arrow":
                # pixelated: the preview was blown up from a smaller cursor, so the page keeps its pixels hard
                entry["preview"] = {"frames": files["preview"], "steps": steps, "pixelated": "preview" in blocky}
        entry["animated"] = any(len(r["steps"]) > 1 for r in entry["roles"].values())
        manifest.append(entry)
        print(f"{pid:12} {name:26} roles={','.join(entry['roles'])} animated={entry['animated']} frames={len(entry['roles']['arrow']['frames'])}")
    js = "// Written by the cursor export from the Cursors packs. Each pack: its credit and, per role, PNG frames,\n" \
         "// the steps that play them (frame index, milliseconds) and the hotspot.\n" \
         "window.CURSOR_PACKS = " + json.dumps(manifest, indent=1, ensure_ascii=False) + ";\n"
    (site_dir / "js").mkdir(parents=True, exist_ok=True)
    (site_dir / "js" / "packs.js").write_text(js, "utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
