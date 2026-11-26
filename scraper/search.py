"""Where the product-page URLs come from. One provider is chosen by environment variable.

Scraping Google/Bing/DuckDuckGo result pages is not used: they block bots and it breaks their terms. Use one of these instead:

  SEARXNG_URL    your own SearXNG instance (free, self-hosted)         e.g. http://localhost:8080
  BRAVE_API_KEY  Brave Search API (has a free allowance)
  SERPER_API_KEY Serper.dev (free starter credits)
  GOOGLE_CSE_KEY + GOOGLE_CSE_CX  Google Programmable Search (official API, daily free quota)

Or skip search entirely and paste the product page URLs into the Rules Lab.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request


def _get(url: str, headers: dict[str, str] | None = None, body: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=body, headers={"Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 - fixed https/http endpoints chosen by the operator
        return json.loads(r.read().decode("utf-8"))


def provider() -> str | None:
    if os.getenv("SEARXNG_URL"):
        return "searxng"
    if os.getenv("BRAVE_API_KEY"):
        return "brave"
    if os.getenv("SERPER_API_KEY"):
        return "serper"
    if os.getenv("GOOGLE_CSE_KEY") and os.getenv("GOOGLE_CSE_CX"):
        return "google"
    return None


def find_urls(query: str, limit: int = 6) -> list[str]:
    p = provider()
    if p == "searxng":
        base = os.environ["SEARXNG_URL"].rstrip("/")
        d = _get(f"{base}/search?q={urllib.parse.quote_plus(query)}&format=json")
        return [r["url"] for r in d.get("results", []) if r.get("url")][:limit]
    if p == "brave":
        d = _get(
            f"https://api.search.brave.com/res/v1/web/search?q={urllib.parse.quote_plus(query)}&count={limit}",
            {"X-Subscription-Token": os.environ["BRAVE_API_KEY"]},
        )
        return [r["url"] for r in d.get("web", {}).get("results", []) if r.get("url")][:limit]
    if p == "serper":
        d = _get(
            "https://google.serper.dev/search",
            {"X-API-KEY": os.environ["SERPER_API_KEY"], "Content-Type": "application/json"},
            json.dumps({"q": query, "num": limit}).encode(),
        )
        return [r["link"] for r in d.get("organic", []) if r.get("link")][:limit]
    if p == "google":
        d = _get(
            "https://www.googleapis.com/customsearch/v1?"
            + urllib.parse.urlencode({"key": os.environ["GOOGLE_CSE_KEY"], "cx": os.environ["GOOGLE_CSE_CX"], "q": query, "num": min(limit, 10)})
        )
        return [r["link"] for r in d.get("items", []) if r.get("link")][:limit]
    return []


# ---------- the supplier / manufacturer sites you list in sources.json ----------
# Each site's OWN search page is read (like a person typing in the site's search box). Add the sites your team already uses.
# "search" is the site's search URL with {q} where the words go; "link" is a CSS selector for the product links in the results.

import pathlib
from urllib.parse import urljoin

SOURCES = pathlib.Path(__file__).with_name("sources.json")


def sites() -> list[dict]:
    try:
        return json.loads(SOURCES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def queries(words: list[str]) -> list[str]:
    """Long queries often find nothing on a shop's search, so try shorter ones too."""
    out: list[str] = []
    for n in (5, 3, 2):
        q = " ".join(words[:n])
        if q and q not in out:
            out.append(q)
    return out


def site_candidates(words: list[str], fetch, limit: int = 8) -> list[str]:
    """fetch(url) -> a Scrapling page or None. Returns product page URLs from the configured sites."""
    urls: list[str] = []
    for site in sites():
        for q in queries(words):
            page = fetch(site["search"].replace("{q}", urllib.parse.quote_plus(q)))
            if page is None:
                continue
            found = [urljoin(site["search"], str(h)) for h in page.css(f"{site['link']}::attr(href)").getall()]
            found = [u.split("#")[0] for u in found if u.startswith("http")]
            new = [u for u in dict.fromkeys(found) if u not in urls]
            urls += new
            if new:
                break  # this site gave results; no need for a shorter query
        if len(urls) >= limit:
            break
    return urls[:limit]
