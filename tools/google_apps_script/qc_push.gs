// QC Google Apps Script
// Purpose: push Google Sheet rows (whole sheet or single edited row) to /api/qc.
// Usage: copy into Apps Script editor (Extensions → Apps Script) and set constants below.

// --- CONFIG: set these before deploying ---
const QC_API_URL = 'https://your-app.example.com/api/qc'; // <-- change to your app URL
const QC_API_KEY = ''; // optional: set a secret and validate on server
const SHEET_NAME = 'Sheet1';
const HEADER_ROW = 1; // 1-based

// Map sheet header names to canonical QC keys expected by the server.
// Adjust keys to match your sheet headers. The script will normalize headers
// by trimming and using the map where available.
const HEADER_MAP = {
  'date': 'date',
  'date 🤖': 'date',
  'expert name': 'expertName',
  'expert name🤖': 'expertName',
  'personal email': 'personalEmail',
  'personal email🤖': 'personalEmail',
  'expert email': 'expertEmail',
  'expert email 🤖': 'expertEmail',
  'assigned hdm': 'assignedHDM',
  'assigned hdm🤖': 'assignedHDM',
  'feather link': 'featherLink',
  'recording length': 'recordingLength',
  'app': 'app',
  'reviewer name': 'reviewerName',
  'tag status': 'tagStatus',
  'complete description': 'notes',
};

function _headers(sheet) {
  return sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function _rowToObject(headers, rowValues) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    const rawHeader = String(headers[i] || `col${i+1}`).trim();
    const key = (HEADER_MAP[rawHeader.toLowerCase()] || rawHeader);
    obj[key] = rowValues[i];
  }
  return obj;
}

function pushRows(rows) {
  if (!rows || rows.length === 0) return { ok: true, pushed: 0 };
  const payload = { rows };
  const headers = {
    'Content-Type': 'application/json'
  };
  if (QC_API_KEY && QC_API_KEY.length) headers['X-QC-Api-Key'] = QC_API_KEY;

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers
  };

  try {
    const res = UrlFetchApp.fetch(QC_API_URL, options);
    const code = res.getResponseCode();
    const body = res.getContentText();
    Logger.log('pushRows -> %s %s', code, body);
    return { ok: code >= 200 && code < 300, code, body };
  } catch (err) {
    Logger.log('pushRows error: %s', err);
    return { ok: false, error: String(err) };
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QC Sync')
    .addItem('Push active sheet', 'pushActiveSheetRows')
    .addItem('Push named sheet', 'pushAllRows')
    .addItem('Test push', 'testPush')
    .addToUi();
}

/**
 * Push the entire sheet (all non-empty rows) to the QC API.
 * Good for initial sync or periodic full sync.
 */
function pushAllRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return { ok: true, pushed: 0 };
  const headers = _headers(sheet);
  const values = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, headers.length).getValues();
  const rows = values.map(r => _rowToObject(headers, r));
  return pushRows(rows);
}

function pushActiveSheetRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return { ok: true, pushed: 0 };
  const headers = _headers(sheet);
  const values = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, headers.length).getValues();
  const rows = values.map(r => _rowToObject(headers, r));
  return pushRows(rows);
}

/**
 * Installable onEdit trigger handler: pushes only the edited row.
 * NOTE: simple onEdit triggers cannot call UrlFetchApp; create an installable trigger.
 */
function onEdit(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    const row = range.getRow();
    if (row <= HEADER_ROW) return; // header or above

    const headers = _headers(sheet);
    const rowValues = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    const obj = _rowToObject(headers, rowValues);
    const result = pushRows([obj]);
    Logger.log('onEdit push result: %s', JSON.stringify(result));
    return result;
  } catch (err) {
    Logger.log('onEdit error: %s', err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Example: run this once after installation to ensure auth and to test push.
 */
function testPush() {
  const r = pushAllRows();
  Logger.log('testPush -> %s', JSON.stringify(r));
}
