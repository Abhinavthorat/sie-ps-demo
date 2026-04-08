/**
 * Deterministic synthetic user generator
 * Produces 1000 reproducible PS+ users using a seeded PRNG (mulberry32).
 * Output shape is stable across runs given the same SEED constant.
 */

const SEED = 0xDEADBEEF;
const USER_COUNT = 1000;

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0xFFFFFFFF;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng, min, max, decimals = 2) {
  return parseFloat((rng() * (max - min) + min).toFixed(decimals));
}

function weightedChoice(rng, choices) {
  // choices: [{ value, weight }, ...]
  const total = choices.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of choices) {
    r -= c.weight;
    if (r <= 0) return c.value;
  }
  return choices[choices.length - 1].value;
}

function pickN(rng, arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = randInt(rng, 0, copy.length - 1);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

// ── Domain constants ─────────────────────────────────────────────────────────
const TIERS = ['essential', 'extra', 'premium'];

const TIER_WEIGHTS = [
  { value: 'essential', weight: 45 },
  { value: 'extra',     weight: 35 },
  { value: 'premium',   weight: 20 },
];

const SEGMENT_BY_TIER = {
  essential: [
    { value: 'casual',    weight: 60 },
    { value: 'mid-core',  weight: 30 },
    { value: 'hardcore',  weight: 10 },
  ],
  extra: [
    { value: 'casual',    weight: 35 },
    { value: 'mid-core',  weight: 45 },
    { value: 'hardcore',  weight: 20 },
  ],
  premium: [
    { value: 'casual',    weight: 15 },
    { value: 'mid-core',  weight: 40 },
    { value: 'hardcore',  weight: 45 },
  ],
};

// Sessions per week ranges by segment
const SESSIONS_BY_SEGMENT = {
  casual:   [1, 4],
  'mid-core': [4, 10],
  hardcore: [10, 21],
};

// Titles played per month ranges
const TITLES_BY_SEGMENT = {
  casual:   [1, 4],
  'mid-core': [3, 9],
  hardcore: [7, 20],
};

const MONTHS_ACTIVE_BY_TIER = {
  essential: [1, 24],
  extra:     [2, 36],
  premium:   [3, 48],
};

const TIER_PRICE_MONTHLY = {
  essential: 9.99,
  extra:     14.99,
  premium:   17.99,
};

// ── Derived score formulae ───────────────────────────────────────────────────
/**
 * Perceived value score [0–100]:
 * Higher engagement + higher tier relative to casual = more value felt.
 */
function perceivedValue(tier, segment, sessionsPerWeek, titlesPlayed, monthsActive) {
  const tierIdx   = TIERS.indexOf(tier);                  // 0–2
  const segIdx    = ['casual', 'mid-core', 'hardcore'].indexOf(segment); // 0–2
  const engageMent = Math.min(sessionsPerWeek / 21, 1);   // 0–1 normalised
  const depth     = Math.min(titlesPlayed / 20, 1);        // 0–1 normalised
  const tenure    = Math.min(monthsActive / 48, 1);        // 0–1 normalised

  const raw =
    (tierIdx * 12) +             // 0–24 tier bonus
    (segIdx  * 10) +             // 0–20 segment bonus
    (engageMent * 25) +          // 0–25 sessions weight
    (depth      * 20) +          // 0–20 depth weight
    (tenure     * 11) +          // 0–11 loyalty bonus
    10;                           // base floor

  return Math.min(parseFloat(raw.toFixed(1)), 100);
}

/**
 * Churn probability [0–1]:
 * Higher value score = lower churn. Casual + Essential = most at-risk.
 */
function churnProbability(perceivedVal, segment, monthsActive, tier) {
  const segRisk = { casual: 0.3, 'mid-core': 0.15, hardcore: 0.05 }[segment];
  const tierRisk = { essential: 0.2, extra: 0.1, premium: 0.05 }[tier];
  const tenureBonus = Math.min(monthsActive / 48, 1) * 0.12; // loyalty lowers churn
  const valBonus    = (perceivedVal / 100) * 0.25;

  const raw = segRisk + tierRisk - tenureBonus - valBonus;
  return parseFloat(Math.max(0.01, Math.min(0.99, raw)).toFixed(3));
}

/**
 * Price sensitivity [0–1]:
 * Casual / low-engagement users are more sensitive to price.
 */
function priceSensitivity(segment, tier, churnProb) {
  const segBase = { casual: 0.7, 'mid-core': 0.45, hardcore: 0.2 }[segment];
  const tierMod = { essential: 0.1, extra: -0.05, premium: -0.15 }[tier];
  const churnMod = churnProb * 0.15;
  const raw = segBase + tierMod + churnMod;
  return parseFloat(Math.max(0, Math.min(1, raw)).toFixed(3));
}

// ── Social graph pool (user IDs linked after generation) ────────────────────
function buildSocialConnections(rng, userId, totalUsers) {
  const count = randInt(rng, 0, 12);
  const connections = new Set();
  while (connections.size < count) {
    const candidate = randInt(rng, 0, totalUsers - 1);
    if (candidate !== userId) connections.add(candidate);
  }
  return [...connections];
}

// ── Main generator ───────────────────────────────────────────────────────────
export function generateUsers(count = USER_COUNT, seed = SEED) {
  const rng = mulberry32(seed);

  const users = Array.from({ length: count }, (_, i) => {
    const tier    = weightedChoice(rng, TIER_WEIGHTS);
    const segment = weightedChoice(rng, SEGMENT_BY_TIER[tier]);

    const [sessMin, sessMax] = SESSIONS_BY_SEGMENT[segment];
    const [titMin,  titMax]  = TITLES_BY_SEGMENT[segment];
    const [moMin,   moMax]   = MONTHS_ACTIVE_BY_TIER[tier];

    const monthsActive   = randInt(rng, moMin, moMax);
    const sessionsPerWeek = randFloat(rng, sessMin, sessMax, 1);
    const titlesPlayed   = randInt(rng, titMin, titMax);

    const perceivedVal  = perceivedValue(tier, segment, sessionsPerWeek, titlesPlayed, monthsActive);
    const churnProb     = churnProbability(perceivedVal, segment, monthsActive, tier);
    const priceSens     = priceSensitivity(segment, tier, churnProb);

    // Churned flag: probabilistically resolved per-user (deterministic via rng)
    const churned = rng() < churnProb;

    // Social connections resolved in a second pass; placeholder here
    const socialConnections = [];

    return {
      id: i,
      tier,
      segment,
      monthsActive,
      sessionsPerWeek,
      titlesPlayed,
      perceivedValue: perceivedVal,
      churnProbability: churnProb,
      priceSensitivity: priceSens,
      monthlySpend: TIER_PRICE_MONTHLY[tier],
      socialConnections,
      churned,
    };
  });

  // Second pass: build social graph (connections reference valid user IDs)
  const rng2 = mulberry32(seed ^ 0xCAFEBABE);
  users.forEach((user) => {
    user.socialConnections = buildSocialConnections(rng2, user.id, count);
  });

  return users;
}

// ── CLI entry (run directly with Node) ──────────────────────────────────────
// node lib/data-gen.js  →  writes data/users.json
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('data-gen.js')) {
  const { writeFileSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const users = generateUsers();
  const outPath = join(__dirname, '..', 'data', 'users.json');
  writeFileSync(outPath, JSON.stringify(users, null, 2));
  console.log(`Written ${users.length} users to ${outPath}`);
}
