// ── MELD core types ─────────────────────────────────────────────────────────
// An agent should be able to pay any compatible x402 service from one treasury
// asset, even when the merchant requires a different Celo stablecoin.

export interface CeloToken {
  symbol: string; // "USDC" | "USDT" | "wBRL" | "wARS" | "wCOP" | "cNGN" | "USA₮" | "wFIAT"
  address: string;
  decimals: number;
}

// Celo mainnet tokens
export const TOKENS: Record<string, CeloToken> = {
  USDC:  { symbol: "USDC",  address: "0xcebA9871730454a63E897E47dE4E43a5608fcDA2", decimals: 6 },
  USDT:  { symbol: "USDT",  address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6 },
  cUSD:  { symbol: "cUSD",  address: "0x765DE81681583a650904d40316C1fa9810A02191", decimals: 18 },
  cNGN:  { symbol: "cNGN",  address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
  wBRL:  { symbol: "wBRL",  address: "0x3517b5B8fD1290027E29b61208B237Bd2B36bB45", decimals: 18 },
  wARS:  { symbol: "wARS",  address: "0x765887F02E71c8E4F9fA2FF8bC7406786B80801c", decimals: 18 },
  wCOP:  { symbol: "wCOP",  address: "0x1cB5081e22b6dC49A37C3d45C2027F67C5200B64", decimals: 18 },
  USAT:  { symbol: "USAT",  address: "0x9832b6B388B8b8C88A0aF532c6a0dFCC11F48C82", decimals: 6 }
};

export interface X402Requirement {
  x402Version: number;
  accepts: Array<{
    scheme: string; // "exact" | "pipelined"
    network: string;
    asset: string; // token address
    payTo: string; // merchant address
    amount: string; // required amount (human-readable, e.g. "0.08")
    maxTimeoutSeconds: number;
  }>;
  resource: string;
  spec: Record<string, unknown>;
}

export interface RouteQuote {
  inputToken: CeloToken;
  outputToken: CeloToken;
  inputAmount: string; // human-readable
  expectedOutput: string; // human-readable, quoted before execution
  actualOutput: string; // human-readable, after swap (defaults to expected pre-execution)
  minOutput: string; // after slippage tolerance
  priceImpactPct: number;
  route: string[]; // e.g. ["USDC", "USDT", "wBRL"] — intermediate hops
  estimatedGasUsd: number;
}

export interface SwapResult {
  txHash: string;
  inputAmount: string;
  outputAmount: string;
  inputToken: string;
  outputToken: string;
  priceImpactPct: number;
}

export interface X402PaymentResult {
  txHash: string;
  amount: string;
  asset: string;
  recipient: string;
}

export interface PaymentPolicy {
  maxSlippageBps: number; // e.g. 50 = 0.5%
  maxTotalCostUsd: number; // absolute ceiling on total outflow
  maxRouteHops: number; // 1 = direct only, 3 = allow two intermediaries
  expirySec: number; // payment must complete within this window
}

export interface PaymentIntent {
  requirement: X402Requirement;
  policy: PaymentPolicy;
  treasury: Record<string, string>; // symbol → balance (human-readable)
}

export interface PaymentResult {
  success: boolean;
  route: RouteQuote;
  swap: SwapResult | null;
  payment: X402PaymentResult | null;
  reason: string;
  costBreakdown: {
    swapInput: string;
    swapOutput: string;
    slippageBps: number;
    gasUsd: number;
    totalCostUsd: number;
  };
}
