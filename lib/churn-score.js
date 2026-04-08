/**
 * lib/churn-score.js
 * Derives feature importances from users.json (Pearson |r| vs churnProbability).
 * Excludes priceSensitivity — it's co-derived from the same factors, inflating
 * correlation. Exposes a deterministic scoring function for the lifecycle timeline.
 */

import users from '../data/users.json';

// ── Pearson correlation ────────────────────────────────────────────────────────
function pearson(xs, ys) {
  const n  = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const dx  = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const dy  = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return (dx === 0 || dy === 0) ? 0 : num / (dx * dy);
}

const target = users.map(u => u.churnProbability);

// Feature definitions — negative sign where low value = high risk
const FEATURE_DEFS = [
  {
    key:         'sessionsPerWeek',
    label:       'Low Engagement',
    sublabel:    'Sessions / week below threshold',
    colorVar:    '--ps-teal-light',
    color:       '#00E5FF',
    values:      users.map(u => -u.sessionsPerWeek),   // invert: fewer sessions ↑ risk
  },
  {
    key:         'perceivedValue',
    label:       'Value Mismatch',
    sublabel:    'Perceived value gap vs tier potential',
    colorVar:    '--ps-blue-light',
    color:       '#00AAFF',
    values:      users.map(u => -u.perceivedValue),    // invert: low value ↑ risk
  },
  {
    key:         'titlesPlayed',
    label:       'Catalog Disengagement',
    sublabel:    'Titles played per month below average',
    colorVar:    '--ps-purple-light',
    color:       '#A855F7',
    values:      users.map(u => -u.titlesPlayed),      // invert: fewer titles ↑ risk
  },
  {
    key:         'monthsActive',
    label:       'Tenure Shortfall',
    sublabel:    'Short subscription history',
    colorVar:    '--ps-gold',
    color:       '#F5A623',
    values:      users.map(u => -u.monthsActive),      // invert: newer user ↑ risk
  },
];

// Compute |r| per feature, then normalise by the maximum
const rawImportances = FEATURE_DEFS.map(f => ({
  ...f,
  absCorr: Math.abs(pearson(f.values, target)),
}));

const maxCorr = Math.max(...rawImportances.map(f => f.absCorr));

export const featureImportance = rawImportances
  .map(f => ({ ...f, importance: f.absCorr / maxCorr }))
  .sort((a, b) => b.importance - a.importance);

// ── Lifecycle scoring function ─────────────────────────────────────────────────
// Mirrors lib/data-gen.js formulae exactly (no randomness).
// Used by the timeline scrubber to re-score a sample user at any month.

const TIERS    = ['essential', 'extra', 'premium'];
const SEGMENTS = ['casual', 'mid-core', 'hardcore'];

const SEG_RISK  = { casual: 0.30, 'mid-core': 0.15, hardcore: 0.05 };
const TIER_RISK = { essential: 0.20, extra: 0.10, premium: 0.05 };

/**
 * scoreAtMonth(params, month)
 * Returns { churnProbability, perceivedValue } for the given user profile at
 * the given subscription month (0-based). Adds a realistic renewal spike at
 * months 10-12 to reflect behavioural data patterns.
 */
export function scoreAtMonth({ tier, segment, sessionsPerWeek, titlesPlayed }, month) {
  const tierIdx = TIERS.indexOf(tier);
  const segIdx  = SEGMENTS.indexOf(segment);

  const engagement = Math.min(sessionsPerWeek / 21, 1);
  const depth      = Math.min(titlesPlayed / 20, 1);
  const tenure     = Math.min(month / 48, 1);

  const pv = Math.min(
    tierIdx * 12 + segIdx * 10 + engagement * 25 + depth * 20 + tenure * 11 + 10,
    100,
  );

  const tenureBonus = tenure * 0.12;
  const valBonus    = (pv / 100) * 0.25;
  let base          = SEG_RISK[segment] + TIER_RISK[tier] - tenureBonus - valBonus;

  // Renewal spike: triangular peak centred on month 11
  if (month >= 10 && month <= 12) {
    base += 0.035 * (1 - Math.abs(month - 11) / 2);
  }

  return {
    churnProbability: parseFloat(Math.max(0.01, Math.min(0.99, base)).toFixed(4)),
    perceivedValue:   parseFloat(pv.toFixed(1)),
  };
}

// Pre-compute curve for the canonical sample user (Extra / Casual, light engagement)
export const SAMPLE_USER = {
  tier: 'extra', segment: 'casual', sessionsPerWeek: 3, titlesPlayed: 3,
};

export const SAMPLE_CURVE = Array.from({ length: 25 }, (_, m) =>
  ({ month: m, ...scoreAtMonth(SAMPLE_USER, m) }));
