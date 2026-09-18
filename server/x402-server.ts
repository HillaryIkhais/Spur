import { createServer } from "node:http";
import { verifyFxQuotes, hashQuotes } from "../verifier/verify.js";
import { DEFAULT_FX_REQUIREMENTS } from "../verifier/requirements.js";

// Minimal x402-style gateway: paid service discovery + submission endpoint.
// Real Celo x402 flow: client sees 402 with payment requirements (stablecoin,
// payTo, amount), pays on Celo, retries with proof. Here the expensive step
// (settlement) stays behind ClearSettlement + deterministic verify.
const PORT = Number(process.env.PORT ?? 8787);
const PAY_TO = process.env.PAY_TO ?? "0xC1E4R000000000000000000000000000000000001";
const PRICE_USDT = "0.06";
const USDT_CELO = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"; // USDT0 on Celo mainnet (docs)

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/service/fx-quotes" && req.method === "GET") {
    const paid = req.headers["x-payment"];
    if (!paid) {
      res.writeHead(402, { "content-type": "application/json" });
      res.end(JSON.stringify({
        x402Version: 1,
        error: "payment required",
        accepts: [{
          scheme: "exact",
          network: "celo",
          asset: USDT_CELO,
          payTo: PAY_TO,
          amount: PRICE_USDT,
          maxTimeoutSeconds: 120,
        }],
        resource: "/service/fx-quotes",
        spec: { count: 100, freshnessSec: 60, pair: "USD/NGN", provenance: "required" },
        note: "Payment locks a CLEAR commitment; settlement only after deterministic verification.",
      }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "paid — submit work to /submit with resultHash" }));
    return;
  }

  if (url.pathname === "/submit" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { quotes } = JSON.parse(body);
        const v = verifyFxQuotes(quotes, DEFAULT_FX_REQUIREMENTS);
        res.writeHead(v.valid ? 200 : 422, { "content-type": "application/json" });
        res.end(JSON.stringify({
          valid: v.valid,
          resultHash: hashQuotes(quotes),
          checks: v.checks,
          reason: v.reason,
          settlement: v.valid ? "VERIFIED → SETTLED on Celo" : "BLOCKED → REFUNDED",
        }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad request: expected { quotes: FxQuote[] }" }));
      }
    });
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ protocol: "CLEAR", invariant: "NO VERIFIED WORK → NO SETTLEMENT", endpoints: ["GET /service/fx-quotes", "POST /submit"] }));
});

server.listen(PORT, () => console.log(`CLEAR x402 gateway on :${PORT} (Celo, USDT ${PRICE_USDT})`));
