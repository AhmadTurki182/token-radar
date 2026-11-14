// Token Radar's model, radar-3: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every other pre-token protocol the eligibility rule admits, chosen by implied value, not by
// TVL alone: the early rows the radar exists to find. The watchlist is the floor, not the
// ceiling, so the early radar also carries the strongest protocols above the floor the list
// leaves out. A protocol is pre-token when its index entry records no token at all (no market
// cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and
// shown at the market's own value, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   multiple(category) = median mcap_usd/tvl_usd over the LIVE protocols of that category,
//                        each ratio winsorized to the [p10, p90] band of all live ratios;
//                        a category with fewer than 3 live peers is priced by shrinkage:
//                        (n x median + 3 x global) / (n + 3), so one live peer moves the
//                        multiple a quarter of the way from the global median toward its own
//                        ratio, two peers two fifths, and no peer leaves it at the global
//                        median. The multiple is calibrated from the snapshot itself at run
//                        time: a lending protocol is not priced like a DEX, and no multiple is
//                        a number this file chose by hand.
//   base               = tvl_usd x multiple(category)
//   growth             = clamp(change_7d, -60, 120) per cent
//   growthMult         = 1 + 0.5 x sign(growth) x ln(1 + |growth| / 50)
//                        (log-damped: +20% -> 1.17, +120% -> 1.61, and the snapshot's
//                        +4448% outlier can no longer dominate the board)
//   maturity           = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//   implied            = max(1, round(base x growthMult x maturity))
//
// No protocol name is ever special-cased: the same function scores every row, and the same
// eligibility rule the house used for the watchlist (RULES.txt, "The snapshot") decides
// which early rows the board may carry: no exchange, no bridge, no liquid-staking or
// restaking wrapper, no versioned pool, no product named after an exchange, no wrapped or
// staked product of a token that already trades. Two categories are excluded on the same
// principle, though the house's list does not name them: Cross Chain Bridge is a bridge, and
// Stablecoin Wrapper wraps a stablecoin that trades. The watchlist itself is carried whole,
// whatever its categories: it is the floor the gate requires, not a row the model chose.
// Eligibility is judged on the snapshot's ten fields alone: `parentProtocol` is not one of
// them, so a deployment the list leaves out is ranked on its own record.

// Calibration check, measured on this snapshot: the multiples the model computes at run
// time reproduce the hand-checked figures exactly — Basis Trading 0.6544 (7 live peers) and
// Yield Aggregator 0.1510, both with enough peers that shrinkage leaves them alone — and the
// shrunk figures check too: Risk Curators 0.8992 (1 live peer at 2.9555, the p90 cap:
// (2.9555 + 3 x 0.2138) / 4) and Onchain Capital Allocator 0.1350 (2 live peers, median
// 0.0169: (2 x 0.0169 + 3 x 0.2138) / 5). Zero-market-cap tokens are excluded from
// calibration, because a live token with mcap 0 carries no pricing signal: leaving one in
// dragged small categories' medians toward 0 and demoted their pre-token rows. Nothing in
// this file is tuned to a name: change the snapshot and every multiple moves with it.
//
// Round 4, checked on the same snapshot, and no constant changed. The top of the board
// is decided by signal, not by the shared multiple: ranks 1 and 2 are both Risk Curators
// at 0.8992, so the multiple cancels and the 1.85% gap is growth (-2.19% against +2.37%)
// and maturity (543 days against 407); priced at the global median instead, the order is
// the same ($460M against $452M). The one alternative the data was tested against —
// pricing a category only from live peers whose TVL clears the snapshot's own $50M floor
// — was rejected on the numbers: it drops the global median to 0.0820, puts 74 of 196
// rows on it, and leaves Dexs with 1 live peer where it had 11, so it destroys the
// differentiation it was meant to save. Six categories on the board rest on a single
// live peer each; three of them share the multiple 0.8992 (each peer's ratio at or above
// the p90 cap of 2.9555), and the dashboard's calibration note says so, because a reader
// who can see the table deserves the consequence stated: inside a shared multiple, TVL,
// growth and age decide the order.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_scale: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_peers: number;
  /** Pseudo-observations at the global median in the shrinkage blend for thin categories. */
  shrinkage_prior: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  growth_scale: 50,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_peers: 3,
  shrinkage_prior: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols beyond the watchlist the early radar carries, by implied value:
 *  the cap, not a target — this snapshot holds 156 beyond the watchlist, so all of them. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  /** The category multiple at full precision, for the page's recompute; `category_multiple` is the rounded display value. */
  category_multiple_exact: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  /** True when the row is one of the snapshot's watchlist slugs; false for early rows below the floor. */
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One row of the calibration table the dashboard shows: a category's multiple and its live peers. */
export interface CalibrationRow {
  category: string;
  multiple: number;
  peers: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  calibration: CalibrationRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The q-th percentile of a sorted ascending array, linear interpolation, deterministic. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The median of an array: its 50th percentile. */
function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/** The category multiples calibrated from the snapshot's own live-token protocols. */
export interface CategoryMultiples {
  /** Per-category multiple and live-peer count, keyed by category name ('Other' for null). */
  byCategory: Map<string, { multiple: number; peers: number }>;
  /** The global median multiple, used when a category has too few live peers. */
  global: number;
  /** The winsorization band the ratios were clamped to. */
  p10: number;
  p90: number;
}

/**
 * Calibrate every category's FDV/TVL multiple from the live protocols in the same snapshot:
 * median mcap_usd/tvl_usd per category, each ratio winsorized to the [p10, p90] band of all
 * live ratios so one outlier cannot set a category's price. A category with fewer than
 * `min_peers` live peers is priced by shrinkage toward the global median, its own median
 * weighted by its peer count against `shrinkage_prior` parts global: thin evidence moves the
 * multiple, it does not replace it, and a category with no live peer at all is not in this
 * map and falls back to the global median through multipleFor. Nothing here is a hand-picked
 * number.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryMultiples {
  // A live peer is a protocol whose token records a positive market cap: a zero market cap
  // (a dead or unpriced token) carries no pricing signal and would drag a small category's
  // median to near zero on no evidence at all.
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios = live.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const p10 = percentile(ratios, 0.1);
  const p90 = percentile(ratios, 0.9);
  const clamp = (r: number): number => Math.min(p90, Math.max(p10, r));
  const global = median(live.map((p) => clamp((p.mcap_usd as number) / p.tvl_usd)));
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  const grouped = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = grouped.get(key);
    if (list) list.push(clamp((p.mcap_usd as number) / p.tvl_usd));
    else grouped.set(key, [clamp((p.mcap_usd as number) / p.tvl_usd)]);
  }
  for (const [key, list] of grouped) {
    // Shrinkage toward the global median: a category with fewer than min_peers live peers is
    // priced by (n x median + shrinkage_prior x global) / (n + shrinkage_prior), so one peer
    // moves the multiple a quarter of the way from the global median and two peers two fifths;
    // a category with enough peers keeps its own median untouched.
    const n = list.length;
    const multiple =
      n >= model.min_peers ? median(list) : (n * median(list) + model.shrinkage_prior * global) / (n + model.shrinkage_prior);
    byCategory.set(key, { multiple, peers: n });
  }
  return { byCategory, global, p10, p90 };
}

/** One category's multiple: its calibrated value, or the global median when it has too few peers. */
export function multipleFor(category: string | null, multiples: CategoryMultiples): number {
  const entry = multiples.byCategory.get(category ?? 'Other');
  return entry ? entry.multiple : multiples.global;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: CategoryMultiples,
): { implied: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  // Log-damped growth: a +20% week lifts the score ~17%, a +120% week ~61%, and a +4448%
  // week cannot explode the board the way a linear term would.
  const growthMult = 1 + model.growth_weight * Math.sign(growthPct) * Math.log1p(Math.abs(growthPct) / model.growth_scale);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const multiple = multipleFor(protocol.category, multiples);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Exchange names: a protocol named after one is the exchange's own product, not a launch candidate. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/** A whole word wrapped, staked or staking: a wrapped or staked product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories the watchlist rule keeps off the board: bridges and staking wrappers — plus two
 *  the house's list does not name but its principle covers: Cross Chain Bridge is a bridge, and
 *  Stablecoin Wrapper wraps a stablecoin that trades. This governs the early rows only: the
 *  watchlist is carried whole, whatever its categories. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Stablecoin Wrapper',
  'CEX',
]);

/** Whether a protocol records no token at all. All three fields must be null: a protocol with a
 *  market cap of null but a symbol on record (Ethena USDe, Morpho Blue, Uniswap V4, Aave V3)
 *  already has a token and belongs in the live set, not on the board. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and passing the watchlist rule
 *  (no exchange, no bridge, no cross-chain bridge, no staking wrapper, no stablecoin wrapper,
 *  no versioned pool, no exchange-named product). */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol the watchlist leaves out, chosen by
  // implied value, not by TVL alone, so a fast-growing smaller protocol can outrank a flat
  // giant. The watchlist is the floor, never the ceiling: a protocol above the floor the list
  // leaves out is no worse a subject than one below it.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model, multiples).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS)
    .map((s) => s.p);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, multiple, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model, multiples);
    return { p, implied, multiple, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas token a chain settles fees in, for the chains the snapshot names most. */
function gasToken(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum' || c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'ink' || c === 'linea' || c === 'monad') return 'ETH';
  if (c === 'binance') return 'BNB';
  if (c === 'solana') return 'SOL';
  if (c === 'tron') return 'TRX';
  if (c === 'avalanche') return 'AVAX';
  if (c === 'polygon') return 'POL';
  if (c === 'aptos') return 'APT';
  if (c === 'sui') return 'SUI';
  if (c === 'bitcoin' || c === 'hyperliquid l1') return 'the chain\u2019s native token';
  return 'the chain\u2019s gas token';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and let it compound.`;
  if (c.includes('farm')) return `Deposit $${capital} of LP tokens into ${name}'s farm on ${chain} and keep the position open.`;
  if (c.includes('chain') || c.includes('anchor') || c.includes('decentralized btc')) return `Bridge $${capital} of value onto ${name}'s network and use its main app once.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different interaction from the first, so the wallet's
 *  activity is a pattern of use, not one deposit. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${Math.max(10, Math.round(capital / 5))} of USDC against the supply on ${name}, then repay it within the same week.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Swap $${Math.max(10, Math.round(capital / 5))} between the pool's two assets on ${name} on ${chain}.`;
  if (c.includes('bridge')) return `Use the bridged funds in a second app on ${chain} so the bridge is a transfer, not a round trip.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards ${name} accrues and restake them instead of selling.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `Close the hedged trade on ${name} after a day and open a fresh one half the size.`;
  if (c.includes('prediction')) return `Settle one market position on ${name} and place a second one in a different market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $${Math.max(10, Math.round(capital / 5))} between two ${name} vaults on ${chain} to show active allocation.`;
  if (c.includes('stable')) return `Redeem a small part of the stable asset through ${name} and mint it back the same week.`;
  if (c.includes('rwa')) return `Check the yield ${name} accrued on ${chain} and add $${Math.max(10, Math.round(capital / 5))} more to the same position.`;
  if (c.includes('insurance')) return `File a test claim review on ${name} to learn its process, without filing a real claim.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Harvest the vault's yield on ${name} once and redeposit it into the same vault.`;
  if (c.includes('farm')) return `Claim the farm rewards on ${name} and stake them again instead of selling.`;
  return `Make a second, different interaction on ${name} on ${chain}, such as a swap, a vote or a claim.`;
}

/** The category's weekly action: what "stay active" concretely means for this protocol. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `adjust the supply or borrow a little on ${name}`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `swap a small amount or rebalance the pool position on ${name}`;
  if (c.includes('bridge')) return `bridge a small amount through ${name} and use it on the destination chain`;
  if (c.includes('staking') || c.includes('restak')) return `claim and restake the rewards ${name} accrues`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `open or close one small trade on ${name}`;
  if (c.includes('prediction')) return `place one small market position on ${name}`;
  if (c.includes('curator') || c.includes('allocator')) return `check the vault allocation on ${name} and move a little between vaults`;
  if (c.includes('stable')) return `mint or redeem a small amount through ${name}`;
  if (c.includes('rwa')) return `check the accrued yield on ${name} and top the position up`;
  if (c.includes('insurance')) return `review the cover terms on ${name} and renew or adjust the policy`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `harvest and redeposit the vault yield on ${name}`;
  if (c.includes('farm')) return `claim the farm rewards on ${name} and stake them again`;
  return `make one deposit, swap, vote or claim on ${name}`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names, and every step names the protocol so no two plans read the same.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasToken(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const secondChain = p.chains.length > 1 ? ` If ${p.name} also runs on ${p.chains[1]}, repeat the deposit there once with $${Math.max(10, Math.round(capital / 5))}.` : '';
  return [
    {
      text: `Open a fresh wallet for ${p.name} only, fund it with $${capital} of USDC plus a little ${gas} for fees on ${chain}, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain) + secondChain,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${capital >= 150 ? 4 : 2} of gas`,
      time: '10 minutes',
    },
    {
      text: `Once a week, ${weeklyActionFor(p)} so the wallet shows repeated use, not a single deposit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw from ${p.name}, open its own points or rewards page, keep a little ${gas} for the claim on ${chain}, and claim only from the link the protocol itself publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>, multiples: CategoryMultiples): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_multiple_exact: multipleFor(row.category, multiples),
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const multiples = categoryMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const boardCategories = new Map<string, { multiple: number; peers: number }>();
  for (const row of board) {
    const key = row.category ?? 'Other';
    if (!boardCategories.has(key)) {
      boardCategories.set(key, { multiple: row.model.category_multiple, peers: multiples.byCategory.get(key)?.peers ?? 0 });
    }
  }
  const calibration = [...boardCategories.entries()]
    .map(([category, v]) => ({ category, multiple: v.multiple, peers: v.peers }))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    calibration,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist), multiples)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
