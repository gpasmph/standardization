r"""Product-page lookup service for the Rules Lab (testing).

Run:  .venv\Scripts\python -m uvicorn app:app --port 8000

Give it a hospital item description. It finds candidate product pages (your sites in sources.json, or a search API),
reads them with Scrapling, and returns each candidate with the values found, a match score and plain-language remarks.
"""
from __future__ import annotations

import os
import pathlib


def _load_env() -> None:
    """Read scraper/.env (KEY=value per line) so the key lives in a file that is never committed, not in the terminal history."""
    f = pathlib.Path(__file__).with_name(".env")
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        k, sep, v = line.strip().partition("=")
        v = v.strip().strip("\"'")
        if sep and k and not k.startswith("#") and v:
            os.environ.setdefault(k.strip(), v)


_load_env()

import re
import urllib.robotparser
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scrapling.fetchers import Fetcher

import firecrawl
from extract import Hit, extract, score, tokens
from scrapling.parser import Selector
from search import find_urls, provider, site_candidates, sites

app = FastAPI(title="MPH page lookup")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])

UA = "MPH-PASIA-ItemStandardization/0.1 (product data lookup)"
SKIP_TAGS = ("script", "style", "nav", "header", "footer", "aside", "noscript")
_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}


class Req(BaseModel):
    description: str = ""
    columns: list[str] = []
    urls: list[str] = []


def allowed(url: str) -> bool:
    """Be a polite visitor: respect robots.txt."""
    u = urlparse(url)
    base = f"{u.scheme}://{u.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            rp.set_url(f"{base}/robots.txt")
            rp.read()
            _robots[base] = rp
        except Exception:  # robots.txt unreachable: treat as allowed
            _robots[base] = None
    rp = _robots[base]
    return True if rp is None else rp.can_fetch(UA, url)


def fetch(url: str):
    if not allowed(url):
        return None
    try:
        page = Fetcher.get(url, timeout=15, headers={"User-Agent": UA})
        return page if page.status == 200 else None
    except Exception:  # unreachable: skip
        return None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "firecrawl": firecrawl.enabled(), "search_api": provider(), "sites": [s["name"] for s in sites()]}


def _squash(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def ai_hits(data: dict | None, text: str, columns: list[str]) -> list[Hit]:
    """Firecrawl's AI extraction, kept only when the page really shows it: the quote (or the value) must be in the page text."""
    if not data:
        return []
    page = f" {_squash(text)} "
    out: list[Hit] = []
    for col in columns:
        d = data.get(firecrawl.key(col))
        if not isinstance(d, dict):
            continue
        value = re.sub(r"\s+", " ", str(d.get("value") or "")).strip().upper()
        quote = re.sub(r"\s+", " ", str(d.get("quote") or "")).strip()
        if not value or value in {"N/A", "NA", "NONE", "UNKNOWN", "NOT STATED", "-"}:
            continue
        # the quote must really be on the page, and must contain the value (no proof, no value)
        q = _squash(quote)
        if q and f" {q} " in page and _same(value, quote):
            out.append(Hit(col, value, quote[:200]))
    return out


def _alnum(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def _same(value: str, quote: str) -> bool:
    """Every word of the value appears in the quote (7FT ~ "7-foot" is allowed through the number)."""
    q = _alnum(quote)
    words = [w for w in re.findall(r"[A-Z0-9]+", value.upper()) if w not in {"FT", "FOOT", "MM", "CM", "M", "IN"}]
    return bool(words) and all(w in q for w in words)


ARTICLE_URL = re.compile(r"/(blog|blogs|news|article|articles|health|healthtopics|wiki|forum|forums|faq|guide|guides|tips|ency|patient)(/|$)|\.pdf$", re.I)
ARTICLE_TITLE = re.compile(r"^(how|what|why|when|tips|guide|ways)\b|\b(tips|therapy|guide|how to|explained|vs\.?|article)\b|\?", re.I)


def is_product_page(url: str, title: str, ld: list[str], ai_says: object) -> bool | None:
    """A shop, catalogue or datasheet page. Articles and guides are listed as results, but not used as proof."""
    if any('"Product"' in b for b in ld):
        return True
    if ARTICLE_URL.search(url) or ARTICLE_TITLE.search(title):
        return False
    return ai_says if isinstance(ai_says, bool) else None


def candidate(url: str, title: str, h1: str, text: str, ld: list[str], desc: str, columns: list[str],
              snippet: str = "", data: dict | None = None) -> dict:
    product, rule_hits = extract(text, ld, title, desc, columns, h1)
    hits = ai_hits(data, text, columns)
    hits += [h for h in rule_hits if h.column not in {x.column for x in hits}]
    hits = [h for h in hits if _squash(h.value) != _squash(desc)]  # the hospital's own words are not proof
    is_product = is_product_page(url, title or h1, ld, data.get("is_product_page") if data else None)
    s, conf, remarks = score(desc, " ".join([title, h1, product]), " ".join([title, h1, product, text[:6000]]), hits)
    if not hits:
        remarks.append("No attribute values could be read from this page.")
    site = urlparse(url).netloc
    return {
        "url": url, "site": site, "title": product or title, "snippet": snippet[:300], "score": s, "confidence": conf, "remarks": remarks,
        "product_page": is_product,
        "items": [{"column": h.column, "value": h.value, "quote": h.quote, "sources": [{"url": url, "site": site}]} for h in hits],
    }


def from_firecrawl(pg: firecrawl.Page, desc: str, columns: list[str]) -> dict:
    ld: list[str] = []
    h1 = ""
    if pg.html:
        try:
            sel = Selector(pg.html)
            ld = [str(x) for x in sel.css('script[type="application/ld+json"]::text').getall()]
            h1 = str(sel.css("h1::text").get() or "")
        except Exception:  # unreadable html: the text is still used
            pass
    return candidate(pg.url, pg.title, h1, pg.text, ld, desc, columns, pg.snippet, pg.data)


def from_scrapling(url: str, desc: str, columns: list[str]) -> dict | None:
    page = fetch(url)
    if page is None:
        return None
    try:
        text = str(page.get_all_text(separator="\n", ignore_tags=SKIP_TAGS))
        ld = [str(x) for x in page.css('script[type="application/ld+json"]::text').getall()]
        return candidate(url, str(page.css("title::text").get() or ""), str(page.css("h1::text").get() or ""), text, ld, desc, columns)
    except Exception:
        return None


def rank(cands: list[dict]) -> list[dict]:
    cands.sort(key=lambda c: (c["confidence"] == "High", c["confidence"] == "Medium", c["score"], len(c["items"])), reverse=True)
    return cands[:6]


def suggestions(cands: list[dict], per_column: int = 3) -> list[dict]:
    """Every value found across the pages, grouped by column. A value more pages agree on, from better-matching pages, comes first."""
    weight = {"High": 3, "Medium": 2, "Low": 1}
    pool: dict[tuple[str, str], dict] = {}
    for c in cands:
        if c.get("product_page") is False:
            continue  # articles and guides: listed as results, but not used as proof
        for it in c["items"]:
            k = (it["column"], _alnum(it["value"]))
            s = pool.setdefault(k, {"column": it["column"], "value": it["value"], "quote": it["quote"], "sources": [], "_w": 0.0})
            if all(x["url"] != c["url"] for x in s["sources"]):
                s["sources"].append({"url": c["url"], "site": c["site"]})
                s["_w"] += weight.get(c["confidence"], 1) + c["score"]
    by_col: dict[str, list[dict]] = {}
    for s in sorted(pool.values(), key=lambda s: s["_w"], reverse=True):
        by_col.setdefault(s["column"], []).append(s)
    out: list[dict] = []
    for opts in by_col.values():
        for s in opts[:per_column]:
            s.pop("_w")
            s["sources"] = s["sources"][:3]
            out.append(s)
    return out


@app.post("/lookup")
def lookup(r: Req) -> dict:
    desc = r.description.strip()
    urls = [u.strip() for u in r.urls if re.match(r"^https?://", u.strip(), re.I)]
    cands: list[dict] = []
    try:
        if urls:
            how, tried = "the links you pasted", len(urls)
            for u in urls[:6]:
                pg = firecrawl.scrape(u, r.columns, desc) if firecrawl.enabled() else None
                c = from_firecrawl(pg, desc, r.columns) if pg else from_scrapling(u, desc, r.columns)
                if c:
                    cands.append(c)
        elif len(desc) < 3:
            raise HTTPException(400, "The hospital description is empty.")
        elif firecrawl.enabled():
            pages = firecrawl.search(desc, limit=6, columns=r.columns)
            how, tried = "a web search (Firecrawl)", len(pages)
            cands = [from_firecrawl(pg, desc, r.columns) for pg in pages]
        else:
            urls = site_candidates(tokens(desc), fetch)
            how = "your supplier sites (sources.json)"
            if provider():
                urls += [u for u in find_urls(desc) if u not in urls]
                how += " and the search API"
            if not urls and not sites() and not provider():
                raise HTTPException(400, "No search source is set up. Set FIRECRAWL_API_KEY (see README).")
            tried = len(urls)
            cands = [c for c in (from_scrapling(u, desc, r.columns) for u in urls[:10]) if c]
    except RuntimeError as e:  # a Firecrawl error: show its message as is (quota, bad key...)
        raise HTTPException(502, str(e)) from None
    ranked = rank(cands)
    return {
        "how": how, "tried": tried, "candidates": ranked,
        "product": next((c["title"] for c in ranked if c["confidence"] != "Low" and c["title"]), ""),
        "results": [{"url": c["url"], "site": c["site"], "title": c["title"], "snippet": c.get("snippet", ""), "confidence": c["confidence"],
                     "product_page": c.get("product_page")} for c in ranked],
        "items": suggestions(ranked),
    }
