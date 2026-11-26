# MPH Item Standardization Portal

Vite + TypeScript (no framework) with Supabase (login, database, file storage).

```
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

```
src/
  main.ts          entry: mounts nav, wires events
  actions.ts       click / change / input handlers
  render.ts        picks the view and renders it
  state.ts         app state + addItem/resetNew
  types.ts         shared types
  data/            master items, attribute guides, samples (swap for real data)
  lib/             match.ts (normalise, classify, match), describe.ts (build/prefill), dom.ts
  components/      nav, icons, status chips
  views/           newItem, queue, dashboard, batch, exportView
  styles/main.css  design tokens (light + dark) and styles
legacy/            original single-file prototype
```

## Supabase setup (once)

### Backend Excel import (85,000+ rows)

For `Vertical Material Master_Complete (2).xlsb`, install Python 3 and run `python -m pip install -r scripts/requirements-import.txt`. Set `IMPORT_PYTHON` in the root `.env` if Python is not on PATH. Then run:

Alternatively create a local environment with `python -m venv .venv-import` and install using `.venv-import\Scripts\python.exe -m pip install -r scripts/requirements-import.txt` on Windows. The importer automatically detects this environment; `IMPORT_PYTHON` overrides it. The current workspace already has this environment prepared.

```powershell
npm run import:material:check -- --file "C:\Users\Spottie Ph Inc\Downloads\Vertical Material Master_Complete (2).xlsb"
npm run import:material -- --file "C:\Users\Spottie Ph Inc\Downloads\Vertical Material Master_Complete (2).xlsb"
```

This reads only `MedSupplies&Others`, validates its 95-column layout, and maps source descriptions, hospital details, UNSPSC commodity, reviewer attributes, priority, status, date, and remarks. Medicines, Status, List, and Sheet1 are excluded. Duplicate attribute headers retain separate numbered keys. Additional source classification and UOM fields are retained in `mph_data`.

Source IDs are stored as `VMM-MS:<ID>` (for example `VMM-MS:1`) to distinguish them from other sheets and existing portal Request IDs. Reimports skip those IDs unless `--update` is explicitly supplied. This does not reconcile the same hospital material against older records with different Request IDs; such records can coexist. Checkpoints and retry behavior below also apply to this importer. Reading XLSB requires Python and pyxlsb; the database writes run through the existing Node backend script. No service role key enters the browser. These commands do not change the portal upload button.

Use Node.js 20.19+ and set `EXCEL_PATH`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the root `.env`. Keep the service role key on the backend only.

Run `npm run import:check` to validate the workbook without database writes, then `npm run import:items` to import. This uses the first worksheet, headers on row 2, and the existing 88-column MPH layout. Duplicate IDs within the file use the last row.

The importer streams Excel parsing, retains mapped unique records in memory, and writes 500 records per request (170 batches for 85,000 unique IDs). Existing database IDs are skipped by default. To explicitly overwrite them, run `npm run import:items -- --update`.

Transient failures retry up to five times with backoff. Successful batches save a local checkpoint under `.import-checkpoints/`; rerun the same command after an interruption to resume. Checkpoints are scoped to the file contents, database URL, and import mode. Keep this folder on the same machine and run one importer at a time. Progress counts processed records, including existing IDs skipped, rather than newly inserted rows. Previous successful batches remain saved if a later batch fails. Changing the workbook starts a new import. The portal's Batch import button continues to use its browser importer; these commands run the backend import separately.

1. SQL Editor: run `supabase/storage.sql`, `supabase/items.sql`, then `supabase/auth.sql`.
2. `.env`: fill `SUPABASE_SERVICE_ROLE_KEY` (scripts only) and `VITE_SUPABASE_PUBLISHABLE_KEY` (browser).
3. `node --env-file=.env scripts/upload-excel.mjs`   store the .xlsx in Storage
4. `node --env-file=.env scripts/import-items.mjs`   load the rows into `items`
5. `node --env-file=.env scripts/create-user.mjs <email> <password> <prod|qa> "Name"`   one per person
