#!/usr/bin/env npx tsx
/**
 * SPUR — Agent-Facing API
 *
 * Machine interface for creating, querying, and resolving economic obligations.
 * Agents invoke this API. The dashboard observes it.
 *
 * POST /obligations          — Create obligation
 * GET  /obligations/:id      — Query obligation state
 * POST /obligations/:id/ack  — Supplier acknowledges
 * POST /obligations/:id/submit — Supplier submits work
 * POST /obligations/:id/resolve — Verifier settles or rejects
 * GET  /health               — Health check
 */

import express from "express";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toDataSuffix } from "@celo/attribution-tags";

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3004", 10);
const NETWORK = (process.env.CELO_NET || "mainnet") as "mainnet" | "sepolia";
const ATTRIBUTION_TAG = process.env.CELO_ATTRIBUTION_TAG as Hex | undefined;

const MAINNET_RPC = "https://forno.celo.org";
const MAINNET_EXPLORER = "https://celoscan.io";
const SEPOLIA_RPC = "https://forno.celo-sepolia.celo-testnet.org";
const SEPOLIA_EXPLORER = "https://celo-sepolia.blockscout.com";

const RPC = NETWORK === "mainnet" ? MAINNET_RPC : SEPOLIA_RPC;
const EXPLORER = NETWORK === "mainnet" ? MAINNET_EXPLORER : SEPOLIA_EXPLORER;

// Celo Mainnet chain config
const CELO_MAINNET = {
  id: 42220,
  name: "Celo",
  network: "celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [MAINNET_RPC] },
    public: { http: [MAINNET_RPC] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: MAINNET_EXPLORER },
  },
} as const;

// Celo Sepolia chain config
const CELO_SEPOLIA = {
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [SEPOLIA_RPC] },
    public: { http: [SEPOLIA_RPC] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: SEPOLIA_EXPLORER },
  },
} as const;

const CHAIN = NETWORK === "mainnet" ? CELO_MAINNET : CELO_SEPOLIA;

// ─── Contract ABI ────────────────────────────────────────────────────────────

const SPUR_ABI = [
  {
    name: "createObligation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "supplier", type: "address" },
      { name: "token", type: "address" },
      { name: "maxAmount", type: "uint256" },
      { name: "expirySeconds", type: "uint256" },
      { name: "taskHash", type: "bytes32" },
      { name: "conditionHash", type: "bytes32" },
      { name: "buyerAgentId", type: "uint256" },
      { name: "supplierAgentId", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "acknowledge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "submitWork",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "resolve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "satisfied", type: "bool" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "obligations",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "buyer", type: "address" },
          { name: "supplier", type: "address" },
          { name: "token", type: "address" },
          { name: "maxAmount", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "taskHash", type: "bytes32" },
          { name: "conditionHash", type: "bytes32" },
          { name: "status", type: "uint8" },
          { name: "resultHash", type: "bytes32" },
          { name: "buyerAgentId", type: "uint256" },
          { name: "supplierAgentId", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "nextObligationId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "verifier",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "ObligationCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "supplier", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "maxAmount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint256", indexed: false },
      { name: "taskHash", type: "bytes32", indexed: false },
      { name: "buyerAgentId", type: "uint256", indexed: false },
      { name: "supplierAgentId", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WorkSubmitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "resultHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "supplier", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Rejected",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Status map ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<number, string> = {
  0: "NONE",
  1: "AUTHORIZED",
  2: "EXECUTING",
  3: "SUBMITTED",
  4: "SETTLED",
  5: "REJECTED",
  6: "EXPIRED",
};

// ─── Load deployment ─────────────────────────────────────────────────────────

function loadDeployment(): { contractAddress: Address; tokenAddress: Address; verifierKey: Hex } {
  const contractAddress = process.env.SPUR_CONTRACT as Address | undefined;
  const tokenAddress = process.env.SPUR_TOKEN as Address | undefined;
  const verifierKey = process.env.SPUR_VERIFIER_KEY as Hex | undefined;

  if (!contractAddress || !tokenAddress || !verifierKey) {
    console.error("❌ Missing env vars: SPUR_CONTRACT, SPUR_TOKEN, SPUR_VERIFIER_KEY");
    console.error("   Run spur-proof.ts first to deploy, then set these env vars.");
    process.exit(1);
  }

  return { contractAddress, tokenAddress, verifierKey };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function tagData(data: Hex): Hex {
  if (!ATTRIBUTION_TAG) return data;
  return toDataSuffix(data, [ATTRIBUTION_TAG]) as Hex;
}

function main() {
  const { contractAddress, tokenAddress, verifierKey } = loadDeployment();

  const verifier = privateKeyToAccount(verifierKey);
  const publicClient: PublicClient = createPublicClient({
    chain: CHAIN,
    transport: http(RPC),
  });
  const verifierWallet: WalletClient = createWalletClient({
    chain: CHAIN,
    account: verifier,
    transport: http(RPC),
  });

  const app = express();
  app.use(express.json());

  // ─── Health ────────────────────────────────────────────────────────────

  app.get("/health", async (_req, res) => {
    try {
      const blockNumber = await publicClient.getBlockNumber();
      const nextId = await publicClient.readContract({
        address: contractAddress,
        abi: SPUR_ABI,
        functionName: "nextObligationId",
      });
      res.json({
        status: "ok",
        network: NETWORK === "mainnet" ? "Celo Mainnet" : "Celo Sepolia",
        chainId: CHAIN.id,
        contract: contractAddress,
        token: tokenAddress,
        verifier: verifier.address,
        explorer: EXPLORER,
        blockNumber: Number(blockNumber),
        nextObligationId: Number(nextId),
        attributionTag: ATTRIBUTION_TAG || "not set",
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // ─── Create obligation ─────────────────────────────────────────────────

  app.post("/obligations", async (req, res) => {
    try {
      const {
        buyer,
        supplier,
        maxAmount,
        expirySeconds,
        task,
        condition,
        buyerAgentId = 0,
        supplierAgentId = 0,
      } = req.body;

      if (!buyer || !supplier || !maxAmount || !expirySeconds || !task || !condition) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["buyer", "supplier", "maxAmount", "expirySeconds", "task", "condition"],
        });
      }

      // Hash task and condition
      const { keccak256, toBytes } = await import("viem");
      const taskHash = keccak256(toBytes(task));
      const conditionHash = keccak256(toBytes(condition));

      // Convert maxAmount to wei (assuming 18 decimals)
      const maxAmountWei = BigInt(Math.round(parseFloat(maxAmount) * 1e18));

      // Create wallet for buyer (in production, buyer signs this)
      const buyerKey = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
      if (!buyerKey) {
        return res.status(500).json({ error: "BUYER_PRIVATE_KEY not set" });
      }
      const buyerAccount = privateKeyToAccount(buyerKey);
      const buyerWallet = createWalletClient({
        chain: CHAIN,
        account: buyerAccount,
        transport: http(RPC),
      });

      // Approve token (with attribution tag)
      const approveData = tagData(encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contractAddress, maxAmountWei],
      }) as Hex);
      const approveTx = await buyerWallet.sendTransaction({
        account: buyerAccount,
        chain: CHAIN,
        to: tokenAddress,
        data: approveData,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      // Create obligation (with attribution tag)
      const createData = tagData(encodeFunctionData({
        abi: SPUR_ABI,
        functionName: "createObligation",
        args: [
          supplier as Address,
          tokenAddress,
          maxAmountWei,
          BigInt(expirySeconds),
          taskHash,
          conditionHash,
          BigInt(buyerAgentId),
          BigInt(supplierAgentId),
        ],
      }) as Hex);
      const createTx = await buyerWallet.sendTransaction({
        account: buyerAccount,
        chain: CHAIN,
        to: contractAddress,
        data: createData,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });

      // Get obligation ID from event
      const obligationId = await publicClient.readContract({
        address: contractAddress,
        abi: SPUR_ABI,
        functionName: "nextObligationId",
      });

      res.json({
        success: true,
        obligationId: Number(obligationId) - 1,
        spId: `SP-${String(Number(obligationId) - 1).padStart(4, "0")}`,
        txHash: createTx,
        explorer: `${EXPLORER}/tx/${createTx}`,
        contract: contractAddress,
        status: "AUTHORIZED",
        buyer,
        supplier,
        maxAmount: maxAmount + " cUSD",
        expiry: `${expirySeconds}s from now`,
        taskHash,
        conditionHash,
      });
    } catch (e: any) {
      console.error("Create obligation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Query obligation ──────────────────────────────────────────────────

  app.get("/obligations/:id", async (req, res) => {
    try {
      const id = BigInt(req.params.id);
      const ob = await publicClient.readContract({
        address: contractAddress,
        abi: SPUR_ABI,
        functionName: "obligations",
        args: [id],
      });

      res.json({
        id: Number(id),
        spId: `SP-${String(Number(id)).padStart(4, "0")}`,
        status: STATUS_MAP[ob.status] || `UNKNOWN(${ob.status})`,
        statusId: ob.status,
        buyer: ob.buyer,
        supplier: ob.supplier,
        token: ob.token,
        maxAmount: `${Number(ob.maxAmount) / 1e18} cUSD`,
        expiry: Number(ob.expiry),
        expiryDate: new Date(Number(ob.expiry) * 1000).toISOString(),
        taskHash: ob.taskHash,
        conditionHash: ob.conditionHash,
        resultHash: ob.resultHash === "0x0000000000000000000000000000000000000000000000000000000000000000" ? null : ob.resultHash,
        buyerAgentId: Number(ob.buyerAgentId),
        supplierAgentId: Number(ob.supplierAgentId),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Supplier acknowledges ─────────────────────────────────────────────

  app.post("/obligations/:id/ack", async (req, res) => {
    try {
      const id = BigInt(req.params.id);
      const supplierKey = process.env.SUPPLIER_PRIVATE_KEY as Hex | undefined;
      if (!supplierKey) {
        return res.status(500).json({ error: "SUPPLIER_PRIVATE_KEY not set" });
      }
      const supplierAccount = privateKeyToAccount(supplierKey);
      const supplierWallet = createWalletClient({
        chain: CHAIN,
        account: supplierAccount,
        transport: http(RPC),
      });

      const data = tagData(encodeFunctionData({
        abi: SPUR_ABI,
        functionName: "acknowledge",
        args: [id],
      }) as Hex);
      const tx = await supplierWallet.sendTransaction({
        account: supplierAccount,
        chain: CHAIN,
        to: contractAddress,
        data,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      res.json({
        success: true,
        obligationId: Number(id),
        spId: `SP-${String(Number(id)).padStart(4, "0")}`,
        status: "EXECUTING",
        txHash: tx,
        explorer: `${EXPLORER}/tx/${tx}`,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Supplier submits work ─────────────────────────────────────────────

  app.post("/obligations/:id/submit", async (req, res) => {
    try {
      const id = BigInt(req.params.id);
      const { result } = req.body;
      if (!result) {
        return res.status(400).json({ error: "Missing 'result' field" });
      }

      const { keccak256, toBytes } = await import("viem");
      const resultHash = keccak256(toBytes(result));

      const supplierKey = process.env.SUPPLIER_PRIVATE_KEY as Hex | undefined;
      if (!supplierKey) {
        return res.status(500).json({ error: "SUPPLIER_PRIVATE_KEY not set" });
      }
      const supplierAccount = privateKeyToAccount(supplierKey);
      const supplierWallet = createWalletClient({
        chain: CHAIN,
        account: supplierAccount,
        transport: http(RPC),
      });

      const data = tagData(encodeFunctionData({
        abi: SPUR_ABI,
        functionName: "submitWork",
        args: [id, resultHash],
      }) as Hex);
      const tx = await supplierWallet.sendTransaction({
        account: supplierAccount,
        chain: CHAIN,
        to: contractAddress,
        data,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      res.json({
        success: true,
        obligationId: Number(id),
        spId: `SP-${String(Number(id)).padStart(4, "0")}`,
        status: "SUBMITTED",
        resultHash,
        txHash: tx,
        explorer: `${EXPLORER}/tx/${tx}`,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Verifier resolves ─────────────────────────────────────────────────

  app.post("/obligations/:id/resolve", async (req, res) => {
    try {
      const id = BigInt(req.params.id);
      const { satisfied, reason = "" } = req.body;
      if (typeof satisfied !== "boolean") {
        return res.status(400).json({ error: "Missing 'satisfied' boolean field" });
      }

      const data = tagData(encodeFunctionData({
        abi: SPUR_ABI,
        functionName: "resolve",
        args: [id, satisfied, reason],
      }) as Hex);
      const tx = await verifierWallet.sendTransaction({
        account: verifier,
        chain: CHAIN,
        to: contractAddress,
        data,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });

      res.json({
        success: true,
        obligationId: Number(id),
        spId: `SP-${String(Number(id)).padStart(4, "0")}`,
        status: satisfied ? "SETTLED" : "REJECTED",
        settlement: satisfied ? "0.42 cUSD → Supplier" : "$0.00 → Buyer refunded",
        txHash: tx,
        explorer: `${EXPLORER}/tx/${tx}`,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── List all obligations (convenience) ────────────────────────────────

  app.get("/obligations", async (_req, res) => {
    try {
      const nextId = await publicClient.readContract({
        address: contractAddress,
        abi: SPUR_ABI,
        functionName: "nextObligationId",
      });
      const count = Number(nextId);
      const obligations = [];
      for (let i = 1; i < count; i++) {
        const ob = await publicClient.readContract({
          address: contractAddress,
          abi: SPUR_ABI,
          functionName: "obligations",
          args: [BigInt(i)],
        });
        obligations.push({
          id: i,
          spId: `SP-${String(i).padStart(4, "0")}`,
          status: STATUS_MAP[ob.status] || `UNKNOWN(${ob.status})`,
          buyer: ob.buyer,
          supplier: ob.supplier,
          maxAmount: `${Number(ob.maxAmount) / 1e18} cUSD`,
        });
      }
      res.json({ count: obligations.length, obligations });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Start ─────────────────────────────────────────────────────────────

  app.listen(PORT, () => {
    console.log();
    console.log("━".repeat(60));
    console.log("  SPUR — Agent-Facing API");
    console.log("━".repeat(60));
    console.log();
    console.log(`  🌐  http://localhost:${PORT}`);
    console.log(`  📍  Network: ${NETWORK === "mainnet" ? "Celo Mainnet (42220)" : "Celo Sepolia (11142220)"}`);
    console.log(`  📦  Contract: ${contractAddress}`);
    console.log(`  🪙  Token: ${tokenAddress}`);
    console.log(`  🔑  Verifier: ${verifier.address}`);
    console.log(`  🔍  Explorer: ${EXPLORER}`);
    if (ATTRIBUTION_TAG) {
      console.log(`  🏷️   Attribution: ${ATTRIBUTION_TAG}`);
    } else {
      console.log(`  ⚠️   Attribution: NOT SET — set CELO_ATTRIBUTION_TAG`);
    }
    console.log();
    console.log("  Endpoints:");
    console.log(`    GET  /health              — Health check`);
    console.log(`    POST /obligations         — Create obligation`);
    console.log(`    GET  /obligations         — List all obligations`);
    console.log(`    GET  /obligations/:id     — Query obligation`);
    console.log(`    POST /obligations/:id/ack — Supplier acknowledges`);
    console.log(`    POST /obligations/:id/submit — Supplier submits work`);
    console.log(`    POST /obligations/:id/resolve — Verifier settles/rejects`);
    console.log();
    console.log("  Agent flow:");
    console.log("    1. POST /obligations (buyer agent)");
    console.log("    2. POST /obligations/:id/ack (supplier agent)");
    console.log("    3. POST /obligations/:id/submit (supplier agent)");
    console.log("    4. POST /obligations/:id/resolve (verifier)");
    console.log();
  });
}

main();
