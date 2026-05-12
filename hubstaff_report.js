/**
 * hubstaff_report.js
 * ==================
 * Fetches a Hubstaff daily team report as CSV and maps each member
 * to their tracked hours and activity per date.
 *
 * CSV format (wide):
 *   Organization | Time Zone | Member | 2026-05-04 | 2026-05-05 | ... | Total worked | Activity | Spent total | Currency
 *   Each data row = one member; date columns contain "H:MM:SS" tracked time.
 *   The last row is a totals row (Member cell is empty) — it is skipped.
 *
 * Output shape:
 *   {
 *     "Ali Smith": {
 *       organization: "Micro1 Inc.",
 *       timezone: "America/Los_Angeles",
 *       totalWorked: "8:30:00",
 *       activity: "73%",
 *       dates: {
 *         "2026-05-04": "3:15:00",
 *         "2026-05-05": "5:15:00",
 *         ...
 *       }
 *     },
 *     ...
 *   }
 *
 * Usage:
 *   node hubstaff_report.js
 */

require("dotenv").config();
const axios = require("axios");
const { MongoClient } = require("mongodb");

// ─────────────────────────────────────────────────────────────
// ENV
// ─────────────────────────────────────────────────────────────

const ORG_ID      = process.env.HUBSTAFF_ORG_ID;
const PROJECT_ID  = process.env.HUBSTAFF_PROJECT_ID;
const DATE_START  = process.env.REPORT_DATE_START;
const DATE_END    = process.env.REPORT_DATE_END;

// Hubstaff session cookies — refresh from browser DevTools when expired
const HUBSTAFF_STRIPE_MID      = process.env.HUBSTAFF_STRIPE_MID;
const HUBSTAFF_XSRF_TOKEN      = process.env.HUBSTAFF_XSRF_TOKEN;
const HUBSTAFF_SESSION         = process.env.HUBSTAFF_SESSION;
const HUBSTAFF_ACCOUNT_REFRESH = process.env.HUBSTAFF_ACCOUNT_REFRESH;
const HUBSTAFF_INGRESS_COOKIE  = process.env.HUBSTAFF_INGRESS_COOKIE;

const MONGO_URI        = process.env.MONGO_URI;
const MONGO_DB         = process.env.MONGO_DB;
const MONGO_COLLECTION = process.env.MONGO_COLLECTION;


// ─────────────────────────────────────────────────────────────
// MONGODB LOADER
// ─────────────────────────────────────────────────────────────

/**
 * Loads all members from hubstaff.members and returns:
 *   - userIds: number[]          — hubstaffId for every member
 *   - memberDirectory: Object[]  — { name, personalEmail, micro1Email }
 */
async function loadMembersFromDB() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const docs = await client
      .db(MONGO_DB)
      .collection("members")
      .find({}, { projection: { hubstaffId: 1, hubstaffName: 1, personalEmail: 1, micro1Email: 1, _id: 0 } })
      .toArray();

    const userIds = docs.map((d) => d.hubstaffId);
    const memberDirectory = docs.map((d) => ({
      name: d.hubstaffName,
      personalEmail: d.personalEmail,
      micro1Email: d.micro1Email,
    }));

    return { userIds, memberDirectory };
  } finally {
    await client.close();
  }
}

/**
 * Additional report filter flags.
 * Set to "true" or "false" (strings) as the API expects.
 */
const REPORT_FILTERS = {
  show_email: "true",
  show_job_title: "true",
  show_job_type: "true",
  show_employee_id: "true",
  show_tax_info: "true",
  show_location: "true",
  show_timezone: "true",
  show_date_added: "true",
  show_spent: "true",
  show_activity: "true",
  show_manual: "true",
  show_break_time: "true",
  include_archived: "true",
};

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://app.hubstaff.com/",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  DNT: "1",
  Cookie: [
    `organization=${ORG_ID}`,
    `__stripe_mid=${HUBSTAFF_STRIPE_MID}`,
    `INGRESSCOOKIE=${HUBSTAFF_INGRESS_COOKIE}`,
    `XSRF-TOKEN=${HUBSTAFF_XSRF_TOKEN}`,
    `_hubstaff_session=${HUBSTAFF_SESSION}`,
    `hubstaff_account_refresh=${HUBSTAFF_ACCOUNT_REFRESH}`,
  ].join("; "),
};


// ─────────────────────────────────────────────────────────────
// URL BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Builds the Hubstaff report URL from config values above.
 * @returns {string} Fully encoded URL string
 */
function buildReportUrl(userIds) {
  const base = `https://app.hubstaff.com/reports/${ORG_ID}/team/daily.csv`;

  const params = new URLSearchParams();
  params.append("date", DATE_START);
  params.append("date_end", DATE_END);
  params.append("group_by", "date");

  // Boolean filter flags
  for (const [key, value] of Object.entries(REPORT_FILTERS)) {
    params.append(`filters[${key}]`, value);
  }

  // Organisation filter (required by API)
  params.append(`filters[organization_id]`, ORG_ID);

  // Project filter
  params.append(`filters[projects][]`, PROJECT_ID);

  // User filters
  for (const uid of userIds) {
    params.append(`filters[users][]`, String(uid));
  }

  return `${base}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// HTTP FETCH
// ─────────────────────────────────────────────────────────────

/**
 * Fetches a URL via axios GET and returns the response body as a string.
 * axios throws automatically on non-2xx status codes.
 *
 * @param {string} url
 * @param {Object} headers
 * @returns {Promise<string>}
 */
async function fetchUrl(url, headers) {
  const response = await axios.get(url, {
    headers,
    // Return raw text — CSV is plain text, not JSON
    responseType: "text",
    // Follow redirects automatically (axios default: true)
    maxRedirects: 5,
    // Reject only on network errors; HTTP 4xx/5xx also throw via validateStatus
    validateStatus: (status) => status >= 200 && status < 300,
  });

  return response.data;
}

// ─────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Parses a CSV string into an array of plain objects.
 * Handles quoted fields (including embedded commas).
 * The first row is treated as headers.
 * Strips surrounding quotes from all values.
 *
 * @param {string} csvText
 * @returns {Array<Object>}
 */
function parseCsv(csvText) {
  /**
   * Splits a single CSV line into fields, respecting quoted strings.
   * @param {string} line
   * @returns {string[]}
   */
  function tokeniseRow(line) {
    const fields = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'; // escaped double-quote inside a quoted field
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }

    fields.push(current.trim());
    return fields;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  // Headers: lowercase + underscores, quotes stripped by tokeniser
  const headers = tokeniseRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );

  return lines.slice(1).map((line) => {
    const values = tokeniseRow(line);
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i] ?? "";
      return obj;
    }, {});
  });
}

// ─────────────────────────────────────────────────────────────
// DATE COLUMN DETECTOR
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if a header string looks like a YYYY-MM-DD date.
 * Used to identify the per-day columns in the wide CSV format.
 *
 * @param {string} header
 * @returns {boolean}
 */
function isDateColumn(header) {
  return /^\d{4}-\d{2}-\d{2}$/.test(header);
}

// ─────────────────────────────────────────────────────────────
// MEMBER LOOKUP BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Builds two indexes from MEMBER_DIRECTORY for fast O(1) lookups:
 *   - byName:  lowercased canonical name  → directory entry
 *   - byEmail: lowercased personal email  → directory entry
 *
 * The report's "Member" field can be either a display name (e.g. "Aly Naqvi")
 * or a personal email address (e.g. "alinelmm@gmail.com"), so we need both.
 *
 * @returns {{ byName: Map<string, Object>, byEmail: Map<string, Object> }}
 */
function buildMemberLookup(memberDirectory) {
  const byName = new Map();
  const byEmail = new Map();

  for (const entry of memberDirectory) {
    byName.set(entry.name.toLowerCase().trim(), entry);
    if (entry.personalEmail) {
      byEmail.set(entry.personalEmail.toLowerCase().trim(), entry);
    }
  }

  return { byName, byEmail };
}

/**
 * Resolves a "Member" string from the report to a directory entry.
 * Tries name match first, then personal email match.
 * Returns null if no match is found.
 *
 * @param {string} member  Raw value from the CSV "Member" column
 * @param {{ byName: Map, byEmail: Map }} lookup
 * @returns {Object|null}
 */
function resolveMember(member, lookup) {
  const key = member.toLowerCase().trim();
  return lookup.byName.get(key) || lookup.byEmail.get(key) || null;
}

// ─────────────────────────────────────────────────────────────
// DATA MAPPER
// ─────────────────────────────────────────────────────────────

/**
 * Converts the wide-format CSV rows into a per-member object.
 *
 * CSV structure (one row per member, dates as columns):
 *   Organization | Time Zone | Member | <date> | <date> | ... | Total worked | Activity | Spent total | Currency
 *
 * Output:
 *   {
 *     "<Member Name>": {
 *       organization: string,
 *       timezone:     string,
 *       personalEmail: string,  // from MEMBER_DIRECTORY; null if unmatched
 *       micro1Email:   string,  // from MEMBER_DIRECTORY; null if unmatched
 *       totalWorked:  string,   // "H:MM:SS"
 *       activity:     string,   // "73%"
 *       spentTotal:   string,
 *       currency:     string,
 *       dates: {
 *         "YYYY-MM-DD": string, // tracked time for that day, e.g. "3:15:00"
 *         ...
 *       }
 *     }
 *   }
 *
 * The totals row (empty Member cell) is automatically skipped.
 * Unmatched members still appear in the output with null email fields
 * and a warning logged to stderr.
 *
 * @param {Array<Object>} rows    Output of parseCsv()
 * @param {{ byName: Map, byEmail: Map }} lookup  Output of buildMemberLookup()
 * @returns {Object}
 */
function mapByMemberAndDate(rows, lookup) {
  const result = {};
  const unmatched = [];

  for (const row of rows) {
    const member = row["member"];

    // Skip the totals row at the bottom (Member cell is blank)
    if (!member || member.trim() === "") continue;

    // Collect per-date tracked hours from the dynamically-named date columns
    const dates = {};
    for (const [key, value] of Object.entries(row)) {
      if (isDateColumn(key)) {
        dates[key] = value || "0:00:00";
      }
    }

    // Enrich with email data from the directory
    const dir = resolveMember(member, lookup);
    if (!dir) unmatched.push(member);

    // Use the canonical name from the directory as the key (if matched),
    // otherwise fall back to whatever the report supplies.
    const key = dir ? dir.name : member;

    result[key] = {
      organization: row["organization"] || "",
      timezone: row["time_zone"] || "",
      personalEmail: dir ? dir.personalEmail : null,
      micro1Email: dir ? dir.micro1Email : null,
      totalWorked: row["total_worked"] || "",
      activity: row["activity"] || "",
      spentTotal: row["spent_total"] || "",
      currency: row["currency"] || "",
      dates,
    };
  }

  if (unmatched.length > 0) {
    console.warn(
      `\n⚠️  ${unmatched.length} member(s) not found in MEMBER_DIRECTORY (emails will be null):`,
    );
    unmatched.forEach((m) => console.warn(`   - ${m}`));
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// REPORTER
// ─────────────────────────────────────────────────────────────

/**
 * Prints a compact summary to stdout.
 * @param {Object} mapped  Result of mapByMemberAndDate()
 */
function printSummary(mapped) {
  const members = Object.keys(mapped);
  const sampleDates =
    members.length > 0 ? Object.keys(mapped[members[0]].dates) : [];

  console.log(
    "\n─────────────────────────────────────────────────────────────",
  );
  console.log("  Hubstaff Report Summary");
  console.log(`  Period : ${DATE_START} → ${DATE_END}`);
  console.log(`  Members: ${members.length}`);
  console.log("─────────────────────────────────────────────────────────────");

  // Column header
  const dateCols = sampleDates.map((d) => d.padEnd(12)).join("");
  console.log(
    `\n${"Member".padEnd(40)} ${dateCols}${"Total".padEnd(12)} Activity`,
  );
  console.log("─".repeat(40 + sampleDates.length * 12 + 24));

  for (const [name, data] of Object.entries(mapped)) {
    const datePart = sampleDates
      .map((d) => (data.dates[d] || "—").padEnd(12))
      .join("");
    const line = `${name.padEnd(40)} ${datePart}${data.totalWorked.padEnd(12)} ${data.activity}`;
    console.log(line);
  }

  console.log(
    "\n─────────────────────────────────────────────────────────────\n",
  );
}

// ─────────────────────────────────────────────────────────────
// MONGODB STORAGE
// ─────────────────────────────────────────────────────────────

/**
 * Upserts each member's report data into MongoDB.
 * Uses (dateStart + dateEnd + memberName) as the unique key so
 * re-running the script overwrites rather than duplicates.
 *
 * @param {Object} mapped  Result of mapByMemberAndDate()
 */
async function storeToMongoDB(mapped) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const collection = client.db(MONGO_DB).collection(MONGO_COLLECTION);

    const ops = Object.entries(mapped).map(([memberName, data]) => {
      const { dates, totalWorked, ...rest } = data;

      // Spread each date as a separate dot-notation path so existing dates
      // from prior runs are preserved rather than overwritten.
      const dateFields = Object.fromEntries(
        Object.entries(dates).map(([d, v]) => [`dates.${d}`, v]),
      );

      return {
        updateOne: {
          filter: { memberName },
          update: {
            $set: {
              orgId: ORG_ID,
              projectId: PROJECT_ID,
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

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(
      `✅  MongoDB: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (collection: ${MONGO_DB}.${MONGO_COLLECTION})`,
    );
  } finally {
    await client.close();
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log("Loading members from MongoDB…");
    const { userIds, memberDirectory } = await loadMembersFromDB();
    console.log(`Loaded ${userIds.length} members from DB.`);

    console.log("Building report URL…");
    const url = buildReportUrl(userIds);

    console.log("Fetching CSV from Hubstaff…");
    const csvText = await fetchUrl(url, REQUEST_HEADERS);

    console.log(`Received ${csvText.length} characters. Parsing CSV…`);
    const rows = parseCsv(csvText);

    if (rows.length === 0) {
      console.warn(
        "⚠️  No data rows found. Check your date range, cookies, or filters.",
      );
      return;
    }

    console.log(`Parsed ${rows.length} rows. Building member lookup…`);
    const lookup = buildMemberLookup(memberDirectory);

    console.log("Mapping by member → date…");
    const mapped = mapByMemberAndDate(rows, lookup);

    // ── Print human-readable summary ──
    printSummary(mapped);

    // ── Store to local MongoDB ──
    console.log("Storing to MongoDB…");
    await storeToMongoDB(mapped);
  } catch (err) {
    console.error("❌  Error:", err.message);
    process.exit(1);
  }
}

main();
