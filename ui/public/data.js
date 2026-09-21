/* ============================================================
   SPUR — SEED DATA (demo ledger seeded from live identity)
   ============================================================ */
'use strict';
window.SPUR_DATA = {
  identity: {
    agent: "9858",
    wallet: "0x0D09d1dA79dBeCA81f4C05b5F89024c0d5c8Da12",
    walletShort: "0x0D09…c8Da12",
    tag: "celo_2f0af2c5b513",
    chain: "celo-mainnet",
    chainId: "42220",
    registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    tx: "0x0bbbd5e78719df62cade6c45b10e2a7385844f45061e91f98ac3d63c952ff78a",
    txShort: "0x0bbb…ff78a",
    erc8004: "https://8004scan.io/agents/celo/9858",
    status: "published",
  },

  agents: [
    { id: "AG-901", name: "ResearchBot", type: "buyer", wallet: "0x7C3f…91Aa" },
    { id: "AG-412", name: "Agent-03", type: "buyer", wallet: "0x2B11…f0Dd" },
  ],

  suppliers: [
    { id: "#291", name: "Agent Alpha", fulfilled: 98, price: "0.42", avg: "2 min", orders: 47, earnings: "19.74", skills: "FX · market data" },
    { id: "#293", name: "Agent Beta", fulfilled: 91, price: "0.31", avg: "4 min", orders: 23, earnings: "7.13", skills: "market data · news" },
    { id: "#819", name: "Agent Gamma", fulfilled: 99, price: "0.55", avg: "90 sec", orders: 61, earnings: "33.55", skills: "audit · proofs" },
  ],

  obligations: [
    {
      id: "OBL-1042", buyer: "ResearchBot", buyerId: "AG-901", recipient: "Agent Alpha", recipientId: "#291",
      task: "FX report", note: "EUR/USD 4h window", ceiling: 0.42, settled: 0.31, released: 0.11,
      window: "60s", freshness: "300s", proof: "SPUR-V", state: "settled",
      beats: [
        { n: "AUTHORIZE", t: "09:41:02", on: true }, { n: "OBLIGATE", t: "09:41:02", on: true },
        { n: "EXECUTE", t: "09:42:11", on: true }, { n: "VERIFY", t: "09:42:12", on: true },
        { n: "SETTLE", t: "09:42:14", on: true },
      ],
    },
    {
      id: "OBL-1043", buyer: "ResearchBot", buyerId: "AG-901", recipient: "Agent Beta", recipientId: "#293",
      task: "Market data", note: "BTC 1m ticker", ceiling: 0.80, settled: 0, released: 0,
      window: "300s", freshness: "120s", proof: "SPUR-V", state: "executing",
      beats: [
        { n: "AUTHORIZE", t: "09:43:55", on: true }, { n: "OBLIGATE", t: "09:43:55", on: true },
        { n: "EXECUTE", t: "09:44:31", on: true }, { n: "VERIFY", t: "—", on: false },
        { n: "SETTLE", t: "—", on: false },
      ],
    },
    {
      id: "OBL-1044", buyer: "Agent-03", buyerId: "AG-412", recipient: "Agent Gamma", recipientId: "#819",
      task: "Audit", note: "Post-mortem proofs", ceiling: 1.00, settled: 0.92, released: 0.08,
      window: "7d", freshness: "24h", proof: "SPUR-V", state: "verified",
      beats: [
        { n: "AUTHORIZE", t: "08:01:20", on: true }, { n: "OBLIGATE", t: "08:01:20", on: true },
        { n: "EXECUTE", t: "08:12:44", on: true }, { n: "VERIFY", t: "08:13:02", on: true },
        { n: "SETTLE", t: "—", on: false },
      ],
    },
    {
      id: "OBL-1045", buyer: "ResearchBot", buyerId: "AG-901", recipient: "Agent Alpha", recipientId: "#291",
      task: "Compute", note: "Batch proofs 60s", ceiling: 0.25, settled: 0, released: 0.25,
      window: "60s", freshness: "60s", proof: "SPUR-V", state: "expired",
      beats: [
        { n: "AUTHORIZE", t: "09:02:17", on: true }, { n: "OBLIGATE", t: "09:02:17", on: true },
        { n: "EXECUTE", t: "—", on: false }, { n: "VERIFY", t: "—", on: false },
        { n: "SETTLE", t: "—", on: false },
      ],
    },
  ],

  financing: [
    { id: "FIN-001", ob: "OBL-1042", supplier: "Agent Alpha", advance: 0.29, fee: 0.01, rate: "0.69%", exposure: 0.42, state: "settled" },
    { id: "FIN-002", ob: "OBL-1043", supplier: "Agent Beta", advance: 0.56, fee: 0.01, rate: "0.70%", exposure: 0.80, state: "active" },
  ],
};