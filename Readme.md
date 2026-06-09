first time admin setup

curl --location 'http://localhost:8501/api/auth/setup' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"----","name":"Admin","password":"----"}'

## QC imports

The QC dashboard supports two ingestion paths:

- Google Sheets Apps Script runner that pushes rows to `POST /api/qc`.
- Admin-only Excel / CSV upload from `/qc`, which posts to `POST /api/qc/upload`.

See `docs/GOOGLE_SHEETS_APPS_SCRIPT.md` for the Apps Script setup.