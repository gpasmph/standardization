"""Turn one product page into attribute values, each with the quote it came from.

No guessing: a value is returned only when the page itself shows it. Pure functions, so they can be tested without a network.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass


@dataclass
class Hit:
    column: str
    value: str
    quote: str


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _quote(text: str, start: int, end: int, pad: int = 60) -> str:
    """A short quote: the line the match is on, or a window around it cut at word boundaries."""
    ls = text.rfind("\n", 0, start) + 1
    le = text.find("\n", end)
    le = len(text) if le < 0 else le
    if le - ls <= 160:
        return _clean(text[ls:le])
    a, b = max(0, start - pad), min(len(text), end + pad)
    seg = text[a:b]
    if a > 0 and " " in seg:
        seg = seg.split(" ", 1)[1]
    if b < len(text) and " " in seg:
        seg = seg.rsplit(" ", 1)[0]
    return _clean(seg)


def product_window(text: str, heading: str, size: int = 5000) -> str:
    """Page menus and footers sit around the product. Start reading at the product heading, so a menu item
    like "Disposable Supplies" is never mistaken for a fact about this item."""
    h = _clean(heading)
    if h:
        i = text.find(h)
        if i >= 0:
            return text[i:i + size]
    return text[:size]


def unclear(text: str, end: int) -> bool:
    """"sterile or clean-packed depending on supplier" is not a statement of fact."""
    after = text[end:end + 30].lower()
    return after.lstrip().startswith(("or ", "/", "depending")) or "depending" in after


def _jsonld_products(blocks: list[str]) -> list[dict]:
    out: list[dict] = []

    def walk(node: object) -> None:
        if isinstance(node, list):
            for n in node:
                walk(n)
        elif isinstance(node, dict):
            t = node.get("@type")
            if t == "Product" or (isinstance(t, list) and "Product" in t):
                out.append(node)
            for v in node.values():
                if isinstance(v, (list, dict)):
                    walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except (ValueError, TypeError):
            continue
    return out


def _name(v: object) -> str:
    if isinstance(v, dict):
        return _clean(str(v.get("name", "")))
    return _clean(str(v or ""))


def from_structured(blocks: list[str]) -> tuple[str, list[Hit]]:
    """schema.org Product data: brand, maker, part number, material, colour."""
    product = ""
    hits: list[Hit] = []
    for p in _jsonld_products(blocks):
        product = product or _clean(str(p.get("name", "")))
        pairs = [
            ("ITEM BRAND/MODEL", _name(p.get("brand")), "brand"),
            ("MANUFACTURER", _name(p.get("manufacturer")), "manufacturer"),
            ("MANUFACTURE ITEM CODE", _clean(str(p.get("mpn") or p.get("sku") or "")), "mpn"),
            ("MATERIAL/COMPOSITION (1)", _name(p.get("material")), "material"),
            ("COLOR", _name(p.get("color")), "color"),
        ]
        for col, val, key in pairs:
            if val:
                hits.append(Hit(col, val, f'"{key}": "{val}"'))
        if hits:
            break
    return product, hits


UNSPSC_RX = re.compile(r"\bUNSPSC\b[^0-9\n]{0,25}(\d{8})\b", re.I)
GAUGE = re.compile(r"\b(\d{2})\s?G(?:auge)?\b", re.I)
LENGTH = re.compile(r"\b(\d+(?:\.\d+)?)\s?(mm|cm)\b", re.I)
FACTS: list[tuple[str, re.Pattern[str], str]] = [
    ("STERILE/NON STERILE", re.compile(r"\bnon[\s-]?sterile\b", re.I), "NON STERILE"),
    ("STERILE/NON STERILE", re.compile(r"\bsterile\b", re.I), "STERILE"),
    ("LATEX FREE/LATEX", re.compile(r"\blatex[\s-]?free\b", re.I), "LATEX FREE"),
    ("DISPOSABLE/REUSABLE", re.compile(r"\b(?:single[\s-]?use|disposable)\b", re.I), "DISPOSABLE"),
    ("DISPOSABLE/REUSABLE", re.compile(r"\breusable\b", re.I), "REUSABLE"),
]


LABELS: list[tuple[str, str]] = [
    ("MATERIAL/COMPOSITION (1)", r"materials?|composition|made of|made from"),
    ("COLOR", r"colou?rs?"),
    ("SHAPE", r"shape"),
    ("DIAMETER", r"(?:outer |inner |tube |od |id )?diameter"),
    ("ANGLE", r"angle"),
    ("NO. OF ITEMS", r"(?:pack(?:ag(?:e|ing)|ing)? (?:size|quantity)|quantity per (?:box|pack)|units? per (?:box|pack|case)|qty(?:\s*/\s*(?:box|pack))?|pcs\s*/\s*(?:box|pack|bx))"),
    ("LENGTH (1)", r"(?:overall |working |tube |catheter )?length"),
    ("DIMENSION/SIZE (1)", r"sizes?|dimensions?"),
]
LABEL_RX = [(col, re.compile(rf"^\W*(?:{lab})\s*[:\-\u2013]\s*(.{{1,60}}?)\s*$", re.I)) for col, lab in LABELS]


def from_labels(text: str) -> list[Hit]:
    """Spec lines such as "Material: PVC" or "Color: Blue". The whole line is the quote."""
    hits: dict[str, Hit] = {}
    for line in text.splitlines()[:400]:
        line = line.strip()
        if len(line) > 90:
            continue
        for col, rx in LABEL_RX:
            if col in hits:
                continue
            m = rx.match(line)
            if not m:
                continue
            v = _clean(m.group(1))
            if not v or len(v.split()) > 8 or re.search(r"https?://|@", v):
                continue
            if col == "NO. OF ITEMS":
                n = re.search(r"\d+", v)
                if not n:
                    continue
                v = n.group(0)
            hits[col] = Hit(col, v.upper(), line)
    return list(hits.values())


def from_text(text: str, description: str) -> list[Hit]:
    """Facts stated in the page text. Sizes are only taken when the hospital description names the same size,
    so a random "20 mm" elsewhere on the page is never picked up."""
    hits: list[Hit] = from_labels(text[:20000])
    m = UNSPSC_RX.search(text)
    if m:  # supplier pages often print the code; it is checked against the official UNSPSC list in the portal
        hits.append(Hit("UNSPSC", m.group(1), _quote(text, m.start(), m.end())))
    seen: set[str] = set()
    head = text
    for col, rx, val in FACTS:
        if col in seen:
            continue
        m = next((x for x in rx.finditer(head) if not unclear(head, x.end())), None)
        if m:
            seen.add(col)
            hits.append(Hit(col, val, _quote(head, m.start(), m.end())))
    want_g = {m.group(1) for m in GAUGE.finditer(description)}
    for m in GAUGE.finditer(head):
        if m.group(1) in want_g:
            hits.append(Hit("DIMENSION/SIZE (1)", f"{m.group(1)}G", _quote(head, m.start(), m.end())))
            break
    want_l = {(m.group(1), m.group(2).lower()) for m in LENGTH.finditer(description)}
    for m in LENGTH.finditer(head):
        if (m.group(1), m.group(2).lower()) in want_l:
            hits.append(Hit("LENGTH (1)", f"{m.group(1)}{m.group(2).upper()}", _quote(head, m.start(), m.end())))
            break
    return hits


def extract(text: str, ld_blocks: list[str], title: str, description: str, columns: list[str], heading: str = "") -> tuple[str, list[Hit]]:
    product, hits = from_structured(ld_blocks)
    hits += from_text(product_window(text, heading or product or title), description)
    allowed = set(columns) if columns else None
    keep: dict[str, Hit] = {}
    for h in hits:
        if (allowed is None or h.column in allowed) and h.column not in keep:
            keep[h.column] = h
    return product or _clean(title), list(keep.values())


# ---------- how well does this page match the hospital item? ----------

STOP = {"THE", "AND", "FOR", "WITH", "OF", "PCS", "PC", "BOX", "BX", "PACK", "SET", "NEW", "ITEM", "SIZE", "TYPE", "SUPPLIER"}
AGE = [{"ADULT", "ADULTS"}, {"PEDIATRIC", "PEDIA", "PAEDIATRIC", "CHILD"}, {"INFANT"}, {"NEONATE", "NEONATAL", "NEO"}]


def tokens(s: str) -> list[str]:
    out: list[str] = []
    for t in re.findall(r"[A-Z0-9][A-Z0-9./-]*", s.upper()):
        t = t.strip(".-/")
        if len(t) >= 3 and t not in STOP and t not in out:
            out.append(t)
    return out


def _has(page_upper: str, tok: str) -> bool:
    return re.search(rf"(?<![A-Z0-9]){re.escape(tok)}(?![A-Z0-9])", page_upper) is not None


def _near(a: str, b: str) -> bool:
    """Same word allowing one typo (only for words of 6+ letters): CANULA ~ CANNULA."""
    if a == b:
        return True
    if len(a) < 6 or len(b) < 6 or abs(len(a) - len(b)) > 1:
        return False
    i = 0
    while i < len(a) and i < len(b) and a[i] == b[i]:
        i += 1
    x, y = a[i:], b[i:]
    return x[1:] == y or x == y[1:] or x[1:] == y[1:]


def _mentions(page_upper: str, words: set[str], tok: str) -> bool:
    return _has(page_upper, tok) or (len(tok) >= 6 and any(_near(tok, w) for w in words))


def score(description: str, title_text: str, page_text: str, hits: list[Hit]) -> tuple[float, str, list[str]]:
    """0..1 score, High/Medium/Low, and plain-language remarks saying why."""
    toks = tokens(description)
    page = page_text.upper()
    words = set(re.findall(r"[A-Z0-9]{6,}", page[:20000]))
    remarks: list[str] = []
    if not toks:
        return 0.0, "Low", ["The hospital description has no usable words to compare."]
    found = [t for t in toks if _mentions(page, words, t)]
    missing = [t for t in toks if t not in found]
    title_up = title_text.upper()
    title_words = set(re.findall(r"[A-Z0-9]{6,}", title_up))
    in_title = [t for t in toks if _mentions(title_up, title_words, t)]
    # the product's own title counts most: a page that merely mentions the words in a menu or a "related items" list should not win
    s = 0.6 * len(in_title) / len(toks) + 0.4 * len(found) / len(toks)
    remarks.append(f"{len(in_title)} of {len(toks)} words from the hospital description are in the product title, {len(found)} are on the page ({', '.join(found) or 'none'}).")
    if missing:
        remarks.append(f"Not found on the page: {', '.join(missing)}. Check these before using the values.")
    desc_up = description.upper()
    conflict = False
    d_age = [i for i, g in enumerate(AGE) if any(_has(desc_up, w) for w in g)]
    p_age = [i for i, g in enumerate(AGE) if any(_has(page, w) for w in g)]
    if d_age and p_age and not set(d_age) & set(p_age):
        conflict = True
        names = lambda ix: "/".join(sorted(next(iter(AGE[i])) for i in ix))  # noqa: E731
        remarks.append(f"Conflict: the hospital says {names(d_age)} but the page says {names(p_age)}.")
    by = {h.column: h for h in hits}
    for col, label in (("MANUFACTURE ITEM CODE", "Item code"), ("ITEM BRAND/MODEL", "Brand"), ("MANUFACTURER", "Manufacturer")):
        h = by.get(col)
        if h and _has(desc_up, h.value.upper()):
            remarks.append(f"{label} {h.value} is on the page and is also in the hospital description.")
            s = min(1.0, s + 0.1)
        elif h and col == "MANUFACTURE ITEM CODE":
            remarks.append(f"Item code {h.value} comes from the page's product data (not in the hospital description).")
    if "DIMENSION/SIZE (1)" in by:
        remarks.append(f"Size {by['DIMENSION/SIZE (1)'].value} on the page matches the hospital description.")
    conf = "Low" if conflict else ("High" if s >= 0.8 else "Medium" if s >= 0.5 else "Low")
    return round(s, 2), conf, remarks
