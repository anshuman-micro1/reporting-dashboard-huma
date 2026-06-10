# Google Sheets runner and Excel upload

This repository supports two QC ingestion paths:

- Apps Script runner from Google Sheets, which pushes rows to `POST /api/qc`.
- Admin-only Excel / CSV upload from the QC dashboard, which sends a file to `POST /api/qc/upload`.

Apps Script setup

1. Open the Google Sheet that should act as the source of truth.
2. Extensions → Apps Script.
3. Create a new script file and paste the contents of `tools/google_apps_script/qc_push.gs`.
4. Update the constants at the top:
   - `QC_API_URL` - your app endpoint, for example `https://app.example.com/api/qc`
   - `QC_API_KEY` - optional shared secret, must match your server env if set
   - `SHEET_NAME` - tab name to push from when using `pushAllRows()`
   - `HEADER_ROW` - usually `1`
5. Save the script.

Run and authorize

1. Run `testPush()` once from the Apps Script editor.
2. Accept the requested permissions.
3. Use View → Logs to confirm the response.

Trigger options

- Use the custom menu added by `onOpen()` in the sheet UI.
- Use `onEdit` as an installable trigger for near-real-time pushes.
- Use `pushAllRows()` for a full refresh.

Important notes

- Simple triggers cannot call `UrlFetchApp`; use an installable `onEdit` trigger.
- The script maps common header names like `Expert Name`, `Expert Email`, `Assigned HDM`, and `Complete Description` to the canonical QC fields.
- If your sheet headers differ, edit `HEADER_MAP` in `tools/google_apps_script/qc_push.gs`.
- Set `QC_API_KEY` in both the Apps Script and the server environment only if you want to require a shared secret.

Excel upload for admins

- Admins can open `/qc` and upload an `.xlsx`, `.xls`, or `.csv` file.
- The upload route reads the first sheet, normalizes rows, and stores them in `qc_submissions`.
- Only users with the `admin` role can upload.

Server env

Add `QC_API_KEY` if you want Apps Script requests to require a shared secret. See `.env.example` for the expected variables.

If you want, I can also add a small dropdown to choose the sheet tab during Excel upload.
