# Google Sheets → QC API (Apps Script)

This file explains how to install the provided Apps Script which will push Google Sheet rows to your app's `/api/qc` endpoint.

Files added to this repo:
- `tools/google_apps_script/qc_push.gs` — the Apps Script code to copy into Apps Script editor.

Quick steps

1. Open your Google Sheet.
2. Extensions → Apps Script.
3. In the Apps Script editor, create a new script file and paste the contents of `tools/google_apps_script/qc_push.gs` from this repository.
4. Update constants at the top:
   - `QC_API_URL` — full URL to your app's `/api/qc` endpoint (e.g. `https://app.example.com/api/qc`).
   - `QC_API_KEY` — optional secret you can set to a value also checked by your server.
   - `SHEET_NAME` — sheet tab name containing the QC data.
   - `HEADER_ROW` — header row index (usually `1`).
5. Save the script.

Authorize + test

1. Run `testPush()` from the Apps Script editor to grant permissions and run an initial push. Accept the auth scopes prompted by Google.
2. In the script editor, View → Logs to inspect results.

Install an edit trigger (recommended for near-real-time pushes)

1. Click the clock icon (Triggers) in the Apps Script editor.
2. Add a trigger:
   - Choose function: `onEdit`
   - Event source: `From spreadsheet`
   - Event type: `On edit`
   - Failure notifications: as you prefer
3. Save trigger. This creates an installable trigger which can call `UrlFetchApp`.

Notes & security

- Simple triggers cannot call `UrlFetchApp`; you must create an installable `onEdit` trigger as above.
- For security, set `QC_API_KEY` in the script and validate it on the server (e.g., require `X-QC-Api-Key` header). The current server accepts posts without verification; consider implementing a check in `app/api/qc/route.ts` if you want stricter writes.
 - For security, set `QC_API_KEY` in the script and set the same value in your server environment as `QC_API_KEY`. The server will reject requests if the header does not match.
 - For security, set `QC_API_KEY` in the script and set the same value in your server environment as `QC_API_KEY`. The server will reject requests if the header does not match.

Environment file

Add `QC_API_KEY` to your environment. See `.env.example` for an example. For local development you can copy `.env.example` to `.env.local` and edit values.

Example:

```
QC_API_KEY=your-strong-secret
```
- If your sheet is large, prefer scheduled `pushAllRows()` (time-driven trigger) or partial pushes instead of pushing the whole sheet on every edit.

Header mapping and canonical keys

- The provided Apps Script maps common header names to canonical keys the server expects. Example mappings:
   - `Date` -> `date`
   - `Expert Name` -> `expertName`
   - `Personal Email` -> `personalEmail`
   - `Expert Email` -> `expertEmail`
   - `Assigned HDM` -> `assignedHDM`
   - `Feather Link` -> `featherLink`
   - `Recording Length` -> `recordingLength`
   - `App` -> `app`
   - `Reviewer Name` -> `reviewerName`
   - `Tag Status` -> `tagStatus`
   - `Complete Description` -> `notes`

If your sheet uses different column names, edit `HEADER_MAP` in `tools/google_apps_script/qc_push.gs` to map them to these canonical keys.

Example Apps Script behavior

- `onEdit(e)`: pushes the single row that was edited (fast, minimal payload). Use installable trigger.
- `pushAllRows()`: pushes entire sheet (good for first sync). Run manually or schedule time-driven trigger.

If you want, I can:
- Add server-side header/API key validation to `app/api/qc/route.ts`.
- Modify the Apps Script to only push a subset of columns or to map headers to specific field names expected by the server.
