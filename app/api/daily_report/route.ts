import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { dbConnect } from '@/lib/db';
import { DailyReport } from '@/lib/models/DailyReport';

export const maxDuration = 60;

// ── helpers ──────────────────────────────────────────────────

function toSecs(str: string): number {
  if (!str || str === '0:00:00' || str === '-') return 0;
  const p = str.split(':').map(Number);
  return p[0] * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

function fromSecs(s: number): string {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
}

function parseCsv(csvText: string): Record<string, string>[] {
  function tokenise(line: string): string[] {
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  }
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = tokenise(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = tokenise(line);
    return headers.reduce((obj: Record<string, string>, h, i) => { obj[h] = vals[i] ?? ''; return obj; }, {});
  });
}

async function fetchAndBuildDoc(date: string) {
  const orgId     = process.env.HUBSTAFF_ORG_ID!;
  const projectId = process.env.HUBSTAFF_PROJECT_ID!;

  const columns = [
    'user', 'date', 'client', 'project', 'team', 'task',
    'tracked_regular', 'tracked_total', 'activity_percentage',
    'idle_percentage', 'tracked_idle', 'spent_total', 'spent_regular',
  ];

  const params = new URLSearchParams();
  params.set('custom', 'true');
  for (const col of columns) params.append('f[columns][]', col);
  params.set('f[date]', `${date} - ${date}`);
  params.set('f[exclude_work_breaks]', 'false');
  params.set('f[group_by]', 'user');
  params.set('f[include_archived]', 'true');
  params.set('f[include_removed_members]', 'false');
  params.set('f[include_time_off_holiday]', 'true');
  params.set('f[limit]', '200');
  params.set('f[member_selection_type]', 'select_all');
  params.set('f[page]', '1');
  params.set('f[project]', projectId);
  params.set('f[project_selection]', projectId);
  params.set('f[project_selection_type]', 'normal');
  params.set('f[show_chart]', 'true');
  params.set('f[sort]', 'user.a');
  params.set('f[tracked_time]', 'with_tracked_time');
  params.set('f[group_by_totals]', 'false');

  const url = `https://app.hubstaff.com/reports/${orgId}/team/time_and_activities.csv?${params}`;

  const cookieParts = [
    `organization=${orgId}`,
    `__stripe_mid=${process.env.HUBSTAFF_STRIPE_MID}`,
    `INGRESSCOOKIE=${process.env.HUBSTAFF_INGRESS_COOKIE}`,
    `XSRF-TOKEN=${process.env.HUBSTAFF_XSRF_TOKEN}`,
    `_hubstaff_session=${process.env.HUBSTAFF_SESSION}`,
    `hubstaff_account_refresh=${process.env.HUBSTAFF_ACCOUNT_REFRESH}`,
  ];
  if (process.env.HUBSTAFF_CFUVID) cookieParts.push(`_cfuvid=${process.env.HUBSTAFF_CFUVID}`);

  const { data: csvText } = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `https://app.hubstaff.com/reports/${orgId}/team/time_and_activities`,
      DNT: '1',
      Connection: 'keep-alive',
      Cookie: cookieParts.join('; '),
    },
    responseType: 'text',
    maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 300,
  });

  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('No data — check cookies or date range');

  const memberMap: Record<string, { totalSecs: number; activityWeightedSum: number; activityTotalSecs: number }> = {};

  for (const row of rows) {
    const name = row['member'];
    if (!name) continue;
    const secs = toSecs(row['total_hours']);
    const act  = parseInt(row['activity_%'] ?? '');
    if (!memberMap[name]) memberMap[name] = { totalSecs: 0, activityWeightedSum: 0, activityTotalSecs: 0 };
    memberMap[name].totalSecs += secs;
    if (!isNaN(act) && secs > 0) {
      memberMap[name].activityWeightedSum += act * secs;
      memberMap[name].activityTotalSecs  += secs;
    }
  }

  const member_data: Record<string, { total_hours: string; activity: string }> = {};
  let grandTotalSecs = 0, weightedActivitySum = 0, weightedActivityBase = 0;

  for (const [name, m] of Object.entries(memberMap)) {
    member_data[name] = {
      total_hours: fromSecs(m.totalSecs),
      activity: m.activityTotalSecs > 0
        ? `${Math.round(m.activityWeightedSum / m.activityTotalSecs)}%`
        : '0%',
    };
    grandTotalSecs      += m.totalSecs;
    weightedActivitySum  += m.activityWeightedSum;
    weightedActivityBase += m.activityTotalSecs;
  }

  const memberCount = Object.keys(member_data).length;
  return {
    date,
    total_time:               fromSecs(grandTotalSecs),
    average_activity:         weightedActivityBase > 0
      ? `${Math.round(weightedActivitySum / weightedActivityBase)}%`
      : '0%',
    average_hours_per_member: memberCount > 0 ? fromSecs(Math.round(grandTotalSecs / memberCount)) : '0:00:00',
    member_data,
    updatedAt: new Date(),
  };
}

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (i + 1));
    return d.toISOString().slice(0, 10);
  });
}

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  try {
    await dbConnect();
    const existing = await DailyReport.findOne({ date }).select('-_id -__v').lean();
    return NextResponse.json(existing ?? null);
  } catch (err: unknown) {
    console.error('[GET /api/daily_report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST — sync last 2 days ────────────────────────────────────

export async function POST(_req: NextRequest) {
  const dates = lastNDays(2);
  try {
    const docs = await Promise.all(dates.map(d => fetchAndBuildDoc(d)));
    await dbConnect();
    await Promise.all(
      docs.map(doc =>
        DailyReport.updateOne(
          { date: doc.date },
          { $set: doc, $setOnInsert: { createdAt: new Date() } },
          { upsert: true },
        ),
      ),
    );
    const result = Object.fromEntries(docs.map(d => [d.date, d]));
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[POST /api/daily_report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
