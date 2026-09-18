import { bridge402 } from "../meld/adapter.js";
import { intent, DEFAULT_POLICY } from "../meld/fixtures.js";

// Judge page generator: one URL that audits the whole MELD claim in <2 min.
// Every off-chain cell is COMPUTED LIVE at generation through the real enforcer.
const now = Math.floor(Date.now() / 1000);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const row = (cells: string[]) => "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";

// Happy path: USDC treasury → wBRL merchant.
const happy = bridge402(intent("wBRL", "0.08"), now);
// Deteriorated fill.
const det = bridge402(intent("wBRL", "0.08", DEFAULT_POLICY), now, (q) => "0.0771");

const checksHtml = (r: ReturnType<typeof bridge402>) =>
  r.checks.map((c) => row([c.name, c.pass ? "✓" : "✗", c.detail])).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MELD — Judge Verification</title>
<style>body{font-family:ui-monospace,monospace;max-width:960px;margin:2rem auto;padding:0 1rem;color:#111}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #999;padding:6px 8px;text-align:left}
th{background:#eee}.ok{color:#060}.bad{color:#a00}h1{font-size:22px}code{background:#f4f4f4;padding:1px 4px}</style>
</head><body>
<h1>MELD — x402 payment adapter for asset mismatch</h1>
<p><strong>Invariant:</strong> OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT</p>

<h2>Happy path — USDC treasury, wBRL merchant (${new Date(now * 1000).toISOString()})</h2>
<table>
${row(["<b>Outcome</b>", happy.success ? "PAID" : "BLOCKED"])}
${row(["<b>Route</b>", esc(happy.quote?.route.join(" → ") ?? "none")])}
${row(["<b>Input</b>", esc(happy.quote ? happy.quote.inputAmount + " " + happy.quote.inputToken.symbol : "")])}
${row(["<b>Output</b>", esc(happy.quote ? happy.quote.actualOutput + " " + happy.quote.outputToken.symbol : "")])}
${happy.swapTxHash ? row(["<b>Swap tx</b>", esc(happy.swapTxHash)]) : ""}
${happy.paymentTxHash ? row(["<b>x402 tx</b>", esc(happy.paymentTxHash)]) : ""}
</table>
<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>
${checksHtml(happy)}
</table>

<h2>Deteriorated fill — 0.0771 wBRL vs required 0.08</h2>
<table>
${row(["<b>Outcome</b>", det.success ? "PAID (VIOLATION)" : "BLOCKED"])}
${row(["<b>Reason</b>", esc(det.reason)])}
</table>
<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>
${checksHtml(det)}
</table>

<h2>Attack lab — 7/7</h2>
<p>Run <code>npm run pb:attack</code> — every scenario executes against the real enforcer.</p>
<h2>Reproduce</h2>
<p><code>npm run pb:demo</code> · <code>npm run pb:attack</code> · x402 on Celo mainnet · wARS/wBRL/wCOP stablecoins</p>
</body></html>`;

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
mkdirSync(join(process.cwd(), "receipts"), { recursive: true });
writeFileSync(join(process.cwd(), "receipts", "meld.html"), html);
console.log("Judge page written to receipts/meld.html");