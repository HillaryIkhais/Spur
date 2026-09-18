#!/usr/bin/env npx tsx
/**
 * SPUR — Celo Mainnet Deployment
 *
 * Deploys SpurObligation contract on Celo mainnet.
 * Uses real USDC/USDT for settlement.
 * Requires:
 *   - DEPLOYER_PRIVATE_KEY (funded with CELO for gas)
 *   - SPUR_VERIFIER_PRIVATE_KEY (independent verifier EOA)
 *   - CELO_ATTRIBUTION_TAG (from Celo Builders registration)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toDataSuffix } from "@celo/attribution-tags";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Configuration ───────────────────────────────────────────────────────────

const MAINNET_RPC = "https://forno.celo.org";
const EXPLORER = "https://celoscan.io";
const ATTRIBUTION_TAG = process.env.CELO_ATTRIBUTION_TAG as Hex | undefined;

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
    default: { name: "Celoscan", url: EXPLORER },
  },
} as const;

// Real USDC on Celo mainnet
const USDC_ADDRESS = "0xcebA987936b8ce630522997735689B31C82bcA33" as Address;

// ─── Contract ABIs ──────────────────────────────────────────────────────────

const SPUR_BYTECODE_PATH = join(import.meta.dirname, "..", "out", "SpurObligation.sol", "SpurObligation.json");

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
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

function txUrl(hash: Hex): string {
  return `${EXPLORER}/tx/${hash}`;
}

function addrUrl(addr: Address): string {
  return `${EXPLORER}/address/${addr}`;
}

function tagData(data: Hex): Hex {
  if (!ATTRIBUTION_TAG) return data;
  return toDataSuffix(data, [ATTRIBUTION_TAG]) as Hex;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("🚀", "SPUR — Celo Mainnet Deployment");
  log("📍", `Network: Celo Mainnet (${CELO_MAINNET.id})`);
  log("🔍", `Explorer: ${EXPLORER}`);
  console.log();

  if (!ATTRIBUTION_TAG) {
    log("❌", "CELO_ATTRIBUTION_TAG not set. Set it before deploying.");
    log("   ", "Get your tag from: GET /submissions/me on celobuilders.xyz");
    process.exit(1);
  }
  log("🏷️", `Attribution tag: ${ATTRIBUTION_TAG}`);

  // ─── Load keys ──────────────────────────────────────────────────────────

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  const verifierKey = process.env.SPUR_VERIFIER_PRIVATE_KEY as Hex | undefined;

  if (!deployerKey || !verifierKey) {
    log("❌", "Missing env vars: DEPLOYER_PRIVATE_KEY, SPUR_VERIFIER_PRIVATE_KEY");
    process.exit(1);
  }

  const deployer = privateKeyToAccount(deployerKey);
  const verifier = privateKeyToAccount(verifierKey);

  log("🔑", `Deployer:  ${deployer.address}`);
  log("🔑", `Verifier:  ${verifier.address}`);
  console.log();

  // ─── Create clients ──────────────────────────────────────────────────────

  const deployerWallet = createWalletClient({ chain: CELO_MAINNET, account: deployer, transport: http(MAINNET_RPC) });
  const publicClient = createPublicClient({ chain: CELO_MAINNET, transport: http(MAINNET_RPC) });

  // ─── Check balances ──────────────────────────────────────────────────────

  log("⏳", "Checking balances...");
  const deployerBal = await publicClient.getBalance({ address: deployer.address });
  const usdcBal = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [deployer.address],
  });

  log("💰", `Deployer CELO: ${Number(deployerBal) / 1e18} CELO`);
  log("💰", `Deployer USDC: ${Number(usdcBal) / 1e6} USDC`);
  console.log();

  if (deployerBal === 0n) {
    log("❌", "Deployer has no CELO for gas. Fund the deployer wallet.");
    process.exit(1);
  }

  // ─── Deploy SpurObligation ──────────────────────────────────────────────

  log("📦", "Deploying SpurObligation contract...");

  const spurArtifact = JSON.parse(readFileSync(SPUR_BYTECODE_PATH, "utf-8"));
  const spurBytecode = spurArtifact.bytecode.object;
  if (!spurBytecode || spurBytecode === "0x") {
    log("❌", "Contract not compiled. Run: forge build");
    process.exit(1);
  }

  // Append ABI-encoded constructor args
  const verifierArg = verifier.address.toLowerCase().replace("0x", "").padStart(64, "0");
  const initCode = ("0x" + spurBytecode + verifierArg) as Hex;

  const deployData = tagData(initCode);
  const deployHash = await deployerWallet.sendTransaction({
    account: deployer,
    chain: CELO_MAINNET,
    data: deployData,
  });

  log("⏳", "Waiting for deploy receipt...");
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

  if (deployReceipt.status !== "success") {
    log("❌", "Deploy failed!");
    process.exit(1);
  }

  const contractAddress = deployReceipt.contractAddress!;
  log("✅", `Contract deployed: ${contractAddress}`);
  log("🔗", txUrl(deployHash));
  log("🔍", addrUrl(contractAddress));
  console.log();

  // Verify verifier
  const onChainVerifier = await publicClient.readContract({
    address: contractAddress,
    abi: SPUR_ABI,
    functionName: "verifier",
  });
  log("✅", `Verifier on-chain: ${onChainVerifier}`);

  // ─── Save deployment info ────────────────────────────────────────────────

  const deployment = {
    network: "celo-mainnet",
    chainId: 42220,
    contract: contractAddress,
    verifier: verifier.address,
    token: USDC_ADDRESS,
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    deployer: deployer.address,
    deployTx: deployHash,
    deployedAt: new Date().toISOString(),
    attributionTag: ATTRIBUTION_TAG,
  };

  const deployDir = join(import.meta.dirname, "..", "deployments");
  mkdirSync(deployDir, { recursive: true });
  const deployPath = join(deployDir, "celo-mainnet.json");
  writeFileSync(deployPath, JSON.stringify(deployment, null, 2));
  log("📝", `Deployment saved: ${deployPath}`);
  console.log();

  // ─── Summary ─────────────────────────────────────────────────────────────

  log("━".repeat(60));
  log("🎯", "SPUR CELO MAINNET DEPLOYMENT — COMPLETE");
  log("━".repeat(60));
  console.log();
  log("📋", "Deployment info:");
  log("   ", `Contract:    ${contractAddress}`);
  log("   ", `Verifier:    ${verifier.address}`);
  log("   ", `Token:       ${USDC_ADDRESS} (USDC)`);
  log("   ", `Deployer:    ${deployer.address}`);
  log("   ", `Deploy TX:   ${deployHash}`);
  log("   ", `Attribution: ${ATTRIBUTION_TAG}`);
  console.log();
  log("💡", "Next steps:");
  log("   ", "1. Verify contract on Celoscan (optional)");
  log("   ", "2. Set env vars for spur-api.ts:");
  log("   ", `   SPUR_CONTRACT=${contractAddress}`);
  log("   ", `   SPUR_TOKEN=${USDC_ADDRESS}`);
  log("   ", `   SPUR_VERIFIER_KEY=<verifier private key>`);
  log("   ", `   CELO_NET=mainnet`);
  log("   ", `   CELO_ATTRIBUTION_TAG=${ATTRIBUTION_TAG}`);
  log("   ", "3. Run: npx tsx scripts/spur-api.ts");
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
