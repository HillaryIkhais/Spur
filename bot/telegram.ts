import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateObligation,
  obligationHash,
  type Evidence,
  type JobObligation,
} from "../verifier/obligation.js";
import type { FxQuote } from "../verifier/requirements.js";

// CLEAR distribution leg: Telegram job-posting loop + MiniPay-ready HTTP API.
// Lifecycle: OPEN -> ACCEPTED -> SETTLED | REJECTED | EXPIRED.
// Telegram owns the human loop (post / bid / status / reputation).
// Evidence submission is HTTP-only (POST /submit): quotes are too large for
// chat, and routing them through chat would make this server the data source,
// collapsing the trust boundary the protocol exists to enforce.
// Every settlement runs the same deterministic evaluator as the demos:
// provider attestations are rechecked, never trusted.

const PORT = Number(process.env.PORT ?? 8787);
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const DATA_DIR = process.env.CLEAR_DATA_DIR ?? join(process.cwd(), "data");

// Wedge job spec: small, cheap, fast — real data work, verifiable in seconds.
const WEDGE = { count: 10, maxAgeSec: 120, pairs: ["USD/NGN"], amountUsdt: 0.08 };
const JOB_TTL_SEC = 24 * 3600;
const SCHEMA_HASH = "0x5CH3MAfxv1";
const EVIDENCE_HASH = "0x3V1D3NC3src";
const METHOD_HASH = "0xM37H0D5cbn";

type JobStatus = "OPEN" | "ACCEPTED" | "SETTLED" | "REJECTED" | "EXPIRED";

interface JobRecord {
  id: number;
  objective: string;
  amountUsdt: number;
  requester: string;
  provider: string | null;
  status: JobStatus;
  createdAt: number;
  expiresAt: number;
  obligationHash: string;
  resultHash?: string;
  detail?: string;
}

interface RepRecord {
  completed: number;
  rejected: number;
  earned: number;
  disputed: number;
}

let jobs: JobRecord[] = [];
let reps: Record<string, RepRecord> = {};
let nextId = 1843;

function load(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const f = join(DATA_DIR, "jobs.json");
    if (existsSync(f)) {
      const d = JSON.parse(readFileSync(f, "utf8"));
      jobs = d.jobs ?? [];
      reps = d.reps ?? {};
      nextId = d.nextId ?? 1843;
    }
  } catch {
    jobs = [];
    reps = {};
  }
}

function save(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, "jobs.json"), JSON.stringify({ jobs, reps, nextId }));
  } catch {
    // Ephemeral fallback: serve from memory rather than crash the loop.
  }
}

function repOf(user: string): RepRecord {
  let r = reps[user];
  if (!r) {
    r = { completed: 0, rejected: 0, earned: 0, disputed: 0 };
    reps[user] = r;
  }
  return r;
}

function sweep(nowSec: number): void {
  let dirty = false;
  for (const j of jobs) {
    if ((j.status === "OPEN" || j.status === "ACCEPTED") && nowSec > j.expiresAt) {
      j.status = "EXPIRED";
      j.detail = "expired with no verified delivery";
      dirty = true;
    }
  }
  if (dirty) save();
}

function toObligation(job: JobRecord): JobObligation {
  return {
    jobId: job.id,
    parentJobId: 0,
    objective: job.objective,
    count: WEDGE.count,
    maxAgeSec: WEDGE.maxAgeSec,
    pairs: WEDGE.pairs,
    schemaHash: SCHEMA_HASH,
    evidenceHash: EVIDENCE_HASH,
    methodHash: METHOD_HASH,
    amountUsdt: job.amountUsdt,
    expirySec: JOB_TTL_SEC,
    providerAgentId: 0,
    buyerAgentId: 0,
  };
}

export interface SubmitResult {
  ok: boolean;
  settled: boolean;
  resultHash: string;
  receipt: string;
}

export function submitEvidence(
  jobId: number,
  provider: string,
  quotes: FxQuote[],
  nowSec: number = Math.floor(Date.now() / 1000),
): SubmitResult {
  sweep(nowSec);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false, settled: false, resultHash: "", receipt: "unknown job " + jobId };
  if (job.status !== "ACCEPTED") {
    return { ok: false, settled: false, resultHash: "", receipt: "JOB #" + jobId + " is " + job.status };
  }
  if (job.provider !== provider) {
    return { ok: false, settled: false, resultHash: "", receipt: provider + " does not hold JOB #" + jobId };
  }
  const ev: Evidence = {
    quotes,
    sources: [...new Set(quotes.map((q) => q.source))],
    executionReceipt: "submitted by " + provider + " @ " + nowSec,
    attestation: "provider claim - rechecked, never trusted",
  };
  const v = evaluateObligation(toObligation(job), ev, nowSec);
  const rep = repOf(provider);
  if (v.satisfied) {
    job.status = "SETTLED";
    job.resultHash = v.resultHash;
    job.detail = v.detail;
    rep.completed += 1;
    rep.earned += job.amountUsdt;
    save();
    const receipt = "SETTLED JOB #" + jobId + " - $" + job.amountUsdt.toFixed(2) +
      " USDT -> " + provider + " (" + v.detail + ")";
    return { ok: true, settled: true, resultHash: v.resultHash, receipt };
  }
  job.status = "REJECTED";
  job.resultHash = v.resultHash;
  job.detail = v.detail;
  rep.rejected += 1;
  rep.disputed += job.amountUsdt;
  save();
  const receipt = "REJECTED JOB #" + jobId + " - " + v.detail + ". Funds return to " + job.requester + ".";
  return { ok: true, settled: false, resultHash: v.resultHash, receipt };
}

function fmtJob(j: JobRecord): string {
  return "#" + j.id + " [" + j.status + "] " + j.objective +
    " $" + j.amountUsdt.toFixed(2) + " by " + j.requester +
    (j.provider ? " -> " + j.provider : "");
}

const HELP_LINES = [
  "CLEAR: buy verified outcomes from strangers without trusting them.",
  "/fx - one-tap standard FX verification job ($0.08)",
  "/services - bounty tiers, all settled through the same verifier",
  "/job [$amt] <objective> - post custom paid work (default $0.08)",
  "/jobs - list open work",
  "/bid <id> - accept a job",
  "/status <id> - job plus settlement receipt",
  "/rep [@user] - earned work history (default: you)",
  "Providers POST evidence quotes to HTTP /submit.",
];

// Every tier settles through the same deterministic evaluator — different
// bounties for the same verified FX job, not different trust levels.
const SERVICES = [
  { tier: "micro", label: "FX micro-check", amount: 0.03, blurb: "same 10-observation proof, smaller bounty" },
  { tier: "standard", label: "FX verification", amount: 0.08, blurb: "10 fresh USD/NGN observations, 3 sources, provenance" },
  { tier: "priority", label: "FX priority", amount: 0.12, blurb: "same proof, top-of-queue bounty" },
];
const FX_OBJECTIVE = "10 fresh USD/NGN observations, 3 independent sources, provenance attached";

function postJob(user: string, amount: number, objective: string, nowSec: number): JobRecord {
  const job: JobRecord = {
    id: nextId++,
    objective,
    amountUsdt: amount,
    requester: user,
    provider: null,
    status: "OPEN",
    createdAt: nowSec,
    expiresAt: nowSec + JOB_TTL_SEC,
    obligationHash: "",
  };
  job.obligationHash = obligationHash(toObligation(job));
  jobs.push(job);
  save();
  return job;
}

function describeJob(job: JobRecord): string {
  return "JOB #" + job.id + " OPEN: " + job.objective +
    " ($" + job.amountUsdt.toFixed(2) + " USDT, " + WEDGE.count +
    " records, <" + WEDGE.maxAgeSec + "s, provenance required). Providers: /bid " + job.id;
}

function parseAmountToObjective(rest: string): { amount: number; objective: string } | { error: string } {
  const tokens = rest.trim().split(/\s+/);
  const first = tokens[0] ?? "";
  if (/^\$?\d+(\.\d+)?$/.test(first) && tokens.length > 1) {
    const amount = Number(first.replace("$", ""));
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100) {
      return { error: "amount must be between $0.01 and $100" };
    }
    return { amount, objective: tokens.slice(1).join(" ") };
  }
  if (!rest.trim()) return { error: "usage: /job [$amt] <objective>" };
  return { amount: WEDGE.amountUsdt, objective: rest.trim() };
}

export function handleTelegramUpdate(update: any): string {
  const nowSec = Math.floor(Date.now() / 1000);
  sweep(nowSec);
  const text = update?.message?.text as string | undefined;
  const from = update?.message?.from?.username;
  const user = "@" + (from ?? "anon");
  if (!text) return "ignored";
  const msg = text.trim();

  if (msg === "/job" || msg.startsWith("/job ")) {
    const parsed = parseAmountToObjective(msg.slice(4));
    if ("error" in parsed) return parsed.error;
    return describeJob(postJob(user, parsed.amount, parsed.objective, nowSec));
  }
  if (msg === "/fx" || msg.startsWith("/fx ")) {
    const arg = msg.slice(3).trim().toLowerCase();
    const tier = SERVICES.find((s) => s.tier === arg) ?? SERVICES[1];
    return describeJob(postJob(user, tier.amount, FX_OBJECTIVE, nowSec));
  }
  if (msg === "/services") {
    return "Bounty tiers (one-tap via /fx, tiers via /job <amt> <objective>):\n" +
      SERVICES.map((s) => `- ${s.label} $${s.amount.toFixed(2)} — ${s.blurb}`).join("\n") +
      "\nEvery tier settles through the same verifier. No verified proof → no settlement.";
  }
  if (msg === "/jobs") {
    const open = jobs.filter((j) => j.status === "OPEN");
    if (open.length === 0) return "No open jobs. Post one: /job [$amt] <objective>";
    return open.map(fmtJob).join("\n");
  }
  if (msg.startsWith("/bid ")) {
    const id = Number(msg.slice(5).trim());
    const job = jobs.find((j) => j.id === id);
    if (!job) return "unknown job " + id;
    if (job.status !== "OPEN") return "JOB #" + id + " is " + job.status + " - no longer OPEN";
    if (job.requester === user) return "you cannot accept your own job (independent parties only)";
    job.provider = user;
    job.status = "ACCEPTED";
    save();
    return "JOB #" + id + " ACCEPTED by " + user +
      ". Deliver " + WEDGE.count + " records, then POST evidence to /submit. Payment releases only on verification.";
  }
  if (msg.startsWith("/status ")) {
    const id = Number(msg.slice(8).trim());
    const job = jobs.find((j) => j.id === id);
    if (!job) return "unknown job " + id;
    let out = fmtJob(job) + "\nobligation " + job.obligationHash.slice(0, 18) + "...";
    if (job.resultHash) out += "\nresult " + job.resultHash.slice(0, 18) + "...";
    if (job.detail) out += "\n" + job.detail;
    return out;
  }
  if (msg.startsWith("/rep")) {
    const target = msg.slice(4).trim() || user;
    const r = reps[target];
    if (!r) return target + ": no work history yet";
    return target + ": completed: " + r.completed + ", rejected: " + r.rejected +
      ", earned: $" + r.earned.toFixed(2) + ", disputed: $" + r.disputed.toFixed(2);
  }
  if (msg === "/start" || msg === "/help") return HELP_LINES.join("\n");
  return "unknown command. " + HELP_LINES.join(" ");
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: any) => (body += c));
    req.on("end", () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const secret = url.searchParams.get("secret") ?? "";
  const needsAuth = url.pathname === "/telegram" || url.pathname === "/submit";
  if (needsAuth && WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "bad secret" }));
    return;
  }

  if (url.pathname === "/telegram" && req.method === "POST") {
    try {
      const reply = handleTelegramUpdate(JSON.parse(await readBody(req)));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, reply }));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    }
    return;
  }

  if (url.pathname === "/submit" && req.method === "POST") {
    try {
      const { jobId, provider, quotes } = JSON.parse(await readBody(req));
      const r = submitEvidence(Number(jobId), String(provider), quotes as FxQuote[]);
      res.writeHead(r.ok ? 200 : 422, { "content-type": "application/json" });
      res.end(JSON.stringify(r));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "expected { jobId, provider, quotes }" }));
    }
    return;
  }

  if (url.pathname === "/jobs" && req.method === "GET") {
    sweep(Math.floor(Date.now() / 1000));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jobs, invariant: "NO VERIFIED OBLIGATION -> NO SETTLEMENT" }));
    return;
  }

  if (url.pathname === "/reputation" && req.method === "GET") {
    const target = url.searchParams.get("user") ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ user: target, reputation: reps[target] ?? null }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    protocol: "CLEAR v2",
    distribution: ["telegram:/telegram", "minipay:/jobs", "x402:/service/fx-quotes"],
  }));
});

load();

if (process.argv[1]?.includes("telegram")) {
  server.listen(PORT, () => console.log("CLEAR distribution leg on :" + PORT + " (/telegram webhook, /jobs)"));
}

export { jobs };
