import axios from 'axios';
import { getCachedCredentials, setCachedCredentials } from './credentials-cache';
import { dbConnect } from './db';
import { Settings } from './models/Settings';
import { Member } from './models/Member';
import { Report } from './models/Report';

interface HubstaffCredentials {
  HUBSTAFF_STRIPE_MID:      string;
  HUBSTAFF_XSRF_TOKEN:      string;
  HUBSTAFF_SESSION:         string;
  HUBSTAFF_ACCOUNT_REFRESH: string;
  HUBSTAFF_INGRESS_COOKIE:  string;
  HUBSTAFF_CSRF_TOKEN:      string;
}

async function loadCredentials(): Promise<HubstaffCredentials> {
  const cached = getCachedCredentials();
  if (cached) return cached as unknown as HubstaffCredentials;

  await dbConnect();
  const doc = await Settings.findById('hubstaff_credentials').lean();
  const creds: HubstaffCredentials = {
    HUBSTAFF_STRIPE_MID:      (doc?.HUBSTAFF_STRIPE_MID      || process.env.HUBSTAFF_STRIPE_MID)      as string,
    HUBSTAFF_XSRF_TOKEN:      (doc?.HUBSTAFF_XSRF_TOKEN      || process.env.HUBSTAFF_XSRF_TOKEN)      as string,
    HUBSTAFF_SESSION:         (doc?.HUBSTAFF_SESSION         || process.env.HUBSTAFF_SESSION)         as string,
    HUBSTAFF_ACCOUNT_REFRESH: (doc?.HUBSTAFF_ACCOUNT_REFRESH || process.env.HUBSTAFF_ACCOUNT_REFRESH) as string,
    HUBSTAFF_INGRESS_COOKIE:  (doc?.HUBSTAFF_INGRESS_COOKIE  || process.env.HUBSTAFF_INGRESS_COOKIE)  as string,
    HUBSTAFF_CSRF_TOKEN:      (doc?.HUBSTAFF_CSRF_TOKEN      || process.env.HUBSTAFF_CSRF_TOKEN)      as string,
  };
  setCachedCredentials(creds as unknown as Record<string, string>);
  return creds;
}

interface MemberEntry {
  name: string;
  personalEmail: string;
  micro1Email: string;
  hdm: string | null;
  team: string | null;
}

interface MemberLookup {
  byName:  Map<string, MemberEntry>;
  byEmail: Map<string, MemberEntry>;
}

interface MappedMember {
  organization:  string;
  timezone:      string;
  personalEmail: string | null;
  micro1Email:   string | null;
  hdm:           string | null;
  team:          string | null;
  totalWorked:   string;
  activity:      string;
  spentTotal:    string;
  currency:      string;
  dates:         Record<string, string>;
}

const REPORT_FILTERS: Record<string, string> = {
  show_email:          'true',
  show_job_title:      'true',
  show_job_type:       'true',
  show_employee_id:    'true',
  show_tax_info:       'true',
  show_location:       'true',
  show_timezone:       'true',
  show_date_added:     'true',
  show_spent:          'true',
  show_activity:       'true',
  show_manual:         'true',
  show_break_time:     'true',
  include_archived:    'true',
};

async function loadMembersFromDB(): Promise<MemberEntry[]> {
  await dbConnect();
  const docs = await Member.find(
    {},
    { hubstaffName: 1, personalEmail: 1, micro1Email: 1, hdm: 1, team: 1 },
  ).lean();

  return docs.map(d => ({
    name:          d.hubstaffName,
    personalEmail: d.personalEmail ?? '',
    micro1Email:   d.micro1Email   ?? '',
    hdm:           d.hdm  ?? null,
    team:          d.team ?? null,
  }));
}

function buildRequestHeaders(orgId: string, creds: HubstaffCredentials): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://app.hubstaff.com/',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    DNT: '1',
    Cookie: [
      `organization=${orgId}`,
      `__stripe_mid=${creds.HUBSTAFF_STRIPE_MID}`,
      `INGRESSCOOKIE=${creds.HUBSTAFF_INGRESS_COOKIE}`,
      `XSRF-TOKEN=${creds.HUBSTAFF_XSRF_TOKEN}`,
      `_hubstaff_session=${creds.HUBSTAFF_SESSION}`,
      `hubstaff_account_refresh=${creds.HUBSTAFF_ACCOUNT_REFRESH}`,
    ].join('; '),
  };
}

function buildReportUrl(orgId: string, projectId: string, dateStart: string, dateEnd: string): string {
  const base   = `https://app.hubstaff.com/reports/${orgId}/team/daily.csv`;
  const params = new URLSearchParams();
  params.append('date',     dateStart);
  params.append('date_end', dateEnd);
  params.append('group_by', 'date');
  for (const [key, value] of Object.entries(REPORT_FILTERS)) {
    params.append(`filters[${key}]`, value);
  }
  params.append('filters[organization_id]', orgId);
  params.append('filters[projects][]', projectId);
  return `${base}?${params.toString()}`;
}

async function fetchUrl(url: string, headers: Record<string, string>): Promise<string> {
  const response = await axios.get<string>(url, {
    headers,
    responseType: 'text',
    maxRedirects: 5,
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    const preview = String(response.data ?? '').slice(0, 400);
    console.error(`[fetchUrl] HTTP ${response.status} from Hubstaff:\n${preview}`);
    throw new Error(`Hubstaff returned HTTP ${response.status} — check server logs for details`);
  }
  return response.data;
}

function parseCsv(csvText: string): Record<string, string>[] {
  function tokeniseRow(line: string): string[] {
    const fields: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim()); current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = tokeniseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const values = tokeniseRow(line);
    return headers.reduce((obj: Record<string, string>, header, i) => {
      obj[header] = values[i] ?? '';
      return obj;
    }, {});
  });
}

function isDateColumn(header: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(header);
}

function buildMemberLookup(memberDirectory: MemberEntry[]): MemberLookup {
  const byName  = new Map<string, MemberEntry>();
  const byEmail = new Map<string, MemberEntry>();
  for (const entry of memberDirectory) {
    byName.set(entry.name.toLowerCase().trim(), entry);
    if (entry.personalEmail) byEmail.set(entry.personalEmail.toLowerCase().trim(), entry);
  }
  return { byName, byEmail };
}

function resolveMember(member: string, lookup: MemberLookup): MemberEntry | null {
  const key = member.toLowerCase().trim();
  return lookup.byName.get(key) || lookup.byEmail.get(key) || null;
}

function mapByMemberAndDate(
  rows: Record<string, string>[],
  lookup: MemberLookup,
): Record<string, MappedMember> {
  const result: Record<string, MappedMember> = {};
  const unmatched: string[] = [];

  for (const row of rows) {
    const member = row['member'];
    if (!member?.trim()) continue;

    const dates: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (isDateColumn(key)) dates[key] = value || '0:00:00';
    }

    const dir = resolveMember(member, lookup);
    if (!dir) unmatched.push(member);

    const key = dir ? dir.name : member;
    result[key] = {
      organization:  row['organization'] || '',
      timezone:      row['time_zone']    || '',
      personalEmail: dir ? dir.personalEmail : null,
      micro1Email:   dir ? dir.micro1Email   : null,
      hdm:           dir ? dir.hdm           : null,
      team:          dir ? dir.team          : null,
      totalWorked:   row['total_worked'] || '',
      activity:      row['activity']     || '',
      spentTotal:    row['spent_total']  || '',
      currency:      row['currency']     || '',
      dates,
    };
  }

  if (unmatched.length > 0) {
    console.warn(`\n⚠️  ${unmatched.length} member(s) not found in directory:`);
    unmatched.forEach(m => console.warn(`   - ${m}`));
  }

  return result;
}

async function storeToMongoDB(
  mapped:    Record<string, MappedMember>,
  orgId:     string,
  projectId: string,
): Promise<void> {
  await dbConnect();

  const ops = Object.entries(mapped).map(([memberName, data]) => {
    const { dates, totalWorked, ...rest } = data;
    const dateFields = Object.fromEntries(
      Object.entries(dates).map(([d, v]) => [`dates.${d}`, v]),
    );
    return {
      updateOne: {
        filter: { memberName },
        update: {
          $set: {
            orgId,
            projectId,
            memberName,
            ...rest,
            ...dateFields,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    };
  });

  const result = await Report.bulkWrite(ops, { ordered: false });
  console.log(
    `✅  MongoDB: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (reports)`,
  );
}

export async function runReport(dateStart?: string, dateEnd?: string): Promise<void> {
  const orgId              = process.env.HUBSTAFF_ORG_ID!;
  const projectId          = process.env.HUBSTAFF_PROJECT_ID!;
  const effectiveDateStart = dateStart || process.env.REPORT_DATE_START!;
  const effectiveDateEnd   = dateEnd   || process.env.REPORT_DATE_END!;

  console.log('Loading credentials from MongoDB…');
  const creds          = await loadCredentials();
  const requestHeaders = buildRequestHeaders(orgId, creds);

  console.log('Loading members from MongoDB…');
  const memberDirectory = await loadMembersFromDB();
  console.log(`Loaded ${memberDirectory.length} members from DB.`);

  console.log('Building report URL…');
  const url = buildReportUrl(orgId, projectId, effectiveDateStart, effectiveDateEnd);

  console.log('Fetching CSV from Hubstaff…');
  const csvText = await fetchUrl(url, requestHeaders);

  console.log(`Received ${csvText.length} characters. Parsing CSV…`);
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error('No data rows found. Check your date range, cookies, or filters.');
  }

  console.log(`Parsed ${rows.length} rows. Mapping…`);
  const lookup = buildMemberLookup(memberDirectory);
  const mapped = mapByMemberAndDate(rows, lookup);

  console.log('Storing to MongoDB…');
  await storeToMongoDB(mapped, orgId, projectId);
}
