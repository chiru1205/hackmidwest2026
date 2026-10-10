"""Generate procedural placeholder photos into data/photos/seed (run once)."""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "photos" / "seed"
W, H = 1200, 900


def asphalt(rnd, base=88, tint=(0, 2, 6)):
    g = np.random.default_rng(rnd.randint(0, 10**6))
    f = np.zeros((H, W), np.float32)
    for s, a in ((1, 20), (2, 12), (5, 6), (40, 5)):
        n = g.normal(0, 1, (H // s + 2, W // s + 2)).astype(np.float32)
        im = Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        f += (np.asarray(im, np.float32) - 128) / 40 * a
    sp = g.random((H, W))
    f += np.where(sp > 0.992, 55, 0) + np.where(sp < 0.006, -30, 0)
    yy, xx = np.mgrid[0:H, 0:W]
    ang = rnd.uniform(0, 6.28)
    f += (np.cos(ang) * (xx - W / 2) + np.sin(ang) * (yy - H / 2)) / W * rnd.uniform(15, 40)
    rgb = np.stack([f + base + tint[0], f + base + tint[1], f + base + tint[2]], -1)
    return Image.fromarray(rgb.clip(0, 255).astype(np.uint8))


def blob(rnd, cx, cy, rx, ry, rot, n=14, jag=0.22):
    pts = []
    for i in range(n):
        a = i / n * 6.283
        r = 1 + rnd.uniform(-jag, jag)
        x, y = math.cos(a) * rx * r, math.sin(a) * ry * r
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return pts


def cracks(d, rnd, cx, cy, r, count, col=(25, 25, 27)):
    for _ in range(count):
        a = rnd.uniform(0, 6.283)
        x, y = cx + math.cos(a) * r * 0.9, cy + math.sin(a) * r * 0.9
        for _ in range(rnd.randint(8, 22)):
            a += rnd.uniform(-0.5, 0.5)
            L = rnd.uniform(10, 28)
            nx, ny = x + math.cos(a) * L, y + math.sin(a) * L
            d.line([(x, y), (nx, ny)], fill=col, width=rnd.choice([2, 2, 3]))
            x, y = nx, ny


def mask_of(pts):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(14)).point(lambda v: 255 if v > 128 else 0)
    return m.filter(ImageFilter.GaussianBlur(1.2))


def vignette(img, rnd):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    k = 1 - np.clip(d - 0.5, 0, 1) * rnd.uniform(0.35, 0.6)
    a = np.asarray(img, np.float32) * k[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def pothole(seed):
    rnd = random.Random(seed)
    img = asphalt(rnd, base=rnd.randint(72, 105))
    d = ImageDraw.Draw(img)
    mode = rnd.choice(["lane", "curb", "none", "lane"])
    if mode == "lane":
        x0 = rnd.randint(80, 260)
        ln = Image.new("L", (W, H), 0)
        ImageDraw.Draw(ln).polygon([(x0, 0), (x0 + 28, 0), (x0 + 50, H), (x0 + 18, H)], fill=200)
        ln = ln.filter(ImageFilter.GaussianBlur(1.5))
        col = Image.new("RGB", (W, H), rnd.choice([(214, 205, 160), (205, 205, 200)]))
        col = Image.blend(col, asphalt(rnd, 140), 0.35)
        img.paste(col, (0, 0), ln.point(lambda v: int(v * 0.8)))
    elif mode == "curb":
        y0 = rnd.randint(40, 120)
        d.rectangle([0, 0, W, y0], fill=(150, 148, 142))
        d.rectangle([0, y0, W, y0 + 14], fill=(60, 60, 60))
    cx, cy = rnd.randint(480, 760), rnd.randint(400, 560)
    rx, ry = rnd.randint(110, 230), rnd.randint(75, 150)
    rot = rnd.uniform(-0.6, 0.6)
    d = ImageDraw.Draw(img)
    cracks(d, rnd, cx, cy, max(rx, ry), rnd.randint(5, 10))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    outer = blob(rnd, cx, cy, rx * 1.18, ry * 1.2, rot, jag=0.2)
    hole = blob(rnd, cx, cy, rx, ry, rot)
    rim = mask_of(outer).filter(ImageFilter.GaussianBlur(10))
    img = Image.composite(Image.new("RGB", (W, H), (38, 37, 38)), img, rim.point(lambda v: int(v * 0.55)))
    hm = mask_of(hole)
    pa = np.asarray(asphalt(rnd, 34, (2, 1, 0)), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    dd = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    pa *= (0.45 + 0.55 * np.clip(1 - dd, 0, 1))[..., None] + 0.25
    pit = Image.fromarray(pa.clip(0, 255).astype(np.uint8))
    img.paste(pit, (0, 0), hm.filter(ImageFilter.GaussianBlur(2.5)))
    sh = Image.new("L", (W, H), 0)
    sh.paste(hm, (0, 7))
    lipline = Image.fromarray((np.asarray(hm, np.int16) - np.asarray(sh, np.int16)).clip(0, 255).astype(np.uint8))
    lipline = lipline.filter(ImageFilter.GaussianBlur(3))
    img.paste(Image.new("RGB", (W, H), (150, 148, 142)), (0, 0), lipline.point(lambda v: int(v * 0.6)))
    zero = Image.new("L", (W, H), 0)
    if rnd.random() < 0.55:
        gl = Image.new("L", (W, H), 0)
        ImageDraw.Draw(gl).polygon(blob(rnd, cx + rx * 0.12, cy + ry * 0.35, rx * 0.65, ry * 0.4, rot, jag=0.25), fill=130)
        gl = Image.composite(gl.filter(ImageFilter.GaussianBlur(14)), zero, hm)
        img.paste(Image.new("RGB", (W, H), (120, 135, 150)), (0, 0), gl)
        sp = Image.new("L", (W, H), 0)
        ImageDraw.Draw(sp).ellipse([cx - rx * 0.3, cy - ry * 0.1, cx - rx * 0.05, cy + ry * 0.05], fill=150)
        img.paste(Image.new("RGB", (W, H), (225, 232, 240)), (0, 0), Image.composite(sp.filter(ImageFilter.GaussianBlur(6)), zero, hm))
    d = ImageDraw.Draw(img)
    for _ in range(rnd.randint(25, 60)):
        a = rnd.uniform(0, 6.283)
        r = rnd.uniform(0.9, 1.5)
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        s = rnd.randint(2, 8)
        v = rnd.randint(70, 150)
        d.ellipse([x, y, x + s, y + s], fill=(v, v, v - 4))
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    arr = np.asarray(img, np.float32) * np.array([rnd.uniform(0.98, 1.06), 1.0, rnd.uniform(0.93, 1.03)])
    return vignette(Image.fromarray(arr.clip(0, 255).astype(np.uint8)), rnd)


def after(seed):
    rnd = random.Random(seed + 500)
    img = asphalt(rnd, base=82)
    cx, cy = rnd.randint(500, 700), rnd.randint(420, 520)
    w, h = rnd.randint(340, 460), rnd.randint(240, 330)
    patch = asphalt(rnd, 58, (0, 0, 2)).crop((0, 0, w, h)).filter(ImageFilter.GaussianBlur(0.8))
    img.paste(patch, (cx - w // 2, cy - h // 2))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2
    d.rectangle([x0 - 2, y0 - 2, x1 + 2, y1 + 2], outline=(20, 20, 22), width=4)
    d.line([(x0 - 4, y1 + 4), (x1 + 4, y1 + 4)], fill=(120, 120, 118), width=2)
    cracks(d, rnd, cx, cy, max(w, h) * 0.8, 4)
    return vignette(img.filter(ImageFilter.GaussianBlur(0.5)), rnd)


def other(kind, seed):
    rnd = random.Random(seed)
    img = asphalt(rnd, 100)
    d = ImageDraw.Draw(img)
    if kind == "manhole":
        cx, cy, r = 600, 450, 200
        d.ellipse([cx - r - 14, cy - r * .8 - 14, cx + r + 14, cy + r * .8 + 14], fill=(40, 40, 40))
        d.ellipse([cx - r, cy - r * .8, cx + r, cy + r * .8], fill=(70, 66, 62), outline=(30, 30, 30), width=6)
        for k in range(-5, 6):
            d.line([(cx - r + 30, cy + k * 26), (cx + r - 30, cy + k * 26)], fill=(105, 100, 94), width=7)
        cracks(d, rnd, cx, cy, r, 6)
    elif kind == "sidewalk":
        img = asphalt(rnd, 170, (0, 0, 2))
        d = ImageDraw.Draw(img)
        for x in (0, 560, 1140):
            d.line([(x, 0), (x + 10, H)], fill=(80, 80, 80), width=5)
        d.line([(0, 420), (W, 440)], fill=(85, 85, 85), width=5)
        cracks(d, rnd, 700, 500, 160, 7, col=(40, 40, 42))
        d.polygon([(600, 430), (1190, 450), (1190, 520), (600, 500)], fill=(185, 185, 180))
        d.line([(600, 430), (1190, 450)], fill=(60, 60, 60), width=6)
    else:
        for _ in range(60):
            x, y = rnd.randint(250, 950), rnd.randint(250, 700)
            pts = [(x + rnd.randint(-40, 40), y + rnd.randint(-25, 25)) for _ in range(5)]
            v = rnd.randint(50, 170)
            d.polygon(pts, fill=(v, v - 8, v - 14), outline=(30, 30, 30))
    return vignette(img.filter(ImageFilter.GaussianBlur(0.7)), rnd)


def save(img, name):
    img.save(OUT / name, "JPEG", quality=80, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(1, 15):
        save(pothole(i * 17), f"pothole_{i:02d}.jpg")
    for i in range(1, 7):
        save(after(i * 13), f"after_{i:02d}.jpg")
    save(other("manhole", 3), "manhole_01.jpg")
    save(other("sidewalk", 4), "sidewalk_01.jpg")
    save(other("debris", 5), "debris_01.jpg")
