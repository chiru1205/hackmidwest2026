"""Category suggestion from a free-text note: Akamai embeddings (argmax cosine) with a keyword fallback."""
from __future__ import annotations

import re
from collections import OrderedDict

from backend.engine.semantic import cosine

from . import embed

CATEGORY_TEXT = {
    "pothole": ("A pothole in the road", "A big hole in the road surface that damages tires", "A crater or deep crack in the pavement where cars drive"),
    "streetlight_out": ("A streetlight is out", "The street light is broken or flickering and it is dark at night", "A lamp post with no light"),
    "traffic_signal": ("A traffic signal is broken", "The stoplight is dark, stuck on red or showing the wrong color", "A traffic light at the intersection is not working"),
    "sidewalk_damage": ("A broken sidewalk", "A cracked or lifted sidewalk slab that people trip on", "Damaged pavement on the footpath or curb"),
    "manhole_cover": ("A missing manhole cover", "A loose, sunken or noisy manhole lid in the street", "A storm drain grate is broken or missing"),
    "road_debris": ("Debris in the road", "Rocks, broken glass or an object blocking the lane", "Junk fallen onto the roadway that cars must swerve around"),
    "graffiti": ("Graffiti on a wall", "Spray paint vandalism on a sign or building", "Someone painted tags on public property"),
    "illegal_dumping": ("Illegal dumping", "Trash, a couch or a mattress dumped on the curb or in a lot", "Someone left appliances and garbage on the street"),
    "downed_tree": ("A fallen tree", "A big branch came down across the road or sidewalk", "A tree is blocking the street after the wind"),
    "flooding": ("Flooding on the street", "Standing water covering the road after rain", "A clogged storm drain and water everywhere"),
    "other": ("Some other city problem", "An infrastructure issue that fits no other category"),
}
KEYWORDS = {
    "pothole": ("pothole", "hole", "pit", "hole in the road", "hole in the street", "crater", "tire", "road hole", "big hole", "cracked road"),
    "streetlight_out": ("streetlight", "street light", "lamp", "light is out", "lights out", "dark at night", "flicker"),
    "traffic_signal": ("traffic light", "traffic signal", "stoplight", "stop light", "signal"),
    "sidewalk_damage": ("sidewalk", "pavement", "trip hazard", "curb"),
    "manhole_cover": ("manhole", "man hole", "grate", "storm drain cover", "sewer cover"),
    "road_debris": ("debris", "glass", "rocks", "tire in", "blocking the road", "object in the road"),
    "graffiti": ("graffiti", "spray paint", "vandal", "tagged"),
    "illegal_dumping": ("dump", "trash", "couch", "mattress", "garbage", "junk", "appliance", "furniture"),
    "downed_tree": ("tree", "branch", "limb", "fallen"),
    "flooding": ("flood", "standing water", "water on the", "clogged drain", "overflow", "puddle"),
}
MIN_LEN = 8
MIN_MARGIN = 0.03
MIN_SIM = 0.62
KEYWORD_BONUS = 0.06
_cat_vecs: dict[str, list[list[float]]] | None = None
_cache: "OrderedDict[str, dict]" = OrderedDict()


def keyword_category(text: str) -> tuple[str, float]:
    t = text.lower()
    best, hits = "other", 0
    for cat, words in KEYWORDS.items():
        n = sum(1 for w in words if re.search(r"\b" + re.escape(w), t))
        if n > hits:
            best, hits = cat, n
    return (best, min(0.8, 0.5 + 0.15 * hits)) if hits else ("other", 0.2)


async def _category_vectors() -> dict[str, list[list[float]]] | None:
    global _cat_vecs
    if _cat_vecs is None:
        flat = [(c, t) for c, ts in CATEGORY_TEXT.items() for t in ts]
        vecs = await embed.embed([t for _, t in flat])
        if vecs is None:
            return None
        out: dict[str, list[list[float]]] = {}
        for (c, _), v in zip(flat, vecs):
            out.setdefault(c, []).append(v)
        _cat_vecs = out
    return _cat_vecs


async def suggest(text: str) -> dict:
    text = (text or "").strip()[:300]
    if not text:
        return {"category": "other", "confidence": 0.0, "source": "keywords"}
    key = text.lower()
    if key in _cache:
        return _cache[key]
    out = None
    if len(text) >= MIN_LEN:
        cv = await _category_vectors()
        nv = await embed.embed([text]) if cv else None
        if cv and nv:
            kw_cat, kw_conf = keyword_category(text)
            rows = []
            for c, vs in cv.items():
                if c != "other":
                    raw = max(cosine(nv[0], v) for v in vs)
                    rows.append((raw + (KEYWORD_BONUS if c == kw_cat and kw_conf > 0.2 else 0.0), raw, c))
            rows.sort(reverse=True)
            (b1, r1, c1), (b2, r2, _) = rows[0], rows[1]
            if b1 >= MIN_SIM and b1 - b2 >= MIN_MARGIN:
                conf = max(0.0, min(0.97, 0.3 + (r1 - r2) * 4 + (r1 - 0.55) * 2 + (0.15 if c1 == kw_cat else 0.0)))
                out = {"category": c1, "confidence": round(conf, 2), "source": "akamai-embedding"}
    if out is None:
        c, conf = keyword_category(text)
        out = {"category": c, "confidence": conf if len(text) >= MIN_LEN else 0.0, "source": "keywords"}
    # only cache results from embeddings or short/keyword paths when embeddings are off (avoid caching transient failures)
    if out["source"] == "akamai-embedding" or not embed.enabled() or len(text) < MIN_LEN:
        _cache[key] = out
        while len(_cache) > 500:
            _cache.popitem(last=False)
    return out
