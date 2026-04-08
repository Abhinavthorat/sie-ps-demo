/**
 * modules/causal-intervention.js
 * Task 4 — Causal Intervention & Counterfactual Layer
 *
 * Three sub-visualizations:
 *   A. #viz-counterfactual   — Side-by-side churn probability curves (A/B)
 *   B. #viz-distribution-shift — KDE overlay, before/after with D3 morphing
 *   C. #viz-network          — Force-directed social graph with BFS propagation
 *
 * All three respond to the shared intervention selector.
 */

import * as d3 from 'd3';
import users from '../data/users.json';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INTERVENTION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const INTERVENTIONS = {
  'upgrade-offer': {
    label:         'Upgrade Offer',
    icon:          '⬆',
    description:   'Tier upgrade incentive for Essential/Extra subscribers',
    baseReduction: 0.12,
    networkSpread: 0.07,   // how far effect spreads to 2nd-degree connections
    targetTiers:   ['essential', 'extra'],
    color:         '#00AAFF',
  },
  'price-lock': {
    label:         'Price Lock',
    icon:          '🔒',
    description:   'Price freeze guarantee for 12 months',
    baseReduction: 0.08,
    networkSpread: 0.04,
    targetTiers:   ['essential', 'extra', 'premium'],
    color:         '#F5A623',
  },
  'content-drip': {
    label:         'Content Drip',
    icon:          '🎮',
    description:   'Personalised weekly game recommendation cadence',
    baseReduction: 0.10,
    networkSpread: 0.06,
    targetTiers:   ['extra', 'premium'],
    color:         '#A855F7',
  },
};

const CHURN_THRESHOLD = 0.30;

// ─────────────────────────────────────────────────────────────────────────────
// A. COUNTERFACTUAL CURVES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a churn-probability-by-perceived-value curve for a given tier.
 * Both the control (without) and treated (with intervention) curves
 * are derived from users.json — we bucket by perceivedValue quantile.
 */
function buildCounterfactualCurves(intervention) {
  const iv    = INTERVENTIONS[intervention];
  const ALL   = users.filter(u => iv.targetTiers.includes(u.tier));

  // Sort by perceivedValue, divide into 20 quantile buckets
  const sorted  = [...ALL].sort((a, b) => a.perceivedValue - b.perceivedValue);
  const buckets = 20;
  const size    = Math.ceil(sorted.length / buckets);

  const control = [];
  const treated = [];

  for (let i = 0; i < buckets; i++) {
    const slice    = sorted.slice(i * size, (i + 1) * size);
    if (slice.length === 0) continue;

    const x        = d3.mean(slice, u => u.perceivedValue);
    const baseline = d3.mean(slice, u => u.churnProbability);
    const reduced  = Math.max(0.01, baseline - iv.baseReduction * (1 - x / 100 * 0.4));

    control.push({ x, y: baseline });
    treated.push({ x, y: reduced });
  }

  return { control, treated, iv };
}

function renderCounterfactual(containerEl, intervention) {
  containerEl.innerHTML = '';

  // Allow live drag adjustment of baseReduction (clamped 0.02–0.25)
  const ivBase = INTERVENTIONS[intervention];
  let liveReduction = ivBase.baseReduction;

  const { control, treated: _treated, iv } = buildCounterfactualCurves(intervention);
  // treated will be recomputed when drag moves; start with original
  let treated = _treated;

  const W      = containerEl.clientWidth || 900;
  const margin = { top: 30, right: 28, bottom: 48, left: 52 };
  const iW     = W - margin.left - margin.right;
  const iH     = Math.max(180, Math.min(260, iW * 0.22));
  const H      = iH + margin.top + margin.bottom;

  const xScale = d3.scaleLinear().domain([0, 100]).range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, 0.6]).range([iH, 0]);

  const svg = d3.select(containerEl)
    .append('svg')
    .attr('class', 'viz-canvas')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%');

  const defs = svg.append('defs');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // ── Grid ──────────────────────────────────────────────────
  g.append('g').attr('class', 'viz-grid-line')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(10).tickSize(-iH).tickFormat(''));

  g.append('g').attr('class', 'viz-grid-line')
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW).tickFormat(''));

  // ── Axes ───────────────────────────────────────────────────
  g.append('g').attr('class', 'viz-axis viz-axis--x')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(10));

  g.append('g').attr('class', 'viz-axis viz-axis--y')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${(d * 100).toFixed(0)}%`));

  g.append('text')
    .attr('x', iW / 2).attr('y', iH + 40)
    .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
    .style('font-size', '11px').style('letter-spacing', '0.07em')
    .style('text-transform', 'uppercase')
    .text('Perceived Value Score →');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -iH / 2).attr('y', -40)
    .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
    .style('font-size', '11px').style('letter-spacing', '0.07em')
    .style('text-transform', 'uppercase')
    .text('← Churn Probability');

  // ── Threshold line ────────────────────────────────────────
  const ty = yScale(CHURN_THRESHOLD);
  g.append('line')
    .attr('x1', 0).attr('x2', iW)
    .attr('y1', ty).attr('y2', ty)
    .attr('stroke', 'rgba(255,113,108,0.4)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 4');

  g.append('text')
    .attr('x', iW - 4).attr('y', ty - 5)
    .attr('text-anchor', 'end')
    .attr('fill', 'rgba(255,113,108,0.6)')
    .style('font-size', '9px').style('font-weight', '600')
    .text('Churn threshold 30%');

  // ── Shaded gap between curves ─────────────────────────────
  const areaGap = d3.area()
    .x(d => xScale(d.x))
    .y0((d, i) => yScale(control[i]?.y ?? d.y))
    .y1(d => yScale(d.y))
    .curve(d3.curveMonotoneX);

  // Gradient for gap fill
  const gapGrad = defs.append('linearGradient')
    .attr('id', `cf-gap-grad-${intervention}`)
    .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
  gapGrad.append('stop').attr('offset', '0%')
    .attr('stop-color', iv.color).attr('stop-opacity', 0.28);
  gapGrad.append('stop').attr('offset', '100%')
    .attr('stop-color', iv.color).attr('stop-opacity', 0.05);

  defs.append('clipPath').attr('id', 'cf-gap-clip')
    .append('rect').attr('width', iW).attr('height', iH);

  const gapPath = g.append('path')
    .datum(treated)
    .attr('fill', `url(#cf-gap-grad-${intervention})`)
    .attr('d', areaGap)
    .attr('clip-path', 'url(#cf-gap-clip)')
    .attr('opacity', 0);

  // ── Control curve (without intervention) ──────────────────
  const lineGen = d3.line()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveMonotoneX);

  // Control area grad
  const ctrlGrad = defs.append('linearGradient')
    .attr('id', `cf-ctrl-grad-${intervention}`)
    .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
  ctrlGrad.append('stop').attr('offset', '0%')
    .attr('stop-color', 'rgba(255,113,108,0.15)');
  ctrlGrad.append('stop').attr('offset', '100%')
    .attr('stop-color', 'rgba(255,113,108,0)');

  const ctrlArea = d3.area()
    .x(d => xScale(d.x)).y0(iH).y1(d => yScale(d.y))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(control)
    .attr('fill', `url(#cf-ctrl-grad-${intervention})`)
    .attr('d', ctrlArea);

  const ctrlLine = g.append('path').datum(control)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(255,113,108,0.8)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '6 4')
    .attr('d', lineGen);

  // ── Treated curve (with intervention) ─────────────────────
  const trtGrad = defs.append('linearGradient')
    .attr('id', `cf-trt-grad-${intervention}`)
    .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
  trtGrad.append('stop').attr('offset', '0%')
    .attr('stop-color', iv.color).attr('stop-opacity', 0.18);
  trtGrad.append('stop').attr('offset', '100%')
    .attr('stop-color', iv.color).attr('stop-opacity', 0);

  const trtArea = d3.area()
    .x(d => xScale(d.x)).y0(iH).y1(d => yScale(d.y))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(treated)
    .attr('fill', `url(#cf-trt-grad-${intervention})`)
    .attr('d', trtArea);

  const trtLine = g.append('path').datum(treated)
    .attr('fill', 'none')
    .attr('stroke', iv.color)
    .attr('stroke-width', 2.5)
    .attr('d', lineGen)
    .attr('opacity', 0);

  // ── Animate in (staggered) ────────────────────────────────
  setTimeout(() => {
    trtLine.transition().duration(500).attr('opacity', 1);
    gapPath.transition().duration(500).attr('opacity', 1);
  }, 80);

  // ── Gap label annotation (mid-point) ─────────────────────
  const midIdx  = Math.floor(control.length / 2);
  const midX    = xScale(control[midIdx].x);
  const midCY   = yScale(control[midIdx].y);
  const midTY   = yScale(treated[midIdx].y);
  const gapPct  = ((control[midIdx].y - treated[midIdx].y) * 100).toFixed(1);

  const annG = g.append('g').attr('class', 'cf-gap-annotation');

  annG.append('line')
    .attr('x1', midX).attr('x2', midX)
    .attr('y1', midCY).attr('y2', midTY)
    .attr('stroke', iv.color).attr('stroke-width', 1)
    .attr('stroke-dasharray', '2 2').attr('opacity', 0.7);

  annG.append('text')
    .attr('x', midX + 6).attr('y', (midCY + midTY) / 2)
    .attr('dominant-baseline', 'middle')
    .attr('fill', iv.color)
    .style('font-size', '11px').style('font-weight', '700')
    .text(`−${gapPct}%`);

  // Update gap-stat in the label group
  const gapValueEl = document.getElementById('cf-gap-value');
  const gapLabelEl = document.getElementById('cf-gap-label');
  if (gapValueEl) gapValueEl.textContent = `−${gapPct}%`;
  if (gapLabelEl) gapLabelEl.textContent = `avg churn reduction · ${iv.label}`;

  // ── Drag handle on gap midpoint ───────────────────────────
  // Dragging up/down adjusts liveReduction → re-draws treated curve + gap
  const handleX = midX;
  const handleY = (midCY + midTY) / 2;

  // Recompute treated points from control given a reduction factor
  function recomputeTreated(reduction) {
    return control.map(pt => ({
      x: pt.x,
      y: Math.max(0.01, pt.y - reduction * (1 - pt.x / 100 * 0.4)),
    }));
  }

  const handleG = g.append('g')
    .attr('class', 'cf-drag-handle')
    .attr('transform', `translate(${handleX},${handleY})`)
    .style('cursor', 'ns-resize');

  handleG.append('circle')
    .attr('r', 6)
    .attr('fill', iv.color)
    .attr('stroke', 'var(--bg-void)')
    .attr('stroke-width', 1.5);

  handleG.append('text')
    .attr('class', 'cf-effect-label')
    .attr('x', 10).attr('y', 4)
    .attr('fill', iv.color)
    .style('font-size', '10px').style('font-weight', '700')
    .text('drag ↕');

  // Track drag start position
  let dragStartY = 0;
  let dragStartReduction = liveReduction;

  handleG.call(d3.drag()
    .on('start', (event) => {
      dragStartY         = event.y;
      dragStartReduction = liveReduction;
      event.sourceEvent.stopPropagation();
    })
    .on('drag', (event) => {
      // Dragging up (negative dy) increases reduction, down decreases
      const dy = event.y - dragStartY;
      const delta = -(dy / iH) * 0.30;  // map full height → ±0.30 reduction
      liveReduction = Math.max(0.02, Math.min(0.25, dragStartReduction + delta));

      // Recompute treated data
      treated = recomputeTreated(liveReduction);

      // Update treated curve paths
      trtLine.datum(treated).attr('d', lineGen);
      gapPath.datum(treated).attr('d', areaGap);

      // Update gap annotation text + handle position
      const newMidTY   = yScale(treated[midIdx].y);
      const newGapPct  = ((control[midIdx].y - treated[midIdx].y) * 100).toFixed(1);
      const newHandleY = (midCY + newMidTY) / 2;

      annG.select('line').attr('y2', newMidTY);
      annG.select('text').attr('y', (midCY + newMidTY) / 2).text(`−${newGapPct}%`);
      handleG.attr('transform', `translate(${handleX},${newHandleY})`);

      if (gapValueEl) gapValueEl.textContent = `−${newGapPct}%`;
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// B. DISTRIBUTION SHIFT (KDE overlay – before / after)
// ─────────────────────────────────────────────────────────────────────────────

const EPAN_BW = 4.5;

function epanechnikov(bw) {
  return v => {
    const u = v / bw;
    return Math.abs(u) <= 1 ? (0.75 * (1 - u * u)) / bw : 0;
  };
}

function computeKDE(values, thresholds, bw) {
  const k = epanechnikov(bw);
  return thresholds.map(x => ({ x, y: d3.mean(values, v => k(x - v)) }));
}

const THRESHOLDS = d3.range(0, 1.01, 0.01);

function renderDistributionShift(containerEl, svgContainerEl, readoutEl, intervention) {
  const iv       = INTERVENTIONS[intervention];
  const eligible = users.filter(u => iv.targetTiers.includes(u.tier));

  const beforeValues = eligible.map(u => u.churnProbability);
  const afterValues  = eligible.map(u =>
    Math.max(0.01, u.churnProbability - iv.baseReduction * (1 + (1 - u.perceivedValue / 100) * 0.3))
  );

  const kdeBefore = computeKDE(beforeValues, THRESHOLDS, EPAN_BW / 100);
  const kdeAfter  = computeKDE(afterValues,  THRESHOLDS, EPAN_BW / 100);

  const movedBelow = eligible.filter(u => {
    const after = Math.max(0.01, u.churnProbability - iv.baseReduction * (1 + (1 - u.perceivedValue / 100) * 0.3));
    return u.churnProbability >= CHURN_THRESHOLD && after < CHURN_THRESHOLD;
  }).length;

  // Update readout
  if (readoutEl) {
    readoutEl.innerHTML = `
      <span class="dist-shift-count">${movedBelow.toLocaleString()}</span>
      <span class="dist-shift-label">users moved below<br>30% churn threshold</span>`;
  }

  // Draw / morph SVG
  svgContainerEl.innerHTML = '';

  const W      = svgContainerEl.clientWidth || 480;
  const margin = { top: 30, right: 28, bottom: 48, left: 52 };
  const iW     = W - margin.left - margin.right;
  const iH     = Math.max(180, Math.min(260, iW * 0.22));
  const H      = iH + margin.top + margin.bottom;

  const xScale = d3.scaleLinear().domain([0, 1]).range([0, iW]);
  const maxDensity = Math.max(
    d3.max(kdeBefore, d => d.y),
    d3.max(kdeAfter,  d => d.y),
  );
  const yScale = d3.scaleLinear().domain([0, maxDensity * 1.1]).range([iH, 0]);

  const svg = d3.select(svgContainerEl)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%');

  const defs = svg.append('defs');

  const beforeGrad = defs.append('linearGradient')
    .attr('id', 'dist-before-grad')
    .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
  beforeGrad.append('stop').attr('offset', '0%')
    .attr('stop-color', 'rgba(255,113,108,0.25)');
  beforeGrad.append('stop').attr('offset', '100%')
    .attr('stop-color', 'rgba(255,113,108,0)');

  const afterGrad = defs.append('linearGradient')
    .attr('id', 'dist-after-grad')
    .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
  afterGrad.append('stop').attr('offset', '0%')
    .attr('stop-color', iv.color.replace(')', ',0.3)').replace('rgb', 'rgba'));
  afterGrad.append('stop').attr('offset', '100%')
    .attr('stop-color', iv.color.replace(')', ',0)').replace('rgb', 'rgba'));

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Grid
  g.append('g').attr('class', 'viz-grid-line')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(5).tickSize(-iH).tickFormat(''));

  // Axes
  g.append('g').attr('class', 'viz-axis viz-axis--x')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${(d * 100).toFixed(0)}%`));

  g.append('text')
    .attr('x', iW / 2).attr('y', iH + 40)
    .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
    .style('font-size', '11px').style('letter-spacing', '0.07em')
    .style('text-transform', 'uppercase')
    .text('Churn Probability →');

  // Threshold line
  const tx = xScale(CHURN_THRESHOLD);
  g.append('line')
    .attr('x1', tx).attr('x2', tx)
    .attr('y1', 0).attr('y2', iH)
    .attr('stroke', 'rgba(255,113,108,0.5)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 4');

  g.append('text')
    .attr('x', tx + 4).attr('y', 12)
    .attr('fill', 'rgba(255,113,108,0.65)')
    .style('font-size', '9px').style('font-weight', '600')
    .text('30%');

  // Area generators
  const areaGen = d3.area()
    .x(d => xScale(d.x)).y0(iH).y1(d => yScale(d.y))
    .curve(d3.curveBasis);

  const lineGen = d3.line()
    .x(d => xScale(d.x)).y(d => yScale(d.y))
    .curve(d3.curveBasis);

  // BEFORE curve
  g.append('path').datum(kdeBefore)
    .attr('fill', 'url(#dist-before-grad)')
    .attr('d', areaGen);

  g.append('path').datum(kdeBefore)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(255,113,108,0.85)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '6 4')
    .attr('d', lineGen);

  // AFTER curve — morphs from before position
  const afterAreaPath = g.append('path')
    .datum(kdeBefore)                          // start from before
    .attr('fill', `url(#dist-after-grad)`)
    .attr('d', areaGen);

  const afterLinePath = g.append('path')
    .datum(kdeBefore)
    .attr('fill', 'none')
    .attr('stroke', iv.color)
    .attr('stroke-width', 2.5)
    .attr('d', lineGen)
    .attr('opacity', 0.3);

  // Smooth morph to actual after distribution
  afterAreaPath.transition().duration(700).ease(d3.easeCubicOut)
    .datum(kdeAfter).attr('d', areaGen);

  afterLinePath.transition().duration(700).ease(d3.easeCubicOut)
    .attr('opacity', 1)
    .datum(kdeAfter).attr('d', lineGen);
}

// ─────────────────────────────────────────────────────────────────────────────
// C. NETWORK GRAPH (force-directed, BFS propagation)
// ─────────────────────────────────────────────────────────────────────────────

// Build a lightweight 90-node graph from users.json
function buildNetworkData() {
  // Take first 90 users; trim social connections to this range
  const SLICE = 90;
  const pool  = users.slice(0, SLICE);

  const nodes = pool.map(u => ({
    id:    u.id,
    tier:  u.tier,
    segment: u.segment,
    churnProbability: u.churnProbability,
    risk:  u.churnProbability >= 0.35 ? 'high'
         : u.churnProbability >= 0.18 ? 'medium' : 'low',
    intervened:     false,
    secondDegree:   false,
    effectReduction: 0,
  }));

  // Build edges: only within the 90-node pool
  const nodeIds = new Set(pool.map(u => u.id));
  const links   = [];
  const seen    = new Set();

  pool.forEach(u => {
    u.socialConnections.forEach(targetId => {
      if (!nodeIds.has(targetId)) return;
      const key = [Math.min(u.id, targetId), Math.max(u.id, targetId)].join('-');
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ source: u.id, target: targetId });
    });
  });

  return { nodes, links };
}

function nodeColor(node, currentIntervention) {
  if (node.intervened) return '#00E5FF';          // teal = intervened
  if (node.secondDegree) {
    const iv = INTERVENTIONS[currentIntervention];
    return iv ? iv.color + 'AA' : '#80AACC';       // tinted intervention color
  }
  const effectiveRisk = Math.max(0, node.churnProbability - node.effectReduction);
  if (effectiveRisk >= 0.35) return '#FF716C';    // red = high risk
  if (effectiveRisk >= 0.18) return '#F5A623';    // amber = medium
  return '#4AF090';                                // green = safe
}

function renderNetwork(containerEl, intervention) {
  // Remove any previous journey:highlight listener before rebuilding
  containerEl._removeJourneyListener?.();
  containerEl.innerHTML = '';

  const { nodes, links } = buildNetworkData();

  // Mutable state
  let intervened   = new Set();   // node ids explicitly clicked
  let secondDegree = new Set();   // node ids reached by BFS
  let currentIv    = intervention;
  let riskThreshold = 0.35;       // driven by slider

  // ── Hover tooltip ──────────────────────────────────────────
  let tooltip = document.getElementById('network-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'network-tooltip';
    tooltip.className = 'network-tooltip';
    document.body.appendChild(tooltip);
  }

  // ── Right-click popover ────────────────────────────────────
  let popover = document.getElementById('network-node-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'network-node-popover';
    popover.className = 'node-popover';
    popover.innerHTML = `
      <div class="node-popover__header">
        <span class="node-popover__title" id="npo-title">—</span>
        <button class="node-popover__close" id="npo-close">✕</button>
      </div>
      <div class="node-popover__row"><span>Tier</span><strong id="npo-tier">—</strong></div>
      <div class="node-popover__row"><span>Segment</span><strong id="npo-seg">—</strong></div>
      <div class="node-popover__row"><span>Churn probability</span><strong id="npo-churn">—</strong></div>
      <div class="node-popover__row"><span>Months active</span><strong id="npo-months">—</strong></div>
      <div class="node-popover__row" id="npo-after-row" style="display:none;"><span>After intervention</span><strong id="npo-after">—</strong></div>`;
    document.body.appendChild(popover);
    popover.querySelector('#npo-close').addEventListener('click', () => {
      popover.classList.remove('is-visible');
    });
  }

  // Close popover on outside click
  document.addEventListener('click', () => popover.classList.remove('is-visible'), { capture: true });

  function showPopover(event, d) {
    event.preventDefault();
    event.stopPropagation();
    tooltip.classList.remove('is-visible');

    const effective = Math.max(0, d.churnProbability - d.effectReduction);
    popover.querySelector('#npo-title').textContent  = `User #${d.id}`;
    popover.querySelector('#npo-tier').textContent   = d.tier.charAt(0).toUpperCase() + d.tier.slice(1);
    popover.querySelector('#npo-seg').textContent    = d.segment;
    popover.querySelector('#npo-churn').textContent  = `${(d.churnProbability * 100).toFixed(1)}%`;
    // monthsActive not on node object — derive from users array index (first 90)
    const userRef = users[d.id];
    popover.querySelector('#npo-months').textContent = userRef ? `${userRef.monthsActive} mo` : '—';

    const afterRow = popover.querySelector('#npo-after-row');
    if (d.effectReduction > 0) {
      afterRow.style.display = '';
      popover.querySelector('#npo-after').textContent = `${(effective * 100).toFixed(1)}%`;
    } else {
      afterRow.style.display = 'none';
    }

    const x = Math.min(event.clientX + 14, window.innerWidth  - 210);
    const y = Math.min(event.clientY + 14, window.innerHeight - 200);
    popover.style.left = `${x}px`;
    popover.style.top  = `${y}px`;
    popover.classList.add('is-visible');
  }

  const W = containerEl.clientWidth  || 500;
  const H = Math.min(420, Math.max(320, W * 0.72));

  const svg = d3.select(containerEl)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .style('cursor', 'grab');

  // ── Zoom / pan ─────────────────────────────────────────────
  const zoomG = svg.append('g').attr('class', 'zoom-root');

  const zoom = d3.zoom()
    .scaleExtent([0.4, 4])
    .on('zoom', event => {
      zoomG.attr('transform', event.transform);
      svg.style('cursor', event.transform.k > 1 ? 'move' : 'grab');
    });

  svg.call(zoom)
     .on('dblclick.zoom', null); // disable double-click zoom

  // Click on SVG background closes popover
  svg.on('click', () => popover.classList.remove('is-visible'));

  // Adjacency map (for BFS)
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    adj.get(s)?.push(t);
    adj.get(t)?.push(s);
  });

  // ── Force simulation ────────────────────────────────────────
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(40).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-55))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => (d.tier === 'premium' ? 6 : d.tier === 'extra' ? 5 : 4.5) + 3))
    .alphaDecay(0.03);

  // ── Edges ───────────────────────────────────────────────────
  const linkG = zoomG.append('g').attr('class', 'network-links');
  const linkSel = linkG.selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', 'rgba(255,255,255,0.06)')
    .attr('stroke-width', 1);

  // ── Nodes ───────────────────────────────────────────────────
  const nodeG = zoomG.append('g').attr('class', 'network-nodes');
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // nodeColor now uses the mutable riskThreshold
  function getNodeColor(node) {
    if (node.intervened) return '#00E5FF';
    if (node.secondDegree) {
      const iv = INTERVENTIONS[currentIv];
      return iv ? iv.color + 'AA' : '#80AACC';
    }
    const effectiveRisk = Math.max(0, node.churnProbability - node.effectReduction);
    if (effectiveRisk >= riskThreshold)      return '#FF716C';
    if (effectiveRisk >= riskThreshold * 0.5) return '#F5A623';
    return '#4AF090';
  }

  const nodeSel = nodeG.selectAll('g')
    .data(nodes, d => d.id)
    .join('g')
    .attr('class', 'network-node')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .filter(event => !event.button && !event.ctrlKey)  // allow right-click to bubble
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      }));

  nodeSel.append('circle')
    .attr('r', d => d.tier === 'premium' ? 6 : d.tier === 'extra' ? 5 : 4.5)
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', 'rgba(0,0,0,0.4)')
    .attr('stroke-width', 0.5);

  // Hover tooltip + right-click popover + left-click intervene
  nodeSel
    .on('mousemove', (event, d) => {
      if (popover.classList.contains('is-visible')) return;
      const effectiveRisk = Math.max(0, d.churnProbability - d.effectReduction);
      tooltip.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;">${d.tier.charAt(0).toUpperCase() + d.tier.slice(1)} · ${d.segment}</div>
        <div style="color:var(--text-secondary);">Base churn: <strong>${(d.churnProbability * 100).toFixed(1)}%</strong></div>
        ${d.effectReduction > 0 ? `<div style="color:var(--ps-teal-light);">After intervention: <strong>${(effectiveRisk * 100).toFixed(1)}%</strong></div>` : ''}
        ${d.intervened   ? `<div style="color:#00E5FF;font-weight:600;">✓ Directly intervened</div>` : ''}
        ${d.secondDegree ? `<div style="color:var(--ps-purple-light);">◎ 2nd-degree effect</div>` : ''}
        <div style="color:var(--text-muted);font-size:10px;margin-top:4px;">Right-click for full details</div>`;
      const x = Math.min(event.clientX + 12, window.innerWidth  - 200);
      const y = Math.min(event.clientY + 12, window.innerHeight - 100);
      tooltip.style.left = `${x}px`;
      tooltip.style.top  = `${y}px`;
      tooltip.classList.add('is-visible');
    })
    .on('mouseleave', () => tooltip.classList.remove('is-visible'))
    .on('click', (event, d) => {
      event.stopPropagation();
      tooltip.classList.remove('is-visible');
      handleNodeClick(d.id);
    })
    .on('contextmenu', (event, d) => showPopover(event, d));

  // ── BFS propagation ─────────────────────────────────────────
  function bfsPropagate(startIds) {
    const iv = INTERVENTIONS[currentIv];

    nodes.forEach(n => {
      n.intervened      = false;
      n.secondDegree    = false;
      n.effectReduction = 0;
    });

    startIds.forEach(id => {
      const n = nodeMap.get(id);
      if (n) { n.intervened = true; n.effectReduction = iv.baseReduction; }
    });

    const visited = new Set(startIds);
    const queue   = [...startIds];
    let wave      = 0;

    function processWave() {
      if (queue.length === 0) { updateNodeColors(300); return; }
      wave++;
      const currentWave = [...queue];
      queue.length = 0;

      currentWave.forEach((id, qi) => {
        (adj.get(id) ?? []).forEach(nid => {
          if (!visited.has(nid)) {
            visited.add(nid);
            const neighbor = nodeMap.get(nid);
            if (neighbor && !neighbor.intervened) {
              neighbor.secondDegree    = true;
              neighbor.effectReduction = iv.networkSpread;
              queue.push(nid);

              const delayMs = wave * 200 + qi * 30;
              setTimeout(() => {
                if (!neighbor.x || !neighbor.y) return;
                const ring = zoomG.append('circle')
                  .attr('cx', neighbor.x).attr('cy', neighbor.y).attr('r', 8)
                  .attr('stroke', iv.color).attr('fill', 'none').attr('stroke-width', 1.5);
                setTimeout(() => ring.remove(), 700);
              }, delayMs);
            }
          }
        });
      });
    }

    setTimeout(processWave, 100);
  }

  function updateNodeColors(delay = 0) {
    nodeSel.selectAll('circle')
      .transition().duration(300).delay(delay)
      .attr('fill', d => getNodeColor(d));

    linkSel.attr('stroke', l => {
      const s  = typeof l.source === 'object' ? l.source.id : l.source;
      const t  = typeof l.target === 'object' ? l.target.id : l.target;
      const sn = nodeMap.get(s), tn = nodeMap.get(t);
      if (sn?.intervened && tn?.secondDegree) return 'rgba(0,229,255,0.4)';
      if (tn?.intervened && sn?.secondDegree) return 'rgba(0,229,255,0.4)';
      if (sn?.intervened && tn?.intervened)   return 'rgba(0,229,255,0.6)';
      return 'rgba(255,255,255,0.06)';
    });
  }

  function handleNodeClick(nodeId) {
    if (intervened.has(nodeId)) intervened.delete(nodeId);
    else intervened.add(nodeId);
    secondDegree.clear();
    bfsPropagate([...intervened]);

    const countDisplay = document.getElementById('network-selection-count');
    if (countDisplay) {
      countDisplay.textContent = intervened.size > 0
        ? `${intervened.size} node${intervened.size > 1 ? 's' : ''} selected`
        : 'Click nodes to intervene';
    }
  }

  // ── Clear button ───────────────────────────────────────────
  const clearBtn = document.getElementById('network-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      intervened.clear();
      secondDegree.clear();
      nodes.forEach(n => { n.intervened = n.secondDegree = false; n.effectReduction = 0; });
      updateNodeColors();
      const countDisplay = document.getElementById('network-selection-count');
      if (countDisplay) countDisplay.textContent = 'Click nodes to intervene';
    };
  }

  // ── Risk threshold slider ──────────────────────────────────
  const thresholdSlider = document.getElementById('network-threshold');
  const thresholdValue  = document.getElementById('network-threshold-value');
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', () => {
      riskThreshold = parseInt(thresholdSlider.value, 10) / 100;
      if (thresholdValue) thresholdValue.textContent = `${thresholdSlider.value}%`;
      updateNodeColors();
    });
  }

  // ── Cross-link: journey:highlight → pulse matching node ───
  function onJourneyHighlight(e) {
    const { userId } = e.detail;
    nodeSel.selectAll('circle')
      .transition().duration(120)
      .attr('r', d => {
        const base = d.tier === 'premium' ? 6 : d.tier === 'extra' ? 5 : 4.5;
        return userId !== null && d.id === userId ? base + 4 : base;
      })
      .attr('stroke', d => userId !== null && d.id === userId ? '#fff' : 'rgba(0,0,0,0.4)')
      .attr('stroke-width', d => userId !== null && d.id === userId ? 2 : 0.5);
  }
  document.addEventListener('journey:highlight', onJourneyHighlight);
  // Clean up when network is rebuilt
  containerEl._removeJourneyListener = () =>
    document.removeEventListener('journey:highlight', onJourneyHighlight);

  // ── Expose intervention update ────────────────────────────
  containerEl._updateNetworkIntervention = (iv) => {
    currentIv = iv;
    if (intervened.size > 0) bfsPropagate([...intervened]);
    else updateNodeColors();
  };

  // ── Simulation tick ─────────────────────────────────────────
  simulation.on('tick', () => {
    linkSel
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel.attr('transform', d => {
      d.x = Math.max(10, Math.min(W - 10, d.x));
      d.y = Math.max(10, Math.min(H - 10, d.y));
      return `translate(${d.x},${d.y})`;
    });
  });

  simulation.alpha(1).restart();
  setTimeout(() => simulation.alphaTarget(0), 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

function buildSkeleton() {
  const interventionBtns = Object.entries(INTERVENTIONS).map(([key, iv], i) => `
    <button class="intervention-btn${i === 0 ? ' is-active' : ''}"
            data-intervention="${key}"
            aria-pressed="${i === 0}"
            title="${iv.description}">
      <span class="btn-dot"></span>
      ${iv.icon} ${iv.label}
    </button>`).join('');

  return `
    <section class="narrative-section causal-section" id="causal-intervention">

      <div class="bg-orb bg-orb--teal"   style="top:5%;    right:-8%;  opacity:0.10; width:400px; height:400px;"></div>
      <div class="bg-orb bg-orb--purple" style="bottom:8%; left:-10%;  opacity:0.10; width:350px; height:350px;"></div>

      <div class="container" style="position:relative; z-index:10; width:100%;">

        <!-- Section heading + intervention selector -->
        <header class="section-header transition-fade">
          <p class="section-label">Causal Reasoning</p>
          <h2 class="section-title">Intervention & Counterfactual</h2>
          <p class="section-subtitle">
            What would churn look like <em>if</em> we had intervened?
            Select a treatment to see counterfactual curves, population shift, and social contagion.
          </p>
        </header>

        <!-- KPI stat bar (matches stitch design) -->
        <div class="kpi-bar transition-fade" style="transition-delay:40ms;">
          <div class="kpi-card">
            <div class="kpi-card__label">Prediction Accuracy</div>
            <div class="kpi-card__value">98.4<span style="font-size:0.55em;color:var(--text-secondary);">%</span></div>
            <div class="kpi-card__sub">Gradient Boost · ROC-AUC</div>
            <div class="kpi-card__accent-bar" style="width:98.4%;background:linear-gradient(90deg,var(--ps-blue),var(--ps-teal));"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card__label">Targeting Efficiency</div>
            <div class="kpi-card__value">1.42<span style="font-size:0.55em;color:var(--text-secondary);">×</span></div>
            <div class="kpi-card__sub" style="color:var(--ps-teal-light);">+12% vs Baseline</div>
            <div class="kpi-card__accent-bar" style="width:70%;background:var(--ps-teal);"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card__label">Churn Reduction (Sim)</div>
            <div class="kpi-card__value" style="color:#FF716C;">−22.5<span style="font-size:0.55em;">%</span></div>
            <div class="kpi-card__sub" style="color:#FF716C;">Projected Q4</div>
            <div class="kpi-card__accent-bar" style="width:22.5%;background:#FF716C;"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card__label">LTV Uplift</div>
            <div class="kpi-card__value">$14.2<span style="font-size:0.55em;color:var(--text-secondary);">M</span></div>
            <div class="kpi-card__sub">Aggregated Segment</div>
            <div class="kpi-card__accent-bar" style="width:60%;background:var(--ps-purple);"></div>
          </div>
        </div>

        <!-- Global intervention selector -->
        <div class="intervention-selector transition-fade" id="intervention-selector"
             style="justify-content:center; margin-bottom:var(--sp-8); transition-delay:80ms;">
          ${interventionBtns}
        </div>

        <div class="causal-grid">

          <!-- A — Counterfactual A/B curves (full width) -->
          <div class="causal-card causal-card--counterfactual transition-fade" style="transition-delay:120ms;">
            <div class="causal-card__header">
              <div>
                <p class="causal-card__title">Counterfactual Churn Curves</p>
                <p class="causal-card__subtitle">
                  Control (dashed) vs treated (solid). Shaded gap = estimated churn reduction.
                  Bucket average across users eligible for the selected intervention.
                </p>
              </div>
            </div>
            <div id="viz-counterfactual"></div>
            <div class="cf-label-group">
              <div class="cf-label-item">
                <div class="cf-label-swatch" style="background:rgba(255,113,108,0.8);border-top:2px dashed rgba(255,113,108,0.8);"></div>
                Without intervention
              </div>
              <div class="cf-label-item">
                <div class="cf-label-swatch" id="cf-trt-swatch" style="background:#00AAFF;"></div>
                With intervention
              </div>
              <div class="cf-gap-stat">
                <span class="cf-gap-value" id="cf-gap-value">—</span>
                <span class="cf-gap-label" id="cf-gap-label">avg churn reduction</span>
              </div>
            </div>
          </div>

          <!-- B — Distribution shift -->
          <div class="causal-card causal-card--distribution transition-fade" style="transition-delay:200ms;">
            <div class="causal-card__header">
              <div>
                <p class="causal-card__title">Population Distribution Shift</p>
                <p class="causal-card__subtitle">
                  KDE overlay of churn probability — before (dashed) vs after (solid).
                  Curve morphs left on intervention.
                </p>
              </div>
            </div>
            <div id="viz-distribution-shift-svg"></div>
            <div class="dist-shift-readout" id="viz-distribution-shift">
              <span class="dist-shift-count">—</span>
              <span class="dist-shift-label">users moved below threshold</span>
            </div>
            <div class="dist-legend" id="dist-legend">
              <div class="dist-legend-item">
                <div class="dist-legend-swatch" style="background:rgba(255,113,108,0.8);"></div>
                Before intervention
              </div>
              <div class="dist-legend-item">
                <div class="dist-legend-swatch" id="dist-after-swatch" style="background:#00AAFF;"></div>
                After intervention
              </div>
            </div>
          </div>

          <!-- C — Network graph -->
          <div class="causal-card causal-card--network transition-fade" style="transition-delay:280ms;">
            <div class="causal-card__header">
              <div>
                <p class="causal-card__title">Network Propagation</p>
                <p class="causal-card__subtitle">
                  Click nodes to intervene. BFS animates spread through social connections.
                  Scroll to zoom · drag canvas to pan · right-click node for details.
                </p>
              </div>
              <div class="network-controls">
                <button id="network-clear-btn" class="network-btn">✕ Clear</button>
                <span id="network-selection-count" class="network-selection-count">Click nodes to intervene</span>
              </div>
            </div>
            <div class="threshold-row">
              <span class="threshold-row__label">Risk threshold</span>
              <input type="range" class="threshold-slider" id="network-threshold"
                     min="5" max="60" value="35" step="1">
              <span class="threshold-value" id="network-threshold-value">35%</span>
            </div>
            <div style="font-size:10px; color:var(--text-muted); font-style:italic; letter-spacing:0.03em; margin-bottom:var(--sp-2); margin-top:calc(-1 * var(--sp-2));">Scroll to zoom · drag to pan · right-click node for details</div>
            <div id="viz-network"></div>
            <div class="network-legend">
              <div class="network-legend-item">
                <div class="network-legend-dot" style="background:#4AF090;"></div>
                Safe (&lt;18%)
              </div>
              <div class="network-legend-item">
                <div class="network-legend-dot" style="background:#F5A623;"></div>
                At-risk (18–35%)
              </div>
              <div class="network-legend-item">
                <div class="network-legend-dot" style="background:#FF716C;"></div>
                High-risk (&gt;35%)
              </div>
              <div class="network-legend-item">
                <div class="network-legend-dot" style="background:#00E5FF;"></div>
                Intervened
              </div>
              <div class="network-legend-item">
                <div class="network-legend-dot" style="background:rgba(168,85,247,0.7);"></div>
                2nd-degree effect
              </div>
            </div>

            <!-- Intervention Ripple Summary (matches stitch) -->
            <div class="ripple-summary" id="ripple-summary">
              <div class="ripple-summary__label">⬥ Intervention Ripple Summary</div>
              <p class="ripple-summary__text">
                Targeting high-influence Hub users stabilises the broader ecosystem of Fringes.
                Click nodes above to simulate — predicted churn reduction propagates to 2nd-degree connections.
              </p>
              <div class="ripple-stats">
                <div class="ripple-stat">
                  <span class="ripple-stat__value" id="ripple-roi">4.2×</span>
                  <span class="ripple-stat__label">ROI Multiplier</span>
                </div>
                <div class="ripple-stat">
                  <span class="ripple-stat__value" id="ripple-nodes">312</span>
                  <span class="ripple-stat__label">Stabilised Nodes</span>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /causal-grid -->
      </div><!-- /container -->
    </section>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function renderCausalSection(appEl) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildSkeleton();
  const sectionEl = wrapper.firstElementChild;
  appEl.appendChild(sectionEl);

  let activeIntervention = 'upgrade-offer';

  // ── Render all three charts ────────────────────────────────────────────────
  const cfContainer    = sectionEl.querySelector('#viz-counterfactual');
  const distSvgEl      = sectionEl.querySelector('#viz-distribution-shift-svg');
  const distReadoutEl  = sectionEl.querySelector('#viz-distribution-shift');
  const networkEl      = sectionEl.querySelector('#viz-network');

  function updateAll(intervention) {
    activeIntervention = intervention;
    const iv = INTERVENTIONS[intervention];

    // Update counterfactual swatch color
    const cfSwatch = sectionEl.querySelector('#cf-trt-swatch');
    if (cfSwatch) cfSwatch.style.background = iv.color;

    const distAfterSwatch = sectionEl.querySelector('#dist-after-swatch');
    if (distAfterSwatch) distAfterSwatch.style.background = iv.color;

    // Re-render counterfactual
    renderCounterfactual(cfContainer, intervention);

    // Re-render / morph distribution
    renderDistributionShift(sectionEl, distSvgEl, distReadoutEl, intervention);

    // Update network intervention (doesn't rebuild the graph)
    if (networkEl._updateNetworkIntervention) {
      networkEl._updateNetworkIntervention(intervention);
    }
  }

  // Initial render: use rAF to guarantee one paint has happened (layout ready)
  requestAnimationFrame(() => {
    updateAll(activeIntervention);
  });

  // Network graph: defer until container has a real width (ResizeObserver fires after layout)
  let networkBuilt = false;
  const networkRO = new ResizeObserver(entries => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      if (w > 0 && !networkBuilt) {
        networkBuilt = true;
        networkRO.disconnect();
        renderNetwork(networkEl, activeIntervention);
      }
    }
  });
  networkRO.observe(networkEl);

  // ── Intervention selector ──────────────────────────────────────────────────
  const selector = sectionEl.querySelector('#intervention-selector');
  selector.addEventListener('click', (e) => {
    const btn = e.target.closest('.intervention-btn');
    if (!btn) return;
    const iv = btn.dataset.intervention;
    if (iv === activeIntervention) return;

    // Toggle active state
    selector.querySelectorAll('.intervention-btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });

    updateAll(iv);
  });

  // ── Responsive redraw (counterfactual + distribution only) ────────────────
  const ro = new ResizeObserver(() => {
    renderCounterfactual(cfContainer, activeIntervention);
    renderDistributionShift(sectionEl, distSvgEl, distReadoutEl, activeIntervention);
  });
  ro.observe(cfContainer);

  // ── Entrance animations ───────────────────────────────────────────────────
  const targets = sectionEl.querySelectorAll('.transition-fade');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.075 });
  targets.forEach(el => io.observe(el));

  return sectionEl;
}
