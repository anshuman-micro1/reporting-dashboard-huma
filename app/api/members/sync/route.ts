import { NextResponse } from 'next/server';
import axios from 'axios';
import { getCachedCredentials, setCachedCredentials } from '@/lib/credentials-cache';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';
import { Settings } from '@/lib/models/Settings';

export const maxDuration = 60;

interface HubstaffMember {
  id: number;
  name: string;
}

interface PageResponse {
  items: HubstaffMember[];
  pagination: { last_page: boolean; next_page: number };
}

async function buildHeaders() {
  const orgId = process.env.HUBSTAFF_ORG_ID!;

  let creds = getCachedCredentials();
  if (!creds) {
    await dbConnect();
    const doc = await Settings.findById('hubstaff_credentials').lean();
    creds = (doc || {}) as Record<string, string>;
    setCachedCredentials(creds);
  }
  const get = (key: string) => (creds![key] || process.env[key] || '') as string;

  const cookieParts = [
    `organization=${orgId}`,
    `__stripe_mid=${get('HUBSTAFF_STRIPE_MID')}`,
    `INGRESSCOOKIE=${get('HUBSTAFF_INGRESS_COOKIE')}`,
    `XSRF-TOKEN=${get('HUBSTAFF_XSRF_TOKEN')}`,
    `_hubstaff_session=${get('HUBSTAFF_SESSION')}`,
    `hubstaff_account_refresh=${get('HUBSTAFF_ACCOUNT_REFRESH')}`,
  ];
  const cfuvid = get('HUBSTAFF_CFUVID');
  if (cfuvid) cookieParts.push(`__cf_uvid=${cfuvid}`);

  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `https://app.hubstaff.com/reports/${orgId}/team/time_and_activities`,
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Token': get('HUBSTAFF_CSRF_TOKEN'),
    Origin: 'https://app.hubstaff.com',
    Connection: 'keep-alive',
    DNT: '1',
    Cookie: cookieParts.join('; '),
  };
}

async function fetchAllMembers(): Promise<HubstaffMember[]> {
  const url = `https://app.hubstaff.com/reports/${process.env.HUBSTAFF_ORG_ID}/members?filters%5Bappend_removed_label%5D=true`;
  const headers = await buildHeaders();
  const all: HubstaffMember[] = [];
  let page = 1;

  while (true) {
    const res = await axios.post<PageResponse>(
      url,
      { page, search: '', selected_only: false, selection: [], selection_type: 'select_all' },
      { headers, maxRedirects: 5, validateStatus: () => true },
    );

    if (res.status < 200 || res.status >= 300) {
      const raw = res.data as unknown;
      const body = typeof raw === 'string'
        ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
        : JSON.stringify(raw).slice(0, 300);
      throw new Error(`Hubstaff API returned HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }

    const { items, pagination } = res.data;
    all.push(...items);
    if (pagination.last_page) break;
    page = pagination.next_page;
  }

  return all;
}

async function upsertMembers(members: HubstaffMember[]): Promise<number> {
  // For unique names: link existing records without hubstaffId (preserves emails)
  const nameCounts: Record<string, number> = {};
  for (const { name } of members) nameCounts[name] = (nameCounts[name] || 0) + 1;

  const uniqueNames = members.filter(({ name }) => nameCounts[name] === 1);
  if (uniqueNames.length > 0) {
    await Member.bulkWrite(
      uniqueNames.map(({ id, name }) => ({
        updateOne: {
          filter: { hubstaffName: name, hubstaffId: { $exists: false } },
          update: { $set: { hubstaffId: id, updatedAt: new Date() } },
        },
      })),
      { ordered: false },
    );
  }

  // Upsert all members by hubstaffId
  const result = await Member.bulkWrite(
    members.map(({ id, name }) => ({
      updateOne: {
        filter: { hubstaffId: id },
        update: {
          $set:         { hubstaffId: id, updatedAt: new Date() },
          $setOnInsert: { hubstaffName: name, createdAt: new Date() },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return result.upsertedCount;
}

export async function POST() {
  try {
    const members = await fetchAllMembers();
    await dbConnect();
    const inserted = await upsertMembers(members);
    return NextResponse.json({ ok: true, inserted, total: members.length });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
