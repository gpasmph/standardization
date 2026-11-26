"""Firecrawl: web search + page reading in one call (https://docs.firecrawl.dev).

Set FIRECRAWL_API_KEY. It is read from the environment only; it is never sent to the browser or stored in the portal.
Each search returns the matching pages already converted to markdown (menus and footers removed), plus the raw HTML
so the page's structured product data (brand, part number) can still be read.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from dataclasses import dataclass
from urllib.error import HTTPError

API = os.getenv("FIRECRAWL_API_URL", "https://api.firecrawl.dev").rstrip("/") + "/v2"


@dataclass
class Page:
    url: str
    title: str
    text: str  # markdown turned into plain text
    html: str  # raw html (for ld+json), may be empty
    snippet: str = ""  # the search result's one-line description
    data: dict | None = None  # Firecrawl's AI extraction: {column key: {"value", "quote"}}


def enabled() -> bool:
    return bool(os.getenv("FIRECRAWL_API_KEY"))


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{API}{path}", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {os.environ['FIRECRAWL_API_KEY']}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:  # noqa: S310 - fixed https endpoint
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Firecrawl error {e.code}. {detail}") from None


def plain(markdown: str) -> str:
    """Markdown -> readable text. Keeps one line per row, so "Material: PVC" stays a line; table rows become "name: value"."""
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", markdown or "")
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    out: list[str] = []
    for line in s.splitlines():
        line = line.strip()
        if line.startswith("|"):
            cells = [c.strip(" *_`") for c in line.strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells):
                continue  # the |---|---| divider
            if len(cells) >= 2 and cells[0] and cells[1]:
                line = f"{cells[0]}: {cells[1]}"
        line = re.sub(r"[#*_`>|]+", " ", line)
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            out.append(line)
    return "\n".join(out)


def _page(d: dict) -> Page | None:
    md = d.get("markdown") or ""
    meta = d.get("metadata") or {}
    url = d.get("url") or meta.get("sourceURL") or meta.get("url") or ""
    if not url or not md:
        return None
    title = d.get("title") or meta.get("title") or ""
    snippet = d.get("description") or meta.get("description") or ""
    data = d.get("json") if isinstance(d.get("json"), dict) else None
    return Page(url, str(title), plain(md), d.get("rawHtml") or d.get("html") or "", str(snippet), data)


def key(column: str) -> str:
    """'MATERIAL/COMPOSITION (1)' -> 'material_composition_1', a name the extraction model handles well."""
    return re.sub(r"[^a-z0-9]+", "_", column.lower()).strip("_")


def json_format(columns: list[str], description: str) -> dict:
    """Ask Firecrawl to read each column off the page, with the exact words it read it from. Costs extra credits per page."""
    attr = {"type": "object", "properties": {"value": {"type": "string"}, "quote": {"type": "string"}}}
    return {
        "type": "json",
        "schema": {"type": "object", "properties": {
            "is_product_page": {"type": "boolean"}, **{key(c): attr for c in columns}}},
        "prompt": (
            f"This page may describe the hospital supply item \"{description}\". is_product_page: true only if this page sells or "
            "specifies one particular product (a shop, catalogue or datasheet page), false for articles, guides, news or forums. "
            "For each other field, give the value ONLY if this page "
            "states it for this product, in CAPITAL LETTERS with units (22G, 25MM), and `quote`: the exact words on the page it "
            "comes from. Leave a field out if the page does not state it. Never guess. Field names: "
            + "; ".join(f"{key(c)} = {c}" for c in columns)
        ),
    }


def _formats(columns: list[str] | None, description: str) -> list:
    f: list = ["markdown", "rawHtml"]
    if columns and os.getenv("FIRECRAWL_AI_EXTRACT", "1") != "0":
        f.append(json_format(columns, description))
    return f


def search(query: str, limit: int = 5, columns: list[str] | None = None) -> list[Page]:
    """Search the web and read each result. Costs credits: keep `limit` small."""
    out = _post("/search", {"query": query, "limit": limit, "scrapeOptions": {"formats": _formats(columns, query)}})
    data = out.get("data") or {}
    rows = data.get("web", []) if isinstance(data, dict) else data  # v2 groups by source; older replies are a plain list
    return [p for p in (_page(r) for r in rows) if p]


def scrape(url: str, columns: list[str] | None = None, description: str = "") -> Page | None:
    """Read one page you already have the link for."""
    out = _post("/scrape", {"url": url, "formats": _formats(columns, description)})
    d = out.get("data") or {}
    return _page({**d, "url": d.get("url") or url})
