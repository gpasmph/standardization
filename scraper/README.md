# Page lookup (testing)

Searches the web for a hospital item, reads the pages, and returns each page with the values found, a match score and
the reason. Used by the Rules Lab. Nothing is stored.

## Once: create the environment
```
cd scraper
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Start (with your Firecrawl key)
1. Open `scraper\.env` and paste your key after `FIRECRAWL_API_KEY=` (no spaces, no quotes). Save.
2. In PowerShell, from the `scraper` folder: `.\start.ps1`
3. Check `http://127.0.0.1:8000/health`: it should say `"firecrawl": true`.

The key stays in `.env`. It is never put in the portal and `.env` is not committed.

Then use **Rules Lab -> Find proof**. Type only the hospital description.

## Credits
Firecrawl charges credits per search and per page read, and the free plan is limited. Each Find proof reads up to 6 pages.
Check the current numbers at firecrawl.dev/pricing. Lower `limit` in `app.py` (`firecrawl.search(desc, limit=6)`) to spend less.

## Without a Firecrawl key
It falls back to the sites listed in `sources.json`, or to one of these search APIs (set ONE): `SEARXNG_URL`, `BRAVE_API_KEY`,
`SERPER_API_KEY`, or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`. Google, Bing and DuckDuckGo result pages are deliberately not scraped.
