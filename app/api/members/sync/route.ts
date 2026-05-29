import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { getCachedCredentials, setCachedCredentials } from '@/lib/credentials-cache';

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
    const client = new MongoClient(process.env.MONGO_URI!);
    try {
      await client.connect();
      const doc = await client.db(process.env.MONGO_DB!).collection('settings').findOne({ _id: 'hubstaff_credentials' as never });
      creds = (doc || {}) as Record<string, string>;
      setCachedCredentials(creds);
    } finally {
      await client.close();
    }
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
      console.error(`[sync] Hubstaff HTTP ${res.status}:`, body);
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
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const collection = client.db(process.env.MONGO_DB!).collection('members');

    // For unique names: link existing records that have no hubstaffId yet (preserves emails etc.)
    const nameCounts: Record<string, number> = {};
    for (const { name } of members) nameCounts[name] = (nameCounts[name] || 0) + 1;

    const uniqueNames = members.filter(({ name }) => nameCounts[name] === 1);
    if (uniqueNames.length > 0) {
      await collection.bulkWrite(
        uniqueNames.map(({ id, name }) => ({
          updateOne: {
            filter: { hubstaffName: name, hubstaffId: { $exists: false } },
            update: { $set: { hubstaffId: id, updatedAt: new Date() } },
          },
        })),
        { ordered: false },
      );
    }

    // Upsert all members by hubstaffId — $setOnInsert only fires for new docs
    const result = await collection.bulkWrite(
      members.map(({ id, name }) => ({
        updateOne: {
          filter: { hubstaffId: id },
          update: {
            $set: { hubstaffId: id, updatedAt: new Date() },
            $setOnInsert: { hubstaffName: name, createdAt: new Date() },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return result.upsertedCount;
  } finally {
    await client.close();
  }
}

export async function POST() {
  try {
    const members = await fetchAllMembers();
    const inserted = await upsertMembers(members);
    return NextResponse.json({ ok: true, inserted, total: members.length });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
