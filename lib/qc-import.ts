export type QCInputRow = Record<string, any>;

export type QCInvalidRow = {
  index: number;
  reason: string;
  row: QCInputRow;
};

export type QCNormalizedRow = {
  date: string;
  expertName: string;
  personalEmail: string | null;
  expertEmail: string | null;
  assignedHDM: string | null;
  featherLink: string | null;
  recordingLength: string | null;
  app: string | null;
  reviewerName: string | null;
  tagStatus: string | null;
  notes: string | null;
  raw: QCInputRow;
  updatedAt: Date;
};

const FIELD_ALIASES: Record<keyof Omit<QCNormalizedRow, 'raw' | 'updatedAt'>, string[]> = {
  date: ['date', 'Date', 'date 🤖', 'Date 🤖', 'date ', 'Date '],
  expertName: ['expertName', 'Expert Name', 'Expert Name🤖', 'Expert Name ', 'expert_name', 'expert name'],
  personalEmail: ['personalEmail', 'Personal Email', 'Personal Email🤖', 'personal_email', 'personal email'],
  expertEmail: ['expertEmail', 'Expert Email', 'Expert Email 🤖', 'expert_email', 'expert email'],
  assignedHDM: ['assignedHDM', 'Assigned HDM', 'Assigned HDM🤖', 'assigned_hdm', 'assigned hdm'],
  featherLink: ['featherLink', 'Feather Link', 'Feather Link🤖', 'feather_link', 'feather link'],
  recordingLength: ['recordingLength', 'Recording Length', 'Recording Length🤖', 'recording_length', 'recording length'],
  app: ['app', 'App', 'App🤖'],
  reviewerName: ['reviewerName', 'Reviewer Name', 'Reviewer Name✏️ <-DO NOT edit A-H!!!', 'reviewer name'],
  tagStatus: ['tagStatus', 'Tag Status', 'tag status'],
  notes: ['notes', 'Complete Description', 'complete description'],
};

function lowerKeyMap(row: QCInputRow) {
  const map = new Map<string, any>();
  Object.entries(row || {}).forEach(([key, value]) => map.set(String(key).trim().toLowerCase(), value));
  return map;
}

function pickValue(row: QCInputRow, aliases: string[]) {
  const map = lowerKeyMap(row);
  for (const alias of aliases) {
    const value = map.get(alias.trim().toLowerCase());
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function parseFlexibleDate(value: any): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && isFinite(value)) {
    // Excel serial date (1900 date system)
    const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const dmyOrMdy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyOrMdy) {
    const first = Number(dmyOrMdy[1]);
    const second = Number(dmyOrMdy[2]);
    const year = Number(dmyOrMdy[3]);
    const dayFirst = first > 12 || second > 12;
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

function isEmail(value: any) {
  return !!(value && /\S+@\S+\.\S+/.test(String(value)));
}

export function normalizeQCSourceRows(rows: QCInputRow[]) {
  const invalidRows: QCInvalidRow[] = [];
  const docs: QCNormalizedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const doc: QCNormalizedRow = {
      date: String(pickValue(row, FIELD_ALIASES.date) || '').trim(),
      expertName: String(pickValue(row, FIELD_ALIASES.expertName) || '').trim(),
      personalEmail: pickValue(row, FIELD_ALIASES.personalEmail) || null,
      expertEmail: pickValue(row, FIELD_ALIASES.expertEmail) || null,
      assignedHDM: pickValue(row, FIELD_ALIASES.assignedHDM) || null,
      featherLink: pickValue(row, FIELD_ALIASES.featherLink) || null,
      recordingLength: pickValue(row, FIELD_ALIASES.recordingLength) || null,
      app: pickValue(row, FIELD_ALIASES.app) || null,
      reviewerName: pickValue(row, FIELD_ALIASES.reviewerName) || null,
      tagStatus: pickValue(row, FIELD_ALIASES.tagStatus) || null,
      notes: pickValue(row, FIELD_ALIASES.notes) || null,
      raw: row,
      updatedAt: new Date(),
    };

    const normalizedDate = parseFlexibleDate(doc.date);
    if (!normalizedDate) {
      invalidRows.push({ index: i, reason: 'missing or invalid date', row });
      continue;
    }
    doc.date = normalizedDate;

    if (!doc.expertEmail && !doc.expertName) {
      invalidRows.push({ index: i, reason: 'missing expertEmail and expertName', row });
      continue;
    }

    if (doc.expertEmail && !isEmail(doc.expertEmail)) {
      invalidRows.push({ index: i, reason: `invalid expertEmail: ${doc.expertEmail}`, row });
      continue;
    }

    docs.push(doc);
  }

  return { docs, invalidRows };
}

export function buildQCUpsertOps(docs: QCNormalizedRow[]) {
  return docs.map(doc => ({
    updateOne: {
      filter: { expertEmail: doc.expertEmail || doc.expertName, date: doc.date },
      update: { $set: doc, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    },
  }));
}
