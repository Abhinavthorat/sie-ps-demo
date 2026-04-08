/**
 * modules/sku-flow.js
 * Task 8 — SKU → Perceived Value → Churn Flow Visualization
 *
 * Three-stage interactive causal chain diagram:
 *   Stage 1: SKU tier pills (multi-select) → animated particle stream
 *   Stage 2: Perceived Value bands (High/Mid/Low) → proportional bars
 *   Stage 3: Churn risk arc gauges (Low/Moderate/High)
 *
 * Features:
 *   - Sankey-like arrow width scaling with user count
 *   - Continuous particle animation along flow paths
 *   - Value gap annotation (>20% threshold) → links to causal section
 *   - Simulation mode: month 1→12 with engagement drift
 *   - Cross-links: tier selection → store.set({ tier }) → heatmap highlight
 */

import * as d3       from 'd3';
import users         from '../data/users.json';
import { scoreAtMonth } from '../lib/churn-score.js';
import { store }     from '../lib/state.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TIERS = [
  { key: 'essential', label: 'Essential', subLabel: 'Entry Tier', mod: 'essential' },
  { key: 'extra',     label: 'Extra',     subLabel: 'Mid Tier',   mod: 'extra'     },
  { key: 'premium',   label: 'Premium',   subLabel: 'Flagship',   mod: 'premium'   },
];

const PV_BANDS = [
  { key: 'high', label: 'High Value',  range: [70, 100], barColor: '#00B8D4', mod: 'high' },
  { key: 'mid',  label: 'Mid Value',   range: [40,  69], barColor: '#F5A623', mod: 'mid'  },
  { key: 'low',  label: 'Low Value',   range: [0,   39], barColor: '#FF716C', mod: 'low'  },
];

const CHURN_NODES = [
  { key: 'low',  label: 'Low Risk',      pvBand: 'high', mod: 'low',  baseChurn: 0.08 },
  { key: 'mid',  label: 'Moderate Risk', pvBand: 'mid',  mod: 'mid',  baseChurn: 0.25 },
  { key: 'high', label: 'High Risk',     pvBand: 'low',  mod: 'high', baseChurn: 0.48 },
];

// Baseline churn probabilities (full population, all tiers)
const BASELINE = {
  low:  0.09,
  mid:  0.24,
  high: 0.47,
};

const VALUE_GAP_THRESHOLD = 0.20; // >20% of selected users in Low PV band
const PARTICLE_COUNT      = 6;    // per active tier per arrow segment

// ─────────────────────────────────────────────────────────────────────────────
// DATA DERIVATION per tier/month selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bin a set of users into PV bands and compute churn averages per band.
 * When simMonth is provided, re-score users at that month via scoreAtMonth.
 */
function deriveFlowData(selectedTiers, simMonth = null) {
  let cohort = users;
  if (selectedTiers.size > 0) {
    cohort = users.filter(u => selectedTiers.has(u.tier));
  }

  const total = cohort.length;
  if (total === 0) return null;

  // Score each user (optionally at a sim month)
  const scored = cohort.map(u => {
    if (simMonth !== null) {
      const s = scoreAtMonth(u, simMonth);
      return { ...u, perceivedValue: s.perceivedValue, churnProbability: s.churnProbability };
    }
    return u;
  });

  // Bin into PV bands
  const bins = { high: [], mid: [], low: [] };
  scored.forEach(u => {
    const pv = u.perceivedValue;
    if (pv >= 70)       bins.high.push(u);
    else if (pv >= 40)  bins.mid.push(u);
    else                bins.low.push(u);
  });

  // Segment breakdown inside each band
  function segBreakdown(arr) {
    const counts = { casual: 0, 'mid-core': 0, hardcore: 0 };
    arr.forEach(u => { if (counts[u.segment] !== undefined) counts[u.segment]++; });
    return counts;
  }

  const result = {};
  PV_BANDS.forEach(band => {
    const arr = bins[band.key];
    const n   = arr.length;
    const pct = total > 0 ? n / total : 0;
    const avgChurn = n > 0
      ? arr.reduce((s, u) => s + u.churnProbability, 0) / n
      : 0;
    result[band.key] = {
      n,
      pct,
      avgChurn,
      segments: segBreakdown(arr),
    };
  });

  return { total, bands: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG FLOW ARROWS (Sankey-weight + particle animation)
// ─────────────────────────────────────────────────────────────────────────────

const ARC_R   = 22;
const ARC_C   = 2 * Math.PI * ARC_R;

function buildArcSVG(pct, mod) {
  const offset = ARC_C * (1 - Math.min(pct, 1));
  return `
    <svg viewBox="0 0 52 52" class="churn-arc-wrap-svg" aria-hidden="true">
      <g transform="rotate(-90, 26, 26)">
        <circle class="churn-arc-track" cx="26" cy="26" r="${ARC_R}" />
        <circle class="churn-arc-fill churn-arc-fill--${mod}"
                cx="26" cy="26" r="${ARC_R}"
                stroke-dasharray="${ARC_C}"
                stroke-dashoffset="${offset}" />
      </g>
    </svg>`;
}

/**
 * Render left-column flow arrows (SKU → PV bands).
 * Width of each path scales with the tier user count.
 */
function renderLeftArrows(svgEl, tierCounts, totalUsers, selectedTiers) {
  svgEl.innerHTML = '';
  if (totalUsers === 0) return;

  const W = svgEl.clientWidth  || 120;
  const H = svgEl.clientHeight || 400;
  const svgRect = svgEl.getBoundingClientRect();

  const srcYs = TIERS.map(t => {
    const el = document.getElementById(`sku-pill-${t.key}`);
    const r = el?.getBoundingClientRect();
    return r ? r.top + r.height / 2 - svgRect.top : H * 0.5;
  });

  const destYs = PV_BANDS.map(b => {
    const el = document.getElementById(`pv-band-${b.key}`);
    const r = el?.getBoundingClientRect();
    return r ? r.top + r.height / 2 - svgRect.top : H * 0.5;
  });

  const srcX   = 0;
  const destX  = W;

  TIERS.forEach((tier, i) => {
    const srcY    = srcYs[i];
    const count   = tierCounts[tier.key] ?? 0;
    const active  = selectedTiers.has(tier.key);
    const weight  = totalUsers > 0 ? count / totalUsers : 0;
    const width   = Math.max(1, weight * 24);

    PV_BANDS.forEach((band, bi) => {
      const destY = destYs[bi];
      const cx1   = W * 0.4;
      const cx2   = W * 0.7;
      const path  = `M${srcX},${srcY} C${cx1},${srcY} ${cx2},${destY} ${destX},${destY}`;

      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', path);
      pathEl.setAttribute('class', `flow-path flow-path--${tier.mod}`);
      pathEl.setAttribute('stroke-width', active ? width : 1);
      pathEl.style.opacity = active ? '0.7' : '0.18';
      svgEl.appendChild(pathEl);

      // Particles along each active path
      if (active && count > 0) {
        for (let p = 0; p < PARTICLE_COUNT; p++) {
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          use.setAttribute('r', '3');
          use.setAttribute('fill', tier.key === 'premium' ? '#A855F7' : tier.key === 'extra' ? '#00E5FF' : '#00AAFF');
          use.setAttribute('opacity', '0');

          // Use offset-path for motion along the bezier
          const pathId = `lp-${tier.key}-${band.key}-${p}`;
          pathEl.setAttribute('id', pathId);
          use.style.offsetPath  = `path('${path}')`;
          use.style.offsetDistance = '0%';
          use.style.animation   = `sku-particle-move ${2.2 + p * 0.35}s ${-p * 0.5}s linear infinite`;
          svgEl.appendChild(use);
        }
      }
    });
  });
}

/**
 * Render right-column flow arrows (PV bands → Churn nodes).
 * Width scales with user count in each band.
 */
function renderRightArrows(svgEl, bandCounts, totalUsers) {
  svgEl.innerHTML = '';
  if (totalUsers === 0) return;

  const W = svgEl.clientWidth  || 120;
  const H = svgEl.clientHeight || 400;
  const svgRect = svgEl.getBoundingClientRect();

  const srcYs = PV_BANDS.map(b => {
    const el = document.getElementById(`pv-band-${b.key}`);
    const r = el?.getBoundingClientRect();
    return r ? r.top + r.height / 2 - svgRect.top : H * 0.5;
  });

  const destYs = CHURN_NODES.map(c => {
    const el = document.getElementById(`churn-node-${c.key}`);
    const r = el?.getBoundingClientRect();
    return r ? r.top + r.height / 2 - svgRect.top : H * 0.5;
  });

  PV_BANDS.forEach((band, i) => {
    const count  = bandCounts[band.key]?.n ?? 0;
    const weight = totalUsers > 0 ? count / totalUsers : 0;
    const width  = Math.max(1, weight * 28);

    const srcY  = srcYs[i];
    const destY = destYs[i]; // same index: high→low, mid→moderate, low→high
    const cx1   = W * 0.35;
    const cx2   = W * 0.65;
    const path  = `M0,${srcY} C${cx1},${srcY} ${cx2},${destY} ${W},${destY}`;

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('class', 'flow-path');
    const colors = ['rgba(0,229,255,0.55)', 'rgba(245,166,35,0.55)', 'rgba(255,113,108,0.55)'];
    pathEl.setAttribute('stroke', colors[i]);
    pathEl.setAttribute('stroke-width', width);
    pathEl.style.opacity = count > 0 ? '0.8' : '0.12';
    svgEl.appendChild(pathEl);

    // Particles for right arrows (fewer, bigger)
    if (count > 0) {
      for (let p = 0; p < 4; p++) {
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('r', '2.5');
        const fillColors = ['#00E5FF', '#F5A623', '#FF716C'];
        circ.setAttribute('fill', fillColors[i]);
        circ.setAttribute('opacity', '0');
        circ.style.offsetPath     = `path('${path}')`;
        circ.style.offsetDistance = '0%';
        circ.style.animation      = `sku-particle-move ${1.8 + p * 0.4}s ${-p * 0.45}s linear infinite`;
        svgEl.appendChild(circ);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ARC GAUGE UPDATE
// ─────────────────────────────────────────────────────────────────────────────

function updateArcGauge(nodeEl, pct) {
  const fill = nodeEl.querySelector('.churn-arc-fill, [class*="churn-arc-fill"]');
  if (!fill) return;
  const offset = ARC_C * (1 - Math.min(pct, 1));
  // Force initial paint then transition
  fill.style.strokeDashoffset = ARC_C;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.strokeDashoffset = offset;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HTML SKELETON
// ─────────────────────────────────────────────────────────────────────────────

function buildSkeleton() {
  const tierCounts = {};
  TIERS.forEach(t => { tierCounts[t.key] = users.filter(u => u.tier === t.key).length; });

  const tierPills = TIERS.map(t => `
    <div class="sku-pill sku-pill--${t.mod}" data-tier="${t.key}"
         role="checkbox" aria-checked="false" tabindex="0"
         id="sku-pill-${t.key}">
      <div class="sku-pill__tier-label">${t.subLabel}</div>
      <div class="sku-pill__name">PS+ ${t.label}</div>
      <div class="sku-pill__meta">
        <span class="sku-pill__count">${tierCounts[t.key]} users</span>
        <span class="sku-pill__check" aria-hidden="true">✓</span>
      </div>
    </div>`).join('');

  const pvBands = PV_BANDS.map(b => `
    <div class="pv-band pv-band--${b.mod}" data-band="${b.key}" id="pv-band-${b.key}">
      <div class="pv-band__label">${b.label} (${b.range[0]}–${b.range[1]})</div>
      <div class="pv-band__bar-track">
        <div class="pv-band__bar-fill" id="pv-fill-${b.key}" style="width:0%"></div>
      </div>
      <div class="pv-band__count">
        <span><strong class="pv-band__count-n" id="pv-n-${b.key}">—</strong> users</span>
        <span id="pv-pct-${b.key}" style="font-size:10px;">—%</span>
      </div>
      ${b.key === 'low' ? '<span class="value-gap-annotation" id="value-gap-ann">⚠ value gap — intervention opportunity</span>' : ''}
    </div>`).join('');

  const churnNodes = CHURN_NODES.map(n => `
    <div class="churn-node churn-node--${n.mod}" id="churn-node-${n.key}">
      <div class="churn-arc-wrap">
        <svg viewBox="0 0 52 52" aria-hidden="true">
          <g transform="rotate(-90, 26, 26)">
            <circle class="churn-arc-track" cx="26" cy="26" r="${ARC_R}" />
            <circle class="churn-arc-fill"
                    cx="26" cy="26" r="${ARC_R}"
                    stroke-dasharray="${ARC_C}"
                    stroke-dashoffset="${ARC_C}"
                    style="stroke:${n.mod === 'low' ? 'var(--ps-teal)' : n.mod === 'mid' ? 'var(--ps-gold)' : '#FF716C'}" />
          </g>
        </svg>
        <div class="churn-arc-label" id="churn-pct-${n.key}">—</div>
      </div>
      <div class="churn-node__info">
        <div class="churn-node__risk-label">${n.label}</div>
        <div class="churn-node__users" id="churn-users-${n.key}">—</div>
      </div>
      <div class="churn-delta churn-delta--neutral" id="churn-delta-${n.key}">—</div>
    </div>`).join('');

  return `
    <section class="narrative-section sku-flow-section section-enter" id="sku-flow">
      <div class="bg-orb bg-orb--blue"   style="top:10%;   left:-10%;  opacity:0.08; width:450px; height:450px;"></div>
      <div class="bg-orb bg-orb--purple" style="bottom:5%; right:-8%;  opacity:0.08; width:380px; height:380px;"></div>

      <div class="container container--wide" style="position:relative; z-index:10; width:100%;">

        <header class="section-header transition-fade">
          <p class="section-label">Causal Architecture</p>
          <h2 class="section-title">SKU → Value → Churn</h2>
          <p class="section-subtitle">
            Select one or more tiers to trace the causal chain.
            One SKU produces <em>heterogeneous</em> perceived value — that spread is where churn risk lives.
          </p>
        </header>

        <!-- Stage headers -->
        <div class="sku-flow-canvas" id="sku-flow-canvas" style="margin-bottom:0; align-items:start;">
          <div>
            <div class="flow-stage-label transition-fade" style="transition-delay:80ms;">
              Stage 1 — SKU Tier
            </div>
            <div class="sku-stage" id="sku-stage">${tierPills}</div>
          </div>

          <div class="flow-arrow-col flow-arrow-col--left" id="flow-left-col">
            <svg id="flow-left-svg" width="100%" height="100%" style="min-height:380px;"></svg>
          </div>

          <div>
            <div class="flow-stage-label transition-fade" style="transition-delay:120ms;">
              Stage 2 — Perceived Value
            </div>
            <div class="pv-stage" id="pv-stage">${pvBands}</div>
          </div>

          <div class="flow-arrow-col flow-arrow-col--right" id="flow-right-col">
            <svg id="flow-right-svg" width="100%" height="100%" style="min-height:380px;"></svg>
          </div>

          <div>
            <div class="flow-stage-label transition-fade" style="transition-delay:160ms;">
              Stage 3 — Churn Risk
            </div>
            <div class="churn-stage" id="churn-stage">${churnNodes}</div>
          </div>
        </div>

        <!-- Simulation controls -->
        <div class="sim-controls transition-fade" id="sim-controls" style="transition-delay:200ms;">
          <div class="sim-month-display" id="sim-month-display">Month 0</div>
          <div class="sim-month-label">Simulate engagement drift over time</div>
          <div class="sim-progress" id="sim-progress-track">
            <div class="sim-progress__fill" id="sim-progress-fill"></div>
          </div>
          <button class="sim-btn" id="sim-play-btn">
            <svg id="sim-play-icon" width="10" height="12" viewBox="0 0 10 12" fill="none">
              <path d="M1 1l8 5-8 5V1z" fill="currentColor"/>
            </svg>
            Simulate
          </button>
          <button class="sim-btn sim-btn--reset" id="sim-reset-btn">↺ Reset</button>
        </div>

      </div>
    </section>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PV TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

function buildTooltip() {
  let tip = document.getElementById('pv-band-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'pv-band-tooltip';
    tip.className = 'pv-tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

function showBandTooltip(tip, event, bandData, bandLabel) {
  const { segments } = bandData;
  const total = Object.values(segments).reduce((s, n) => s + n, 0) || 1;

  const SEG_COLORS = { casual: '#00AAFF', 'mid-core': '#00E5FF', hardcore: '#A855F7' };

  const barParts = Object.entries(segments).map(([seg, n]) =>
    `<div style="width:${(n / total * 100).toFixed(1)}%;background:${SEG_COLORS[seg]};height:100%;"></div>`
  ).join('');

  tip.innerHTML = `
    <div class="pv-tooltip__title">${bandLabel} — Segment Mix</div>
    <div class="pv-tooltip__seg-bar">${barParts}</div>
    <div class="pv-tooltip__seg-label">
      ${Object.entries(segments).map(([seg, n]) =>
        `<span style="color:${SEG_COLORS[seg]};">${seg.charAt(0).toUpperCase() + seg.slice(1)}: ${n}</span>`
      ).join('')}
    </div>
    <div style="margin-top:var(--sp-2);font-size:10px;color:var(--text-muted);">
      Avg churn: <strong style="color:var(--text-primary);">${(bandData.avgChurn * 100).toFixed(1)}%</strong>
    </div>`;

  const x = Math.min(event.clientX + 16, window.innerWidth  - 220);
  const y = Math.min(event.clientY + 12, window.innerHeight - 160);
  tip.style.left = `${x}px`;
  tip.style.top  = `${y}px`;
  tip.classList.add('is-visible');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN UPDATE FUNCTION — called on tier toggle or simulation tick
// ─────────────────────────────────────────────────────────────────────────────

function buildUpdater(sectionEl, selectedTiers) {
  const leftSvg   = sectionEl.querySelector('#flow-left-svg');
  const rightSvg  = sectionEl.querySelector('#flow-right-svg');
  const gapAnn    = sectionEl.querySelector('#value-gap-ann');

  function update(flowData) {
    if (!flowData) return;
    const { total, bands } = flowData;

    // ── Stage 2: PV bands ───
    PV_BANDS.forEach(band => {
      const band_data  = bands[band.key];
      const fillEl     = sectionEl.querySelector(`#pv-fill-${band.key}`);
      const countEl    = sectionEl.querySelector(`#pv-n-${band.key}`);
      const pctEl      = sectionEl.querySelector(`#pv-pct-${band.key}`);

      const pctW = (band_data.pct * 100).toFixed(1);
      if (fillEl)  fillEl.style.width  = `${pctW}%`;
      if (countEl) countEl.textContent = band_data.n;
      if (pctEl)   pctEl.textContent   = `${pctW}%`;
    });

    // ── Value gap annotation ───
    const lowPct = bands.low.pct;
    if (gapAnn) {
      gapAnn.classList.toggle('is-visible', lowPct > VALUE_GAP_THRESHOLD && selectedTiers.size > 0);
    }

    // ── Stage 3: Churn arc gauges ───
    CHURN_NODES.forEach(node => {
      const band_data = bands[node.pvBand];
      const churn     = band_data.avgChurn;
      const n         = band_data.n;

      const pctEl    = sectionEl.querySelector(`#churn-pct-${node.key}`);
      const usersEl  = sectionEl.querySelector(`#churn-users-${node.key}`);
      const deltaEl  = sectionEl.querySelector(`#churn-delta-${node.key}`);
      const nodeEl   = sectionEl.querySelector(`#churn-node-${node.key}`);

      if (pctEl)   pctEl.textContent   = `${(churn * 100).toFixed(0)}%`;
      if (usersEl) usersEl.textContent = `${n} users`;

      // Arc fill
      if (nodeEl) {
        const fill = nodeEl.querySelector('.churn-arc-fill');
        if (fill) {
          const offset = ARC_C * (1 - Math.min(churn, 1));
          fill.style.strokeDashoffset = offset;
        }
      }

      // Delta vs baseline
      if (deltaEl) {
        const base  = BASELINE[node.key];
        const delta = churn - base;
        const sign  = delta >= 0 ? '+' : '';
        deltaEl.textContent         = `${sign}${(delta * 100).toFixed(1)}%`;
        deltaEl.className = `churn-delta churn-delta--${delta > 0.02 ? 'positive' : delta < -0.02 ? 'negative' : 'neutral'}`;
      }
    });

    // ── Flow arrows ───
    const tierCounts = {};
    TIERS.forEach(t => {
      tierCounts[t.key] = selectedTiers.has(t.key)
        ? users.filter(u => u.tier === t.key).length
        : 0;
    });

    renderLeftArrows(leftSvg, tierCounts, total, selectedTiers);
    renderRightArrows(rightSvg, bands, total);
  }

  return update;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SIM_MONTH = 12;
const MS_PER_MONTH  = 900; // 1s per month at 1× speed

function buildSimulation(sectionEl, selectedTiers, update) {
  const monthDisplay  = sectionEl.querySelector('#sim-month-display');
  const playBtn       = sectionEl.querySelector('#sim-play-btn');
  const resetBtn      = sectionEl.querySelector('#sim-reset-btn');
  const progressFill  = sectionEl.querySelector('#sim-progress-fill');
  const playIcon      = sectionEl.querySelector('#sim-play-icon');

  let currentMonth = 0;
  let isPlaying    = false;
  let intervalId   = null;

  function setPlayIcon(playing) {
    playIcon.setAttribute('d', playing
      ? 'M1 1h3v10H1zM6 1h3v10H6z'   // pause
      : 'M1 1l8 5-8 5V1z');           // play
  }

  function tick() {
    currentMonth++;
    if (currentMonth > MAX_SIM_MONTH) {
      currentMonth = MAX_SIM_MONTH;
      stopSim();
      return;
    }
    applyMonth(currentMonth);
  }

  function applyMonth(month) {
    if (monthDisplay) monthDisplay.textContent = `Month ${month}`;
    if (progressFill) progressFill.style.width = `${(month / MAX_SIM_MONTH) * 100}%`;
    const flowData = deriveFlowData(selectedTiers, month);
    update(flowData);
  }

  function startSim() {
    if (currentMonth >= MAX_SIM_MONTH) resetSim();
    isPlaying = true;
    setPlayIcon(true);
    playBtn.classList.add('sim-btn--active');
    intervalId = setInterval(tick, MS_PER_MONTH);
  }

  function stopSim() {
    isPlaying = false;
    setPlayIcon(false);
    playBtn.classList.remove('sim-btn--active');
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function resetSim() {
    stopSim();
    currentMonth = 0;
    if (monthDisplay) monthDisplay.textContent = 'Month 0';
    if (progressFill) progressFill.style.width = '0%';
    const flowData = deriveFlowData(selectedTiers, null);
    update(flowData);
  }

  playBtn.addEventListener('click', () => isPlaying ? stopSim() : startSim());
  resetBtn.addEventListener('click', resetSim);

  return { startSim, stopSim, resetSim };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE CSS INJECTION (offset-path motion)
// ─────────────────────────────────────────────────────────────────────────────

function injectParticleKeyframes() {
  if (document.getElementById('sku-particle-style')) return;
  const style = document.createElement('style');
  style.id = 'sku-particle-style';
  style.textContent = `
    @keyframes sku-particle-move {
      0%   { offset-distance: 5%;   opacity: 0; }
      8%   { opacity: 0.9; }
      92%  { opacity: 0.9; }
      100% { offset-distance: 95%;  opacity: 0; }
    }`;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function renderSkuFlowSection(appEl) {
  injectParticleKeyframes();

  // Insert the section HTML
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildSkeleton();
  const sectionEl = wrapper.firstElementChild;
  appEl.appendChild(sectionEl);  // call order in main.js places it after tiers


  const selectedTiers = new Set(); // start with none selected

  // Update function
  const update = buildUpdater(sectionEl, selectedTiers);

  // Initial state: show full-population dist with no selection
  update(deriveFlowData(new Set(['essential', 'extra', 'premium']), null));

  // ── Tier pill interaction ──────────────────────────────────────────────────
  sectionEl.querySelectorAll('.sku-pill').forEach(pill => {
    function toggle() {
      const tier = pill.dataset.tier;
      if (selectedTiers.has(tier)) {
        selectedTiers.delete(tier);
        pill.classList.remove('is-active');
        pill.setAttribute('aria-checked', 'false');
      } else {
        selectedTiers.add(tier);
        pill.classList.add('is-active');
        pill.setAttribute('aria-checked', 'true');
      }

      // Cross-link: single tier selected → push to global store
      if (selectedTiers.size === 1) {
        store.set({ tier: [...selectedTiers][0] });
      } else {
        store.set({ tier: null }); // multi or none → no filter
      }

      // Dispatch for heatmap highlight
      document.dispatchEvent(new CustomEvent('sku:tierchange', {
        detail: { tiers: [...selectedTiers] }
      }));

      const flowData = deriveFlowData(
        selectedTiers.size > 0 ? selectedTiers : new Set(['essential', 'extra', 'premium']),
        null
      );
      update(flowData);
    }

    pill.addEventListener('click', toggle);
    pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // ── PV band tooltip ───────────────────────────────────────────────────────
  const pvTip = buildTooltip();

  sectionEl.querySelectorAll('.pv-band').forEach(bandEl => {
    const bandKey = bandEl.dataset.band;
    const bandDef = PV_BANDS.find(b => b.key === bandKey);

    bandEl.addEventListener('mousemove', (e) => {
      const flowData = deriveFlowData(
        selectedTiers.size > 0 ? selectedTiers : new Set(['essential', 'extra', 'premium']),
        null
      );
      if (flowData) showBandTooltip(pvTip, e, flowData.bands[bandKey], bandDef.label);
    });

    bandEl.addEventListener('mouseleave', () => pvTip.classList.remove('is-visible'));
  });

  // ── Value gap annotation click → scroll to causal ─────────────────────────
  const gapAnn = sectionEl.querySelector('#value-gap-ann');
  if (gapAnn) {
    gapAnn.addEventListener('click', () => {
      const causal = document.getElementById('causal-intervention');
      if (causal) causal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Simulation setup ──────────────────────────────────────────────────────
  const sim = buildSimulation(
    sectionEl,
    selectedTiers.size > 0 ? selectedTiers : new Set(['essential', 'extra', 'premium']),
    update,
  );

  // ── Scroll entrance trigger ────────────────────────────────────────────────
  let rendered = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !rendered) {
        rendered = true;
        sectionEl.classList.add('is-visible');
        sectionEl.querySelectorAll('.transition-fade').forEach((el, i) => {
          setTimeout(() => el.classList.add('is-visible'), i * 100);
        });

        // Trigger arc fill animations after a short delay
        setTimeout(() => {
          const flowData = deriveFlowData(new Set(['essential', 'extra', 'premium']), null);
          update(flowData);
        }, 350);
      }
    });
  }, { threshold: 0.1 });

  io.observe(sectionEl);

  // ── ResizeObserver: redraw arrows when container resizes ──────────────────
  const ro = new ResizeObserver(() => {
    const flowData = deriveFlowData(
      selectedTiers.size > 0 ? selectedTiers : new Set(['essential', 'extra', 'premium']),
      null
    );
    const leftSvg  = sectionEl.querySelector('#flow-left-svg');
    const rightSvg = sectionEl.querySelector('#flow-right-svg');
    const tierCounts = {};
    TIERS.forEach(t => { tierCounts[t.key] = users.filter(u => u.tier === t.key).length; });
    if (leftSvg)  renderLeftArrows(leftSvg, tierCounts, flowData?.total ?? 0, selectedTiers);
    if (rightSvg) renderRightArrows(rightSvg, flowData?.bands ?? {}, flowData?.total ?? 0);
  });
  ro.observe(sectionEl);

  return sectionEl;
}
