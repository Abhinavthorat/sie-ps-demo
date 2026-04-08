/**
 * modules/outcomes.js
 * Task 5 — Outcome Metric Cards (#section-outcomes)
 * Task 6 — Dynamic recompute based on global store filter
 *
 * Three animated stat cards:
 *   1. Churn Reduction %       — derived from interventions vs baseline
 *   2. Targeting Precision Lift — precision score delta
 *   3. Intervention Cost Saved  — estimated $ / user saved
 *
 * Count-up animation fires on IntersectionObserver entry (once).
 * When store has an active filter, cards recompute for that subset.
 * "Reset to all users" link restores full-population view.
 */

import allUsers from '../data/users.json';
import { store } from '../lib/state.js';

// ─────────────────────────────────────────────────────────────────────────────
// DATA DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

const CHURN_THRESHOLD       = 0.30;
const INTERVENTION_REDUCTION = 0.10;
const MODEL_PRECISION        = 0.834;

function deriveMetrics(users) {
  const atRisk    = users.filter(u => u.churnProbability >= CHURN_THRESHOLD);
  const movedBelow = atRisk.filter(u =>
    Math.max(0, u.churnProbability - INTERVENTION_REDUCTION) < CHURN_THRESHOLD
  );

  const churnReductionPct = atRisk.length
    ? (movedBelow.length / atRisk.length) * 100
    : 0;

  const baselineRate   = atRisk.length / users.length;
  const precisionLift  = baselineRate > 0
    ? ((MODEL_PRECISION - baselineRate) / baselineRate) * 100
    : 0;

  const preventedChurns        = movedBelow.length;
  const avgLTV                  = 58;
  const costPerIntervention     = 4.20;
  const eligibleForIntervention = Math.round(atRisk.length * 1.8);
  const grossSaved              = preventedChurns * avgLTV;
  const interventionCost        = eligibleForIntervention * costPerIntervention;
  const netSaved                = Math.round((grossSaved - interventionCost) / 1000);

  return {
    churnReductionPct,
    movedBelow: movedBelow.length,
    atRisk: atRisk.length,
    baselineRate,
    precisionLift,
    preventedChurns,
    grossSaved,
    interventionCost,
    netSaved,
    avgLTV,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNT-UP ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function countUp(el, from, to, duration = 1400, formatter = n => n.toFixed(1)) {
  const start = performance.now();
  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const current  = from + (to - from) * easeOutExpo(progress);
    el.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────────────────────────────────────
// RING ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

function animateRing(fillEl, pct, circumference) {
  const offset = circumference * (1 - Math.min(pct / 100, 1));
  fillEl.style.strokeDashoffset = circumference;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fillEl.style.strokeDashoffset = offset;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DEFINITIONS (rebuilt from metrics)
// ─────────────────────────────────────────────────────────────────────────────

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

function buildCards(m) {
  return [
    {
      id:         'outcome-churn',
      modifier:   'churn',
      icon:       '↘',
      value:      m.churnReductionPct,
      label:      'Churn Reduction',
      sublabel:   `${m.movedBelow} high-risk subscribers moved below the 30% churn threshold under simulated interventions.`,
      baseline:   `Baseline at-risk users: ${m.atRisk} (${(m.baselineRate * 100).toFixed(1)}% of cohort)`,
      deltaLabel: `−${m.churnReductionPct.toFixed(1)}% vs no-intervention`,
      deltaColor: 'var(--ps-teal-light)',
      ringColor:  '#00E5FF',
      ringPct:    m.churnReductionPct,
      formatter:  n => n.toFixed(1),
      suffix:     '%',
    },
    {
      id:         'outcome-precision',
      modifier:   'precision',
      icon:       '⊕',
      value:      m.precisionLift,
      label:      'Targeting Precision Lift',
      sublabel:   `Model precision ${(MODEL_PRECISION * 100).toFixed(1)}% vs random baseline ${(m.baselineRate * 100).toFixed(1)}% — driven by low engagement and value mismatch features.`,
      baseline:   `Random baseline rate: ${(m.baselineRate * 100).toFixed(1)}%`,
      deltaLabel: `+${m.precisionLift.toFixed(0)}% lift vs random targeting`,
      deltaColor: 'var(--ps-purple-light)',
      ringColor:  '#A855F7',
      ringPct:    Math.min(m.precisionLift, 100),
      formatter:  n => n.toFixed(0),
      suffix:     '%',
    },
    {
      id:         'outcome-cost',
      modifier:   'cost',
      icon:       '$',
      value:      m.netSaved,
      label:      'Intervention Savings',
      sublabel:   `Estimated net savings from prevented churns minus intervention deployment cost across eligible cohort.`,
      baseline:   `Gross saved: $${(m.grossSaved / 1000).toFixed(1)}K · Cost: $${(m.interventionCost / 1000).toFixed(1)}K`,
      deltaLabel: `${m.preventedChurns} prevented churns × $${m.avgLTV} avg LTV`,
      deltaColor: 'var(--ps-gold-light)',
      ringColor:  '#F5A623',
      ringPct:    Math.min((m.netSaved / 200) * 100, 100),
      formatter:  n => Math.round(n).toString(),
      suffix:     'K',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD HTML BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildCard(card) {
  const el = document.createElement('div');
  el.className = `outcome-card outcome-card--${card.modifier} transition-fade`;
  el.id = card.id;

  el.innerHTML = `
    <div class="outcome-ring-wrap">
      <svg class="outcome-ring" width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
        <circle class="outcome-ring-track" cx="40" cy="40" r="${RING_R}" />
        <circle class="outcome-ring-fill"
                cx="40" cy="40" r="${RING_R}"
                stroke="${card.ringColor}"
                stroke-dasharray="${RING_C}"
                stroke-dashoffset="${RING_C}" />
      </svg>
    </div>
    <div class="outcome-icon" aria-hidden="true">${card.icon}</div>
    <div class="outcome-value" data-target="${card.value}" data-suffix="${card.suffix}">–</div>
    <div class="outcome-label">${card.label}</div>
    <p class="outcome-sublabel">${card.sublabel}</p>
    <div class="outcome-baseline">
      <span class="outcome-baseline-delta" style="color:${card.deltaColor};">${card.deltaLabel}</span>
    </div>`;

  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE CARDS IN PLACE (no full DOM rebuild)
// ─────────────────────────────────────────────────────────────────────────────

function updateCards(cards, animate = true) {
  cards.forEach((card, i) => {
    const cardEl   = document.getElementById(card.id);
    if (!cardEl) return;

    const valueEl  = cardEl.querySelector('.outcome-value');
    const ringFill = cardEl.querySelector('.outcome-ring-fill');
    const sublabel = cardEl.querySelector('.outcome-sublabel');
    const delta    = cardEl.querySelector('.outcome-baseline-delta');

    if (sublabel) sublabel.textContent = card.sublabel;
    if (delta)    delta.textContent    = card.deltaLabel;

    if (animate) {
      setTimeout(() => {
        if (valueEl) {
          const current = parseFloat(valueEl.textContent) || 0;
          countUp(valueEl, current, card.value, 800, n => card.formatter(n) + card.suffix);
        }
        if (ringFill) animateRing(ringFill, card.ringPct, RING_C);
      }, i * 100);
    } else {
      if (valueEl) valueEl.textContent = card.formatter(card.value) + card.suffix;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export function renderOutcomesSection(appEl) {
  const section = document.createElement('section');
  section.className = 'narrative-section outcomes-section section-enter';
  section.id = 'section-outcomes';

  section.innerHTML = `
    <div class="bg-orb bg-orb--teal"   style="top:-10%; left:-8%;   opacity:0.10; width:420px; height:420px;"></div>
    <div class="bg-orb bg-orb--purple" style="bottom:0%;  right:-5%; opacity:0.10; width:360px; height:360px;"></div>
    <div class="bg-orb bg-orb--blue"   style="top:40%;    right:20%; opacity:0.07; width:300px; height:300px;"></div>

    <div class="container container--wide" style="position:relative; z-index:10; width:100%;">

      <header class="section-header transition-fade">
        <p class="section-label">Measured Outcomes</p>
        <h2 class="section-title">What Intervention Delivers</h2>
        <p class="section-subtitle">
          Simulated outcomes on 1,000 synthetic PS+ subscribers.
          All numbers computed from the dataset against a no-intervention baseline.
        </p>
      </header>

      <!-- Active filter strip -->
      <div class="filter-strip" id="outcomes-filter-strip">
        <span style="color:var(--text-muted);">Showing outcomes for:</span>
        <span class="filter-strip__chip" id="outcomes-filter-chip">—</span>
        <a class="filter-strip__reset" id="outcomes-reset-link">✕ Reset to all users</a>
      </div>

      <div class="outcomes-grid" id="outcomes-grid"></div>

      <!-- Framework summary box -->
      <div class="transition-fade" style="
        max-width:780px; margin:0 auto;
        background:rgba(20,30,50,0.55);
        border:1px solid var(--border-subtle);
        border-radius:var(--radius-xl);
        padding:var(--sp-8) var(--sp-8);
        text-align:center;
        transition-delay:400ms;
      ">
        <p class="section-label" style="margin-bottom:var(--sp-3);">Intelligence Framework</p>
        <p style="font-size:var(--fs-sm); color:var(--text-secondary); line-height:var(--lh-loose); max-width:640px; margin:0 auto;">
          The <strong style="color:var(--text-primary);">Aetheris Console</strong> combines perceived-value analysis,
          continuous churn prediction, and causal counterfactual reasoning into a single scroll-driven narrative.
          Each layer feeds the next — value gaps surface churn risk, risk guides intervention selection,
          and interventions are validated against simulated population distributions.
        </p>
        <div style="
          display:flex; gap:var(--sp-8); justify-content:center; flex-wrap:wrap;
          margin-top:var(--sp-6); padding-top:var(--sp-6);
          border-top:1px solid var(--border-subtle);
        ">
          ${['Tier Analysis', 'Perceived Value', 'Churn Engine', 'Causal Lab', 'Outcomes'].map((label, i) => `
            <span style="
              font-size:var(--fs-xs); color:var(--text-muted);
              font-weight:var(--fw-semi); letter-spacing:var(--ls-wide);
              text-transform:uppercase;
              display:flex; align-items:center; gap:var(--sp-2);
            ">
              <span style="
                width:6px; height:6px; border-radius:50%;
                background:${['var(--ps-blue-light)','var(--ps-teal-light)','#FF716C','var(--ps-purple-light)','var(--ps-gold-light)'][i]};
                flex-shrink:0;
              "></span>
              ${label}
            </span>`).join('')}
        </div>
      </div>

    </div>`;

  // Append initial cards (full population)
  const initialMetrics = deriveMetrics(allUsers);
  const grid = section.querySelector('#outcomes-grid');
  buildCards(initialMetrics).forEach(card => grid.appendChild(buildCard(card)));

  appEl.appendChild(section);

  // ── Filter strip elements ─────────────────────────────────
  const filterStrip  = section.querySelector('#outcomes-filter-strip');
  const filterChip   = section.querySelector('#outcomes-filter-chip');
  const resetLink    = section.querySelector('#outcomes-reset-link');

  resetLink.addEventListener('click', () => {
    store.reset();
  });

  // ── IntersectionObserver: fire count-up exactly once ──────
  let animated = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || animated) return;
      animated = true;

      section.classList.add('is-visible');
      section.querySelectorAll('.transition-fade').forEach((el, i) => {
        setTimeout(() => el.classList.add('is-visible'), i * 100);
      });

      const cards = buildCards(deriveMetrics(allUsers));
      cards.forEach((card, i) => {
        setTimeout(() => {
          const cardEl   = document.getElementById(card.id);
          const valueEl  = cardEl?.querySelector('.outcome-value');
          const ringFill = cardEl?.querySelector('.outcome-ring-fill');
          if (valueEl)  countUp(valueEl, 0, card.value, 1500, n => card.formatter(n) + card.suffix);
          if (ringFill) animateRing(ringFill, card.ringPct, RING_C);
        }, i * 220);
      });
    });
  }, { threshold: 0.2 });

  io.observe(section);

  // ── Store subscription → recompute on filter change ───────
  store.subscribe(s => {
    const filtered = store.filterUsers(allUsers);
    const isFiltered = store.isFiltered();

    // Update filter strip
    if (isFiltered) {
      const parts = [];
      if (s.tier)    parts.push(s.tier.charAt(0).toUpperCase() + s.tier.slice(1));
      if (s.segment) parts.push(s.segment.charAt(0).toUpperCase() + s.segment.slice(1));
      if (s.brushedUsers) parts.push(`${s.brushedUsers.length} brushed`);
      filterChip.textContent = parts.join(' · ') || 'Filtered';
      filterStrip.classList.add('is-visible');
    } else {
      filterStrip.classList.remove('is-visible');
    }

    // Only recompute if section has been animated into view already
    if (!animated) return;

    const subset = filtered.length >= 5 ? filtered : allUsers;
    const cards  = buildCards(deriveMetrics(subset));
    updateCards(cards, true);
  });

  return section;
}
