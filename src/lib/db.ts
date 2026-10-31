import { promises as fs } from "fs";
import path from "path";
import type { AuditEvent, Decision, Dispute, Submission } from "./types";

// Durable file store (JSON, atomic rename). Source of truth for the UI.
// Server-only. Path: $DATA_DIR/db.json or ./data/db.json. Swap the file for
// Postgres in production — every caller goes through these functions.

interface Db {
  cases: Dispute[];
  events: AuditEvent[];
  submissions: Submission[];
  webhook_ids: string[];
}

const EMPTY: Db = { cases: [], events: [], submissions: [], webhook_ids: [] };

function dbFile() {
  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  return path.join(dir, "db.json");
}

// Serialize writes so concurrent route handlers can't clobber each other.
const g = globalThis as unknown as { __ddQueue?: Promise<unknown>; __ddCache?: { mtime: number; db: Db } };
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const q = (g.__ddQueue ?? Promise.resolve()).then(fn, fn);
  g.__ddQueue = q.catch(() => undefined);
  return q;
}

export async function readDb(): Promise<Db> {
  const file = dbFile();
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw new Error(`Failed to read database file ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (g.__ddCache && g.__ddCache.mtime === stat.mtimeMs) return structuredClone(g.__ddCache.db);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw new Error(`Failed to read database file ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const db = { ...EMPTY, ...(JSON.parse(raw) as Partial<Db>) };
    g.__ddCache = { mtime: stat.mtimeMs, db };
    return structuredClone(db);
  } catch (e) {
    const backup = `${file}.corrupt-${Date.now()}`;
    try { await fs.copyFile(file, backup); } catch { /* best effort — still refuse to proceed */ }
    throw new Error(`Database file ${file} is corrupt (invalid JSON: ${e instanceof Error ? e.message : String(e)}). A copy was saved to ${backup} where possible. Refusing to overwrite the corrupt file — fix or restore it manually.`);
  }
}

async function writeDb(db: Db): Promise<void> {
  const file = dbFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, file);
  try {
    const stat = await fs.stat(file);
    g.__ddCache = { mtime: stat.mtimeMs, db: structuredClone(db) };
  } catch { g.__ddCache = undefined; }
}

async function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await readDb();
    const out = await fn(db);
    await writeDb(db);
    return out;
  });
}

/* ---------------- cases ---------------- */

export async function listCases(): Promise<Dispute[]> {
  const db = await readDb();
  return [...db.cases].sort((a, b) => +new Date(a.seller_response_due_date) - +new Date(b.seller_response_due_date));
}

export async function getCase(id: string): Promise<Dispute | null> {
  const db = await readDb();
  return db.cases.find((c) => c.dispute_id === id) ?? null;
}

export async function upsertCase(c: Dispute): Promise<Dispute> {
  return mutate((db) => {
    const i = db.cases.findIndex((x) => x.dispute_id === c.dispute_id);
    if (i >= 0) db.cases[i] = { ...db.cases[i], ...c, order: { ...db.cases[i].order, ...c.order }, last_decision: c.last_decision ?? db.cases[i].last_decision };
    else db.cases.push(c);
    return structuredClone(c);
  });
}

export async function updateCase(id: string, patch: Partial<Dispute>): Promise<Dispute | null> {
  return mutate((db) => {
    const i = db.cases.findIndex((x) => x.dispute_id === id);
    if (i < 0) return null;
    db.cases[i] = {
      ...db.cases[i],
      ...patch,
      order: patch.order ? { ...db.cases[i].order, ...patch.order } : db.cases[i].order,
      update_time: new Date().toISOString(),
    };
    return structuredClone(db.cases[i]);
  });
}

export async function deleteCase(id: string): Promise<boolean> {
  return mutate((db) => {
    const before = db.cases.length;
    db.cases = db.cases.filter((x) => x.dispute_id !== id);
    return db.cases.length !== before;
  });
}

export async function saveDecision(id: string, d: Decision): Promise<void> {
  await mutate((db) => {
    const i = db.cases.findIndex((x) => x.dispute_id === id);
    if (i >= 0) db.cases[i] = { ...db.cases[i], last_decision: d };
  });
}

/* ---------------- events / submissions ---------------- */

export async function logEvent(dispute_id: string, actor: AuditEvent["actor"], action: string, detail: string): Promise<AuditEvent> {
  const e: AuditEvent = { id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, dispute_id, at: new Date().toISOString(), actor, action, detail };
  await mutate((db) => { db.events.unshift(e); db.events = db.events.slice(0, 1000); });
  return e;
}

export async function listEvents(disputeId?: string): Promise<AuditEvent[]> {
  const db = await readDb();
  return disputeId ? db.events.filter((e) => e.dispute_id === disputeId) : db.events;
}

export async function recordSubmission(s: Omit<Submission, "id">): Promise<Submission> {
  const full: Submission = { ...s, id: `s_${Date.now()}` };
  await mutate((db) => { db.submissions.unshift(full); db.submissions = db.submissions.slice(0, 500); });
  return full;
}

export async function listSubmissions(disputeId?: string): Promise<Submission[]> {
  const db = await readDb();
  return disputeId ? db.submissions.filter((s) => s.dispute_id === disputeId) : db.submissions;
}

export async function seenWebhook(eventId: string): Promise<boolean> {
  const db = await readDb();
  return db.webhook_ids.includes(eventId);
}

export async function markWebhook(eventId: string): Promise<void> {
  await mutate((db) => { if (!db.webhook_ids.includes(eventId)) db.webhook_ids.unshift(eventId); db.webhook_ids = db.webhook_ids.slice(0, 500); });
}
