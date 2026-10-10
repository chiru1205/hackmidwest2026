"""Generate procedural placeholder photos into data/photos/seed (run once)."""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

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


# ---------------------------------------------------------------- other issue types
def fnoise(g, s, amp):
    n = g.normal(0, 1, (H // s + 2, W // s + 2)).astype(np.float32)
    im = Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return (np.asarray(im, np.float32) - 128) / 40 * amp


def grad(top, bot, y0=0, y1=H):
    t = np.clip((np.arange(H, dtype=np.float32) - y0) / max(1, y1 - y0), 0, 1)[:, None, None]
    return np.array(top, np.float32) * (1 - t) + np.array(bot, np.float32) * t + np.zeros((H, W, 3), np.float32)


def to_img(a):
    return Image.fromarray(np.asarray(a).clip(0, 255).astype(np.uint8))


def glow(a, x, y, r, col, k=1.0):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.exp(-(((xx - x) ** 2 + (yy - y) ** 2) / (2 * r * r))).astype(np.float32)
    a += d[..., None] * np.array(col, np.float32) * k
    return a


def grain(img, rnd, amt=5):
    g = np.random.default_rng(rnd.randint(0, 10**6))
    a = np.asarray(img, np.float32) + g.normal(0, amt, (H, W, 1))
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def skyline(d, rnd, y, col, lit=0):
    x = -20
    while x < W:
        w = rnd.randint(50, 140)
        h = rnd.randint(30, 110)
        d.rectangle([x, y - h, x + w, y + 40], fill=col)
        if rnd.random() < 0.5:
            d.polygon([(x - 4, y - h), (x + w // 2, y - h - rnd.randint(20, 50)), (x + w + 4, y - h)], fill=col)
        for _ in range(lit):
            if rnd.random() < 0.5:
                wx, wy = x + rnd.randint(6, max(7, w - 14)), y - rnd.randint(10, max(11, h - 6))
                d.rectangle([wx, wy, wx + 8, wy + 10], fill=(235, 190, 110))
        x += w + rnd.randint(-10, 30)
    for _ in range(14):
        tx, tr = rnd.randint(0, W), rnd.randint(40, 90)
        d.ellipse([tx - tr, y - tr * 1.5, tx + tr, y + 10], fill=col)


def road_persp(img, rnd, y0, base=52, lines=True):
    a = np.asarray(img, np.float32)
    road = np.asarray(asphalt(rnd, base), np.float32)
    a[y0:] = road[y0:]
    img = to_img(a)
    if lines:
        d = ImageDraw.Draw(img)
        vx = W * 0.5
        for k in range(6):
            t0, t1 = k / 6, (k + 0.55) / 6
            ya, yb = y0 + (H - y0) * t0 ** 1.6, y0 + (H - y0) * t1 ** 1.6
            wa, wb = 2 + 22 * t0 ** 1.6, 2 + 22 * t1 ** 1.6
            d.polygon([(vx - wa, ya), (vx + wa, ya), (vx + wb, yb), (vx - wb, yb)], fill=(196, 186, 120))
    return img


def streetlight(seed):
    rnd = random.Random(seed)
    a = grad((14, 20, 46), (212, 126, 84), 0, 430)
    a[430:] = (60, 56, 58)
    img = to_img(a)
    d = ImageDraw.Draw(img)
    skyline(d, rnd, 430, (14, 15, 22), lit=2)
    img = road_persp(img, rnd, 430, base=44)
    a = np.asarray(img, np.float32)
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(W * 0.62, 430), (W, 430), (W, H), (W * 0.9, H)], fill=255)
    side = np.asarray(asphalt(rnd, 78, (0, 0, 4)), np.float32)
    mk = (np.asarray(m, np.float32) / 255)[..., None]
    a = a * (1 - mk) + side * mk
    lamps = [(790, 470, 0.22), (730, 520, 0.34), (640, 440, 0.12)]
    for lx, ly, sc in lamps:
        a = glow(a, lx - 30 * sc, ly - 150 * sc, 60 * sc + 18, (255, 190, 110), 0.9)
        a = glow(a, lx, ly + 20 * sc, 40 * sc + 40, (230, 160, 80), 0.25)
    img = to_img(a)
    d = ImageDraw.Draw(img)
    for lx, ly, sc in lamps:
        d.line([(lx, ly + 10), (lx, ly - 160 * sc * 2.2)], fill=(10, 10, 14), width=max(2, int(9 * sc)))
        d.line([(lx, ly - 160 * sc * 2.2), (lx - 40 * sc * 2, ly - 160 * sc * 2.2 - 8 * sc)], fill=(10, 10, 14), width=max(2, int(7 * sc)))
    px = rnd.randint(820, 940)
    d.polygon([(px - 15, H - 60), (px + 15, H - 60), (px + 7, 120), (px - 7, 120)], fill=(22, 23, 28))
    d.line([(px, 130), (px - 170, 96)], fill=(22, 23, 28), width=11)
    d.rounded_rectangle([px - 262, 78, px - 150, 116], radius=16, fill=(30, 31, 36))
    d.rounded_rectangle([px - 252, 106, px - 160, 118], radius=6, fill=(46, 48, 52))
    d.ellipse([px - 24, H - 90, px + 24, H - 50], fill=(18, 18, 22))
    img = img.filter(ImageFilter.GaussianBlur(0.9))
    return grain(vignette(img, rnd), rnd, 4)


def traffic_signal(seed):
    rnd = random.Random(seed)
    a = grad((16, 22, 48), (200, 120, 90), 0, 600)
    img = to_img(a)
    d = ImageDraw.Draw(img)
    skyline(d, rnd, 620, (12, 13, 20), lit=2)
    d.rectangle([0, 620, W, H], fill=(36, 36, 40))
    d.line([(120, 150), (W, 150)], fill=(12, 12, 15), width=14)
    d.line([(120, 150), (120, H)], fill=(12, 12, 15), width=26)
    for x in (480, 800):
        d.line([(x, 150), (x, 190)], fill=(12, 12, 15), width=6)
        d.rounded_rectangle([x - 52, 190, x + 52, 470], radius=14, fill=(24, 25, 28), outline=(60, 60, 64), width=4)
        for cy in (250, 330, 410):
            d.ellipse([x - 34, cy - 34, x + 34, cy + 34], fill=(8, 8, 10), outline=(40, 40, 44), width=3)
            d.arc([x - 28, cy - 28, x + 28, cy + 28], 200, 260, fill=(70, 72, 78), width=3)
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    return grain(vignette(img, rnd), rnd, 4)


def flooding(seed):
    rnd = random.Random(seed)
    g = np.random.default_rng(seed)
    a = grad((150, 160, 172), (212, 216, 220), 0, 330)
    img = to_img(a)
    d = ImageDraw.Draw(img)
    skyline(d, rnd, 360, (84, 96, 80))
    d.rectangle([0, 380, W, 420], fill=(96, 104, 92))
    img = road_persp(img, rnd, 400, base=92, lines=False)
    d = ImageDraw.Draw(img)
    d.polygon([(0, 400), (330, 400), (120, H), (0, H)], fill=(150, 148, 142))
    d.polygon([(318, 400), (336, 400), (136, H), (118, H)], fill=(110, 108, 104))
    d.rectangle([860, 250, 874, 440], fill=(90, 90, 92))
    d.rectangle([826, 250, 908, 290], fill=(200, 60, 52))
    d.polygon([(0, 300), (0, 400), (220, 400)], fill=(70, 88, 60))
    wl = rnd.randint(425, 450)
    a = np.asarray(img, np.float32)
    out = a.copy()
    yy = np.arange(wl, H)
    src = np.clip(2 * wl - yy, 0, H - 1)
    shift = (np.sin(yy / 9.0) * (2 + (yy - wl) / 60.0) + g.normal(0, 1.2, len(yy))).astype(int)
    for i, y in enumerate(yy):
        out[y] = np.roll(a[src[i]], shift[i], axis=0)
    mud = np.array([104, 100, 88], np.float32)
    t = np.clip((yy - wl) / 300.0, 0.28, 0.6)[:, None, None]
    out[wl:] = out[wl:] * (1 - t) + mud * t
    out[wl:] += fnoise(g, 3, 5)[wl:, :, None] + fnoise(g, 40, 7)[wl:, :, None]
    edge = Image.new("L", (W, H), 0)
    pts = [(x, wl + int(math.sin(x / 70.0) * 14 + rnd.uniform(-8, 8))) for x in range(0, W + 40, 40)]
    ImageDraw.Draw(edge).polygon(pts + [(W, H), (0, H)], fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(2.5))
    em = (np.asarray(edge, np.float32) / 255)[..., None]
    a = a * (1 - em) + out * em
    img = to_img(a)
    d = ImageDraw.Draw(img)
    for _ in range(90):
        x, y = rnd.randint(150, W), rnd.randint(wl + 20, H - 10)
        w = rnd.randint(30, 150)
        v = rnd.randint(190, 235)
        d.line([(x, y), (x + w, y + rnd.randint(-2, 2))], fill=(v, v, v), width=rnd.choice([1, 1, 2]))
    for _ in range(4):
        cx, cy = rnd.randint(300, 1000), rnd.randint(wl + 80, H - 60)
        for r in (14, 30, 52):
            d.ellipse([cx - r * 2, cy - r * 0.6, cx + r * 2, cy + r * 0.6], outline=(205, 205, 205), width=1)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    d = ImageDraw.Draw(img)
    for _ in range(160):
        x, y = rnd.randint(0, W), rnd.randint(0, wl)
        d.line([(x, y), (x - 4, y + 22)], fill=(222, 226, 232), width=1)
    return grain(vignette(img, rnd), rnd, 3)


def dumping(seed):
    rnd = random.Random(seed)
    g = np.random.default_rng(seed)
    a = grad((160, 176, 190), (150, 160, 150), 0, 220)
    a[220:] = (84, 108, 52)
    a += fnoise(g, 4, 10)[..., None] * np.array([0.8, 1, 0.6]) + fnoise(g, 60, 12)[..., None] * np.array([1, 0.8, 0.2])
    img = to_img(a)
    d = ImageDraw.Draw(img)
    for _ in range(12):
        tx, tr = rnd.randint(0, W), rnd.randint(60, 130)
        d.ellipse([tx - tr, 70 - tr * .4, tx + tr, 230], fill=(rnd.randint(38, 60), rnd.randint(72, 96), rnd.randint(34, 50)))
    d.rectangle([0, 215, W, 232], fill=(110, 112, 108))
    for x in range(0, W, 46):
        d.line([(x, 232), (x, 330)], fill=(120, 124, 120), width=2)
    d.rectangle([0, 700, W, H], fill=(68, 68, 72))
    d.rectangle([0, 668, W, 706], fill=(160, 158, 150))
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    base = img.convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("L", (W, H), 0)

    def item(draw_fn, cx, cy, w, h):
        ImageDraw.Draw(shadow).ellipse([cx - w * .6, cy + h * .25, cx + w * .6, cy + h * .7], fill=150)
        draw_fn(ImageDraw.Draw(layer), cx, cy, w, h)

    def bag(dr, cx, cy, w, h):
        col = rnd.choice([(26, 26, 30), (34, 34, 40), (22, 24, 28), (44, 60, 52)])
        dr.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=col + (255,))
        dr.polygon([(cx - 8, cy - h / 2 + 8), (cx + 3, cy - h / 2 - 14), (cx + 10, cy - h / 2 + 8)], fill=col + (255,))
        dr.ellipse([cx - w * .28, cy - h * .32, cx - w * .02, cy - h * .08], fill=(95, 98, 108, 200))
        dr.arc([cx - w * .4, cy - h * .1, cx + w * .35, cy + h * .4], 10, 160, fill=(70, 72, 80, 255), width=2)

    def box(dr, cx, cy, w, h):
        dr.polygon([(cx - w / 2, cy - h / 3), (cx + w / 2, cy - h / 2), (cx + w / 2 + 10, cy + h / 2), (cx - w / 2 + 6, cy + h / 2 + 8)], fill=(170, 132, 88, 255), outline=(110, 82, 50, 255))
        dr.line([(cx - w / 2, cy - h / 8), (cx + w / 2 + 4, cy - h / 7)], fill=(205, 175, 120, 255), width=8)

    def mattress(dr, cx, cy, w, h):
        pts = [(cx - w / 2, cy - h / 2 + 30), (cx + w / 2, cy - h / 2), (cx + w / 2 + 30, cy + h / 2 - 10), (cx - w / 2 + 20, cy + h / 2 + 30)]
        dr.polygon(pts, fill=(212, 206, 190, 255), outline=(150, 144, 128, 255))
        for k in range(1, 6):
            t = k / 6
            dr.line([(cx - w / 2 + 20 * t, cy - h / 2 + 30 + h * t), (cx + w / 2 + 30 * t, cy - h / 2 + (h - 10) * t)], fill=(168, 164, 180, 255), width=2)
        for gx in range(5):
            for gy in range(3):
                x0, y0 = cx - w / 3 + gx * w / 6, cy - h / 6 + gy * h / 4
                dr.ellipse([x0, y0, x0 + 8, y0 + 8], fill=(150, 146, 160, 255))

    def tire(dr, cx, cy, w, h):
        dr.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=(18, 18, 20, 255))
        dr.ellipse([cx - w / 4, cy - h / 4, cx + w / 4, cy + h / 4], fill=(72, 70, 66, 255))

    def chair(dr, cx, cy, w, h):
        dr.rectangle([cx - w / 2, cy - h / 6, cx + w / 2, cy + h / 8], fill=(120, 74, 52, 255))
        dr.rectangle([cx - w / 2, cy - h / 2, cx - w / 2 + 14, cy], fill=(110, 66, 46, 255))
        for dx in (-w / 2 + 4, w / 2 - 18):
            dr.rectangle([cx + dx, cy + h / 8, cx + dx + 12, cy + h / 2], fill=(96, 58, 40, 255))

    cx0, cy0 = rnd.randint(520, 680), rnd.randint(520, 580)
    item(mattress, cx0 - 20, cy0 - 40, 330, 120)
    for _ in range(6):
        item(box, cx0 + rnd.randint(-250, 250), cy0 + rnd.randint(-70, 60), rnd.randint(110, 170), rnd.randint(90, 130))
    item(chair, cx0 + 220, cy0 + 40, 100, 110)
    item(tire, cx0 - 280, cy0 + 90, 140, 90)
    for _ in range(11):
        item(bag, cx0 + rnd.randint(-260, 260), cy0 + rnd.randint(0, 120), rnd.randint(110, 170), rnd.randint(90, 130))
    sh = shadow.filter(ImageFilter.GaussianBlur(18))
    base = Image.composite(Image.new("RGBA", (W, H), (20, 24, 12, 255)), base, sh.point(lambda v: int(v * 0.55)))
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.7)))
    img = base.convert("RGB")
    d = ImageDraw.Draw(img)
    for _ in range(300):
        x, y = rnd.randint(0, W), rnd.randint(560, 700)
        d.line([(x, y), (x + rnd.randint(-5, 5), y - rnd.randint(8, 26))], fill=(60, 96, 40), width=2)
    return grain(vignette(img, rnd), rnd, 4)


def downed_tree(seed):
    rnd = random.Random(seed)
    g = np.random.default_rng(seed)
    a = grad((176, 188, 198), (150, 160, 150), 0, 250)
    a[250:] = (82, 106, 54)
    a += fnoise(g, 5, 9)[..., None]
    img = to_img(a)
    d = ImageDraw.Draw(img)
    for _ in range(10):
        tx, tr = rnd.randint(0, W), rnd.randint(70, 140)
        d.ellipse([tx - tr, 80 - tr * .4, tx + tr, 300], fill=(rnd.randint(40, 60), rnd.randint(78, 100), rnd.randint(36, 50)))
    img = road_persp(img, rnd, 420, base=84, lines=False)
    d = ImageDraw.Draw(img)
    d.polygon([(0, 420), (W, 420), (W, 470), (0, 440)], fill=(150, 148, 142))
    y_l, y_r = rnd.randint(640, 700), rnd.randint(470, 540)
    th_l, th_r = rnd.randint(150, 190), rnd.randint(90, 120)
    trunk = Image.new("L", (W, H), 0)
    ImageDraw.Draw(trunk).polygon([(-40, y_l - th_l / 2), (W + 40, y_r - th_r / 2), (W + 40, y_r + th_r / 2), (-40, y_l + th_l / 2)], fill=255)
    sh = Image.new("L", (W, H), 0)
    sh.paste(trunk, (14, 46))
    img = Image.composite(Image.new("RGB", (W, H), (22, 22, 24)), img, sh.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.6)))
    bark = np.zeros((H, W, 3), np.float32) + (84, 62, 44)
    bark += fnoise(g, 2, 14)[..., None] + np.stack([fnoise(g, 90, 22)] * 3, -1) * np.array([1, .8, .6])
    tilt = (y_r - y_l) / W
    yy, xx = np.mgrid[0:H, 0:W]
    u = (yy - (y_l + tilt * xx))
    bark += (np.sin(u / 4.5 + fnoise(g, 30, 3)) * 12)[..., None]
    shade = np.clip(1 - np.abs(u) / (np.interp(xx, [0, W], [th_l, th_r]) / 2 + 1), 0, 1)
    bark *= (0.55 + 0.6 * np.sqrt(shade))[..., None]
    img = Image.composite(to_img(bark), img, trunk.filter(ImageFilter.GaussianBlur(1.0)))
    d = ImageDraw.Draw(img)
    for _ in range(9):
        bx = rnd.randint(120, 700)
        by = y_l + tilt * bx
        ang = rnd.uniform(-2.9, -0.3)
        ln = rnd.randint(130, 300)
        ex, ey = bx + math.cos(ang) * ln, by + math.sin(ang) * ln
        d.line([(bx, by), (ex, ey)], fill=(70, 50, 36), width=rnd.randint(8, 18))
        for _ in range(rnd.randint(5, 9)):
            t = rnd.uniform(0.4, 1.0)
            px_, py_ = bx + (ex - bx) * t, by + (ey - by) * t
            a2 = ang + rnd.uniform(-1, 1)
            d.line([(px_, py_), (px_ + math.cos(a2) * 70, py_ + math.sin(a2) * 70)], fill=(74, 54, 38), width=4)
    for _ in range(4200):
        cxl = rnd.gauss(330, 230)
        cyl = rnd.gauss(y_l + tilt * 330 - 40, 120)
        r = rnd.randint(5, 10)
        k = rnd.uniform(0.55, 1.0)
        d.ellipse([cxl - r, cyl - r * .6, cxl + r, cyl + r * .6], fill=(int(70 * k), int(128 * k), int(36 * k)))
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    return grain(vignette(img, rnd), rnd, 4)


def graffiti(seed):
    rnd = random.Random(seed)
    g = np.random.default_rng(seed)
    a = np.zeros((H, W, 3), np.float32) + (150, 142, 134)
    a += fnoise(g, 2, 8)[..., None] + fnoise(g, 70, 14)[..., None]
    img = to_img(a)
    d = ImageDraw.Draw(img)
    bh, bw = 26, 78
    for row in range(0, 760 // bh + 1):
        y = row * bh
        off = (bw // 2) if row % 2 else 0
        for x in range(-bw, W + bw, bw):
            v = rnd.randint(-14, 14)
            d.rectangle([x + off + 2, y + 2, x + off + bw - 2, y + bh - 2], fill=(150 + v, 82 + v // 2, 66 + v // 2))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 230)
        font2 = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 110)
        fsz = (230, 110)
    except Exception:
        font = font2 = ImageFont.load_default()
        fsz = (12, 12)
    paint = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(paint)
    words = rnd.sample(["KCK", "ZEKE", "RAE", "OMEN", "SKUL", "NOVA", "DREAM"], 2)
    pals = [((250, 214, 40), (30, 30, 120)), ((60, 220, 200), (120, 20, 120)), ((250, 90, 150), (20, 20, 20)), ((120, 230, 70), (20, 60, 20))]
    spots = [(rnd.randint(60, 320), rnd.randint(70, 180), font, fsz[0]), (rnd.randint(400, 640), rnd.randint(330, 430), font2, fsz[1])]
    for txt, (fx, fy, f, sz), (fill, edge) in zip(words, spots, rnd.sample(pals, 2)):
        for ox, oy in [(8, 8), (-5, 6), (6, -5), (0, 10), (10, 0), (-6, -4)]:
            pd.text((fx + ox, fy + oy), txt, font=f, fill=edge + (255,))
        pd.text((fx, fy), txt, font=f, fill=fill + (255,))
        tw = int(pd.textlength(txt, font=f))
        for _ in range(7):
            dx = fx + rnd.randint(6, max(7, tw - 6))
            y0 = fy + sz * 1.15
            pd.line([(dx, y0), (dx + rnd.randint(-1, 1), y0 + rnd.randint(20, 90))], fill=fill + (255,), width=rnd.randint(3, 5))
    for _ in range(3):
        x, y = rnd.randint(720, 900), rnd.randint(260, 560)
        pts = [(x + i * 9, y + math.sin(i * 0.5) * 30 + math.sin(i * 1.9) * 8) for i in range(30)]
        pd.line(pts, fill=rnd.choice([(20, 20, 20, 255), (240, 240, 240, 255), (60, 120, 250, 255)]), width=12, joint="curve")
    paint = paint.filter(ImageFilter.GaussianBlur(1.3))
    base = img.convert("RGBA")
    base.alpha_composite(paint)
    img = base.convert("RGB")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 770, W, H], fill=(104, 104, 106))
    d.rectangle([60, 700, 760, 726], fill=(78, 82, 84))
    for x in (90, 400, 720):
        d.rectangle([x, 726, x + 16, 790], fill=(60, 62, 64))
    d.rectangle([1100, 150, 1116, 780], fill=(120, 124, 128))
    d.rectangle([1060, 130, 1160, 230], fill=(34, 90, 160))
    d.rectangle([1072, 142, 1148, 160], fill=(240, 240, 240))
    d.rectangle([0, 0, W, 34], fill=(60, 64, 66))
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    return grain(vignette(img, rnd), rnd, 4)


def sidewalk_lifted(seed):
    rnd = random.Random(seed)
    g = np.random.default_rng(seed)
    a = np.zeros((H, W, 3), np.float32) + (176, 174, 168)
    a += fnoise(g, 2, 7)[..., None] + fnoise(g, 60, 9)[..., None]
    a[:200] = (86, 112, 58) + fnoise(g, 4, 10)[:200, :, None]
    a[760:] = (70, 70, 74)
    img = to_img(a)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 740, W, 770], fill=(150, 148, 142))
    for x in (0, 400, 800, 1200):
        d.line([(x, 200), (x + 8, 740)], fill=(70, 70, 72), width=5)
    d.line([(0, 470), (W, 482)], fill=(80, 80, 82), width=5)
    sl = [(408, 482), (800, 486), (800, 740), (416, 736)]
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).polygon([(p[0] - 8, p[1] + 30) for p in sl], fill=190)
    img = Image.composite(Image.new("RGB", (W, H), (30, 28, 26)), img, sh.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .7)))
    d = ImageDraw.Draw(img)
    d.polygon([(400, 482), (408, 462), (800, 466), (800, 486), (408, 482)], fill=(206, 204, 198))
    d.polygon([(400, 482), (412, 466), (412, 740), (400, 740)], fill=(52, 50, 48))
    d.polygon([(412, 466), (800, 470), (800, 722), (420, 726)], fill=(188, 186, 180), outline=(90, 90, 90))
    cracks(d, rnd, 620, 600, 120, 4, col=(60, 60, 62))
    cracks(d, rnd, 150, 600, 90, 3, col=(60, 60, 62))
    d.ellipse([-80, 400, 150, 560], fill=(94, 76, 56))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    return grain(vignette(img, rnd), rnd, 3)



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
    for i in range(1, 4):
        save(streetlight(100 + i * 7), f"streetlight_{i:02d}.jpg")
        save(flooding(200 + i * 5), f"flooding_{i:02d}.jpg")
        save(dumping(300 + i * 9), f"dumping_{i:02d}.jpg")
    for i in range(1, 3):
        save(downed_tree(400 + i * 11), f"tree_{i:02d}.jpg")
        save(graffiti(500 + i * 3), f"graffiti_{i:02d}.jpg")
    save(sidewalk_lifted(600), "sidewalk_02.jpg")
    save(traffic_signal(700), "signal_01.jpg")
