// providers/celo.ts — real Celo provider. One-way: Celo → MELD.
// The policy engine never manufactures the actual fill: it reads the chain.
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  encodeFunctionData,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  celo as celoMainnet,
  celoSepolia as _celoSepolia,
} from "viem/chains";

export const CELO_MAINNET_RPC = "https://forno.celo.org";
export const CELO_SEPOLIA_RPC = ["https://rpc.ankr.com/celo_sepolia", "https://celo-sepolia.drpc.org"];

export const CHAIN_MAINNET: Chain = {
  ...celoMainnet,
  rpcUrls: {
    default: { http: [CELO_MAINNET_RPC] },
    public: { http: [CELO_MAINNET_RPC] },
  },
};

export const CHAIN_SEPOLIA: Chain = {
  ..._celoSepolia,
  rpcUrls: {
    default: { http: CELO_SEPOLIA_RPC },
    public: { http: CELO_SEPOLIA_RPC },
  },
};

export const NETS = { mainnet: CHAIN_MAINNET, sepolia: CHAIN_SEPOLIA } as const;
export type CeloNet = keyof typeof NETS;

export interface CeloClients {
  net: CeloNet;
  chainId: number;
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  account: Account | null;
}

export function makeClients(net: CeloNet): CeloClients {
  const chain = NETS[net];
  const publicClient = createPublicClient({ chain, transport: http() });
  const priv = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  let walletClient: WalletClient | null = null;
  let account: Account | null = null;
  if (priv) {
    try {
      account = privateKeyToAccount(priv);
      walletClient = createWalletClient({ chain, account, transport: http() });
    } catch {
      account = null;
      walletClient = null;
    }
  }
  return { net, chainId: chain.id, publicClient, walletClient, account };
}

if (!process.env.AGENT_PRIVATE_KEY) {
  console.warn("[providers/celo] AGENT_PRIVATE_KEY not set — observation mode only (read + simulate tx).");
}

// ---------------------------------------------------------------------------
// Token / pool registry — mainnet addresses verified from chain during build.
// ---------------------------------------------------------------------------

export interface TokenFallback {
  symbol: string;
  decimals: number;
}

export interface V2PairDef {
  name: string;
  address: Address;
  token0: TokenFallback & { address: Address };
  token1: TokenFallback & { address: Address };
}

// Celo mainnet. Discovered live: pair 0x462f… is USDm/USDC with active swaps.
export const MAINNET_PAIRS: V2PairDef[] = [
  {
    name: "USDm/USDC",
    address: "0x462fe04b4fd719cbd04c0310365d421d02aaa19e",
    token0: { symbol: "USDm", decimals: 18, address: "0x765DE816845861e75A25fCA122bb6898B8B1282a" },
    token1: { symbol: "USDC", decimals: 6, address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" },
  },
];

export const TOKEN_FALLBACKS: Record<string, TokenFallback> = {
  USDC: { symbol: "USDC", decimals: 6 },
  USDm: { symbol: "USDm", decimals: 18 },
};

// Real, chain-verified swap on Celo mainnet used as the replay seed.
export const REF_SWAP_MAINNET = {
  pair: MAINNET_PAIRS[0],
  txHash: "0x2a7847bea00a8182cbeaa06107851222e22bee2c225c4978e5b32f71855df4ed" as Hex,
};

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

export const ERC20_ABI = [
  { name: "symbol", type: "function", stateMutability: "view" as const, inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view" as const, inputs: [], outputs: [{ type: "uint8" }] },
  { name: "balanceOf", type: "function", stateMutability: "view" as const, inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view" as const, inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable" as const, inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable" as const, inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const V2_PAIR_ABI = [
  { name: "token0", type: "function", stateMutability: "view" as const, inputs: [], outputs: [{ type: "address" }] },
  { name: "token1", type: "function", stateMutability: "view" as const, inputs: [], outputs: [{ type: "address" }] },
  { name: "getReserves", type: "function", stateMutability: "view" as const, inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { name: "swap", type: "function", stateMutability: "nonpayable" as const, inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes" }], outputs: [] },
] as const;

export const V2_SWAP_EVENT = {
  type: "event",
  name: "Swap",
  inputs: [
    { type: "address", name: "sender", indexed: true },
    { type: "uint256", name: "amount0In", indexed: false },
    { type: "uint256", name: "amount1In", indexed: false },
    { type: "uint256", name: "amount0Out", indexed: false },
    { type: "uint256", name: "amount1Out", indexed: false },
    { type: "address", name: "to", indexed: true },
  ],
} as const;

const SWAP_TOPIC = keccak256(toHex("Swap(address,uint256,uint256,uint256,uint256,address)"));

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function toHuman(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, "0");
  const dot = s.length - decimals;
  const whole = s.slice(0, dot);
  const frac = s.slice(dot);
  const trimmed = (whole + "." + frac).replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

export async function tokenMeta(client: PublicClient, token: Address): Promise<TokenFallback> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
  ]);
  return { symbol, decimals };
}

export async function resolveTokenMeta(client: PublicClient, token: Address): Promise<TokenFallback> {
  try {
    return await tokenMeta(client, token);
  } catch {
    return TOKEN_FALLBACKS[token.toLowerCase()] ?? { symbol: "UNKNOWN", decimals: 18 };
  }
}

export async function getReserves(client: PublicClient, pair: Address) {
  const [t0, t1, res] = await Promise.all([
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "token0" }),
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "token1" }),
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "getReserves" }),
  ]);
  return { token0: t0, token1: t1, reserve0: res[0], reserve1: res[1] };
}

/**
 * On-chain quote for a V2 pool (k invariant, 0.3% standard fee).
 * amountInRaw must be in the input token's raw units.
 * Returns raw output for the pool's OTHER token with the SAME decimals domain
 * (reserves are raw, so the k-equation is decimals-agnostic).
 */
export function quoteV2(
  reserves: { reserve0: bigint; reserve1: bigint },
  tokenInIsToken0: boolean,
  amountInRaw: bigint,
): bigint {
  const rIn = tokenInIsToken0 ? reserves.reserve0 : reserves.reserve1;
  const rOut = tokenInIsToken0 ? reserves.reserve1 : reserves.reserve0;
  if (amountInRaw <= 0n) return 0n;
  const amountInWithFee = amountInRaw * 997n;
  const numerator = amountInWithFee * rOut;
  const denominator = rIn * 1000n + amountInWithFee;
  return denominator === 0n ? 0n : numerator / denominator;
}

// ---------------------------------------------------------------------------
// Chain observation — the ONLY source of "actual fill".
// ---------------------------------------------------------------------------

export interface ObservedFill {
  txHash: Hex;
  blockNumber: bigint;
  timestamp: bigint;
  pair: Address;
  tokenIn: { address: Address; symbol: string; decimals: number };
  tokenOut: { address: Address; symbol: string; decimals: number };
  route: string[];
  actualInput: string; // human, tokenIn units — paid
  actualOutput: string; // human, tokenOut units — received
  quoteOutput: string; // human, tokenOut units — chain-derived quote for same input
  impactPct: number; // (1 - actual/quote) * 100
  feePct: number; // observed execution fee (pool fee + impact)
}

export interface SwapLog {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  sender: Address;
  to: Address;
}

export function decodeSwapLog(log: { address: Address; data: Hex; topics: Hex[] }): SwapLog {
  const indexed = log.topics;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  const w = (off: number) => BigInt("0x" + (data.slice(off * 64, off * 64 + 64) || "0"));
  return {
    sender: indexed[1] as Address,
    amount0In: w(0),
    amount1In: w(1),
    amount0Out: w(2),
    amount1Out: w(3),
    to: indexed[2] as Address,
  };
}

/**
 * Derive a fill from an ALREADY-MINED transaction's Swap event + pool reserves.
 * Nothing here is supplied by the executor: tx receipt state and current
 * pool reserves both come from the chain.
 */
export async function observeSwapFill(
  client: PublicClient,
  pair: Address,
  txHash: Hex,
  opts: { tokenIn: Address; tokenOut: Address },
): Promise<ObservedFill> {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt) throw new Error("receipt not found on chain");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });

  const log = receipt.logs.find((l) => l.address.toLowerCase() === pair.toLowerCase() && l.topics[0] === SWAP_TOPIC);
  if (!log) throw new Error(`no Swap event for pair ${pair} in tx ${txHash}`);

  const swap = decodeSwapLog(log);
  const { token0, reserve0, reserve1 } = await getReserves(client, pair);

  const tokenInIsToken0 = token0.toLowerCase() === opts.tokenIn.toLowerCase();
  if (!tokenInIsToken0 && token0.toLowerCase() !== opts.tokenOut.toLowerCase()) {
    throw new Error(`in/out tokens not both in pool ${pair}`);
  }
  const inAddr = opts.tokenIn;
  const outAddr = opts.tokenOut;
  const [inInfo, outInfo] = await Promise.all([
    resolveTokenMeta(client, inAddr),
    resolveTokenMeta(client, outAddr),
  ]);

  const [amountIn, amountOut] = tokenInIsToken0
    ? [swap.amount0In, swap.amount1Out]
    : [swap.amount1In, swap.amount0Out];

  const quoteOutRaw = quoteV2({ reserve0, reserve1 }, tokenInIsToken0, amountIn);
  const actualInput = toHuman(amountIn, inInfo.decimals);
  const actualOutput = toHuman(amountOut, outInfo.decimals);
  const quoteOutput = toHuman(quoteOutRaw, outInfo.decimals);
  const q = parseFloat(quoteOutput);
  const a = parseFloat(actualOutput);

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    timestamp: block.timestamp,
    pair,
    tokenIn: { address: inAddr, symbol: inInfo.symbol, decimals: inInfo.decimals },
    tokenOut: { address: outAddr, symbol: outInfo.symbol, decimals: outInfo.decimals },
    route: [inInfo.symbol, outInfo.symbol],
    actualInput,
    actualOutput,
    quoteOutput,
    impactPct: q > 0 ? (1 - a / q) * 100 : 0,
    feePct: 0.3,
  };
}

// ---------------------------------------------------------------------------
// Signed receipts — tx + observed outcome + policy decision, hash-locked.
// ---------------------------------------------------------------------------

export interface SignedReceipt {
  receiptHash: Hex;
  signer: Address;
  signature: Hex;
  payload: Record<string, unknown>;
}

export function canonical(payload: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(payload).sort()) sorted[k] = payload[k];
  return JSON.stringify(sorted);
}

export async function signClaim(
  payload: Record<string, unknown>,
  account: Account,
): Promise<SignedReceipt> {
  const msg = canonical(payload);
  const receiptHash = keccak256(toHex(msg));
  const sign = account.signMessage ?? (() => { throw new Error("no signer available"); });
  const signature = await sign.call(account, { message: { raw: receiptHash } });
  return { receiptHash, signer: account.address as Address, signature, payload };
}

// ---------------------------------------------------------------------------
// Real broadcast (only when a funded key exists).
// ---------------------------------------------------------------------------

export async function broadcastApproveAndTransfer(
  clients: CeloClients,
  token: Address,
  to: Address,
  rawAmount: bigint,
): Promise<Hex> {
  if (!clients.walletClient || !clients.account) {
    throw new Error("broadcast requires AGENT_PRIVATE_KEY (funded) on " + clients.net);
  }
  const w = clients.walletClient;
  const spender = to;
  const allow = await clients.publicClient.readContract({
    address: token, abi: ERC20_ABI, functionName: "allowance",
    args: [w.account!.address, spender],
  });
  if (allow < rawAmount) {
    const approveData = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, rawAmount] });
    const tx = await sendTx(w, { to: token, data: approveData }, NETS[clients.net]);
    await clients.publicClient.waitForTransactionReceipt({ hash: tx });
  }
  const transferData = encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, rawAmount] });
  const pay = await sendTx(w, { to: token, data: transferData }, NETS[clients.net]);
  await clients.publicClient.waitForTransactionReceipt({ hash: pay });
  return pay;
}

type SendTxArgs = { to: Address; data: Hex };
async function sendTx(w: WalletClient, args: SendTxArgs, chain: Chain): Promise<Hex> {
  return w.sendTransaction({ account: w.account!, chain, to: args.to, data: args.data });
}

// ---------------------------------------------------------------------------
// Uniswap V3 SwapRouter02 on Celo mainnet — real swap execution.
// ---------------------------------------------------------------------------

export const UNISWAP_V3_FACTORY = "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc" as Address;
export const UNISWAP_V3_ROUTER02 = "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as Address;

export const UNISWAP_V3_FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view" as const,
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const UNISWAP_V3_ROUTER02_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable" as const,
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** Fee tiers to probe when discovering a pool: 500 (0.05%), 3000 (0.3%), 10000 (1%). */
const FEE_TIERS = [500, 3000, 10000];

/**
 * Resolve the Uniswap V3 pool address for (tokenA, tokenB) by probing fee tiers.
 * Returns null if no pool exists.
 */
export async function getV3Pool(
  client: PublicClient,
  tokenA: Address,
  tokenB: Address,
): Promise<{ address: Address; fee: number } | null> {
  for (const fee of FEE_TIERS) {
    const pool = await client.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: UNISWAP_V3_FACTORY_ABI,
      functionName: "getPool",
      args: [tokenA, tokenB, fee],
    });
    if (pool && pool !== "0x0000000000000000000000000000000000000000") {
      return { address: pool, fee };
    }
  }
  return null;
}

export interface SwapExactInputSingleOpts {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: Address;
}

/**
 * Execute a Uniswap V3 exactInputSingle swap via SwapRouter02.
 * Automatically discovers the pool fee tier.
 * Returns the tx hash.
 */
export async function swapExactInputSingle(
  clients: CeloClients,
  opts: SwapExactInputSingleOpts,
): Promise<Hex> {
  if (!clients.walletClient || !clients.account) {
    throw new Error("swap requires AGENT_PRIVATE_KEY (funded) on " + clients.net);
  }

  const pool = await getV3Pool(clients.publicClient, opts.tokenIn, opts.tokenOut);
  if (!pool) throw new Error(`no V3 pool for ${opts.tokenIn}/${opts.tokenOut}`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min

  const swapData = encodeFunctionData({
    abi: UNISWAP_V3_ROUTER02_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: opts.tokenIn,
      tokenOut: opts.tokenOut,
      fee: pool.fee,
      recipient: opts.recipient,
      deadline,
      amountIn: opts.amountIn,
      amountOutMinimum: opts.amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    }],
  });

  const w = clients.walletClient;
  const tx = await w.sendTransaction({
    account: w.account!,
    chain: NETS[clients.net],
    to: UNISWAP_V3_ROUTER02,
    data: swapData,
  });
  await clients.publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/**
 * Full swap pipeline: approve router → swap via V3 → return tx hash.
 * The caller is responsible for setting amountOutMinimum based on policy.
 */
export async function approveAndSwap(
  clients: CeloClients,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  amountOutMinimum: bigint,
  recipient: Address,
): Promise<Hex> {
  // Approve the router to spend tokenIn.
  await broadcastApproveAndTransfer(clients, tokenIn, UNISWAP_V3_ROUTER02, amountIn);
  // Execute the swap.
  return swapExactInputSingle(clients, {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
  });
}