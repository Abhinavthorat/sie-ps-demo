/**
 * modules/viz-user-journey.js — Task 7
 *
 * Swimlane timeline: 4 parallel horizontal lanes showing the full lifecycle
 * of a single PS+ subscriber over 18 months.
 *
 * Lanes:
 *   0. Engagement Activity   — area chart, sessions/week, amber valley shading
 *   1. Perceived Value        — stepped line, annotation flags at key events
 *   2. Churn Risk             — filled area, green→amber→red gradient, threshold pulse
 *   3. Intervention Events    — dot-plot, click to expand detail card
 *
 * Features:
 *   • 10-persona dropdown — smooth D3 transitions on switch (no hard redraw)
 *   • Counterfactual toggle — dashed overlay + shaded gap on churn lane
 *   • Cross-link: hovering chart dispatches CustomEvent → highlights network node
 */

import * as d3 from 'd3';
import { scoreAtMonth } from '../lib/churn-score.js';

const MONTHS = 18;
const IV_THRESHOLD = 0.65;   // intervention threshold on churn lane

const IV_COLORS = {
  'upgrade-offer': '#00AAFF',
  'price-lock':    '#F5A623',
  'content-drip':  '#A855F7',
};
const IV_LABEL = {
  'upgrade-offer': 'Upgrade Offer',
  'price-lock':    'Price Lock',
  'content-drip':  'Content Drip',
};

// Lane pixel heights
const LANE_H  = { eng: 95, val: 95, churn: 125, events: 50 };
const LANE_GAP = 10;
const LANE_TOPS = {
  eng:    0,
  val:    LANE_H.eng + LANE_GAP,
  churn:  LANE_H.eng + LANE_GAP + LANE_H.val + LANE_GAP,
  events: LANE_H.eng + LANE_GAP + LANE_H.val + LANE_GAP + LANE_H.churn + LANE_GAP,
};
const TOTAL_iH = LANE_TOPS.events + LANE_H.events;   // 480
const MARGIN   = { top: 24, right: 24, bottom: 44, left: 138 };

// ── Personas ───────────────────────────────────────────────────────────────────

const PERSONAS = [
  {
    id: 'casual-essential-dropout',
    label: 'Casual Essential — Early drop-off',
    tier: 'essential', segment: 'casual', userId: 4,
    baseParams: { tier: 'essential', segment: 'casual', sessionsPerWeek: 1.8, titlesPlayed: 2 },
    sessionsMod: m => m < 2 ? 1.0 : m < 5 ? Math.max(0.18, 1 - (m - 2) * 0.28) : 0.25 + 0.06 * Math.sin(m),
    valueMod:   m => m >= 2 && m <= 4 ? -22 : m === 8 ? 8 : 0,
    annotations: [{ month: 3, label: 'Catalog gap — month 3', yAnchor: 'high' }],
    interventions: [
      { month: 3, type: 'upgrade-offer', effect: 0.09,
        label: IV_LABEL['upgrade-offer'],
        desc: 'Tier upgrade incentive: first month of Extra free. Reduced churn risk by ~9%.' },
      { month: 8, type: 'content-drip',  effect: 0.06,
        label: IV_LABEL['content-drip'],
        desc: 'Personalised weekly game recommendations. Boosted engagement and extended retention.' },
    ],
  },
  {
    id: 'hardcore-premium-stable',
    label: 'Hardcore Premium — Stable',
    tier: 'premium', segment: 'hardcore', userId: 1,
    baseParams: { tier: 'premium', segment: 'hardcore', sessionsPerWeek: 8.5, titlesPlayed: 7 },
    sessionsMod: m => 0.95 + 0.07 * Math.sin(m * 0.7 + 0.5),
    valueMod:   m => m === 5 ? 8 : m === 12 ? 9 : 0,
    annotations: [{ month: 5, label: 'Major release — month 5', yAnchor: 'high' }],
    interventions: [],
  },
  {
    id: 'midcore-extra-price-sensitive',
    label: 'Mid-core Extra — Price sensitive',
    tier: 'extra', segment: 'mid-core', userId: 8,
    baseParams: { tier: 'extra', segment: 'mid-core', sessionsPerWeek: 4.2, titlesPlayed: 4 },
    sessionsMod: m => 1.0 - 0.1 * Math.sin(m * 0.5) + (m >= 10 && m <= 12 ? -0.22 : 0),
    valueMod:   m => m >= 9 && m <= 11 ? -14 : 0,
    annotations: [{ month: 10, label: 'Renewal anxiety — month 10', yAnchor: 'low' }],
    interventions: [
      { month: 6,  type: 'price-lock', effect: 0.07,
        label: IV_LABEL['price-lock'],
        desc: '12-month price freeze offered. Reduced renewal-period churn risk by 7%.' },
      { month: 10, type: 'price-lock', effect: 0.10,
        label: `${IV_LABEL['price-lock']} Renewal`,
        desc: 'Price lock extended at renewal. Strongest single intervention in this journey.' },
    ],
  },
  {
    id: 'casual-extra-recovery',
    label: 'Casual Extra — Recovery arc',
    tier: 'extra', segment: 'casual', userId: 15,
    baseParams: { tier: 'extra', segment: 'casual', sessionsPerWeek: 3.0, titlesPlayed: 3 },
    sessionsMod: m => m < 3 ? 1.0 : m < 6 ? Math.max(0.28, 1 - (m - 3) * 0.24) : Math.min(1.0, 0.35 + (m - 6) * 0.09),
    valueMod:   m => m >= 3 && m <= 5 ? -18 : m === 7 ? 13 : m === 13 ? 10 : 0,
    annotations: [
      { month: 4, label: 'Content drought — month 4', yAnchor: 'low' },
      { month: 7, label: 'Game release spike',        yAnchor: 'high' },
    ],
    interventions: [
      { month: 4, type: 'content-drip', effect: 0.08,
        label: IV_LABEL['content-drip'],
        desc: 'Personalised recommendations during content drought. Arrested engagement decline.' },
      { month: 7, type: 'upgrade-offer', effect: 0.06,
        label: IV_LABEL['upgrade-offer'],
        desc: 'Upgrade nudge coinciding with major release. Reinforced recovery trend.' },
    ],
  },
  {
    id: 'midcore-essential-threshold',
    label: 'Mid-core Essential — At threshold',
    tier: 'essential', segment: 'mid-core', userId: 22,
    baseParams: { tier: 'essential', segment: 'mid-core', sessionsPerWeek: 3.5, titlesPlayed: 3 },
    sessionsMod: m => 0.85 + 0.18 * Math.sin(m * 0.9 + 0.3),
    valueMod:   m => m >= 6 && m <= 8 ? -10 : 0,
    annotations: [{ month: 7, label: 'Value plateau — month 7', yAnchor: 'low' }],
    interventions: [
      { month: 5,  type: 'upgrade-offer', effect: 0.08, label: IV_LABEL['upgrade-offer'],
        desc: 'Tier upgrade incentive. Keeps user just below the 65% intervention threshold.' },
      { month: 9,  type: 'content-drip',  effect: 0.05, label: IV_LABEL['content-drip'],
        desc: 'Weekly curated list. Maintained engagement through value plateau period.' },
      { month: 13, type: 'price-lock',    effect: 0.06, label: IV_LABEL['price-lock'],
        desc: 'Price stability guarantee ahead of renewal. Prevented renewal-spike churn.' },
    ],
  },
  {
    id: 'hardcore-extra-upgrader',
    label: 'Hardcore Extra — Upgrade path',
    tier: 'extra', segment: 'hardcore', userId: 30,
    baseParams: { tier: 'extra', segment: 'hardcore', sessionsPerWeek: 7.0, titlesPlayed: 6 },
    sessionsMod: m => 1.0 + 0.06 * Math.sin(m * 0.6),
    valueMod:   m => m < 4 ? -8 : m === 4 ? 22 : m > 4 ? 6 : 0,
    annotations: [{ month: 4, label: 'Tier upgrade accepted', yAnchor: 'high' }],
    interventions: [
      { month: 3,  type: 'upgrade-offer', effect: 0.14, label: IV_LABEL['upgrade-offer'],
        desc: 'Premium upgrade incentive accepted at month 4. PV jumped +22 pts, churn collapsed.' },
      { month: 10, type: 'content-drip',  effect: 0.05, label: IV_LABEL['content-drip'],
        desc: 'Post-upgrade engagement sustainer. Maintains high discovery cadence.' },
    ],
  },
  {
    id: 'casual-premium-churned',
    label: 'Casual Premium — Churned (month 9)',
    tier: 'premium', segment: 'casual', userId: 41,
    baseParams: { tier: 'premium', segment: 'casual', sessionsPerWeek: 2.0, titlesPlayed: 2 },
    sessionsMod: m => m < 4 ? 1.0 : m < 9 ? Math.max(0.12, 1 - (m - 4) * 0.18) : 0.08,
    valueMod:   m => m >= 5 ? Math.max(-40, -20 - (m - 5) * 4) : 0,
    annotations: [
      { month: 6, label: 'Value collapse — month 6', yAnchor: 'low' },
      { month: 9, label: '⚠ Churned',                yAnchor: 'high' },
    ],
    interventions: [
      { month: 5, type: 'content-drip', effect: 0.06, label: IV_LABEL['content-drip'],
        desc: 'Recommendations deployed too late — engagement already declining sharply.' },
      { month: 7, type: 'price-lock',   effect: 0.04, label: IV_LABEL['price-lock'],
        desc: 'Price freeze offered but insufficient to reverse value collapse. User churned month 9.' },
    ],
    churned: true, churnMonth: 9,
  },
  {
    id: 'midcore-premium-loyal',
    label: 'Mid-core Premium — Long-term loyal',
    tier: 'premium', segment: 'mid-core', userId: 50,
    baseParams: { tier: 'premium', segment: 'mid-core', sessionsPerWeek: 5.5, titlesPlayed: 5 },
    sessionsMod: m => 0.90 + 0.12 * Math.sin(m * 0.5 + 1.0),
    valueMod:   m => m === 3 ? 8 : m === 9 ? 11 : m === 15 ? 7 : 0,
    annotations: [{ month: 9, label: 'Catalogue refresh — month 9', yAnchor: 'high' }],
    interventions: [
      { month: 3, type: 'content-drip', effect: 0.04, label: IV_LABEL['content-drip'],
        desc: 'Early engagement sustainer. Maintains high discovery rate for a loyal user.' },
    ],
  },
  {
    id: 'casual-essential-saved',
    label: 'Casual Essential — Intervention success',
    tier: 'essential', segment: 'casual', userId: 62,
    baseParams: { tier: 'essential', segment: 'casual', sessionsPerWeek: 1.2, titlesPlayed: 1 },
    sessionsMod: m => m < 2 ? 0.7 : m < 4 ? 0.28 : m < 8 ? 0.4 : 0.55 + 0.06 * Math.sin(m),
    valueMod:   m => m >= 1 && m <= 3 ? -26 : 0,
    annotations: [{ month: 2, label: 'Critical risk zone', yAnchor: 'low' }],
    interventions: [
      { month: 2, type: 'upgrade-offer', effect: 0.18, label: IV_LABEL['upgrade-offer'],
        desc: 'Emergency upgrade offer at peak risk. Largest single effect — pulled risk from ~72% to ~54%.' },
      { month: 5, type: 'content-drip',  effect: 0.10, label: IV_LABEL['content-drip'],
        desc: 'Sustaining recommendations post-upgrade. Compounded the initial intervention gain.' },
    ],
  },
  {
    id: 'hardcore-essential-mismatch',
    label: 'Hardcore Essential — Tier mismatch',
    tier: 'essential', segment: 'hardcore', userId: 75,
    baseParams: { tier: 'essential', segment: 'hardcore', sessionsPerWeek: 7.5, titlesPlayed: 6 },
    sessionsMod: m => 1.0 - 0.05 * Math.sin(m * 0.4),
    valueMod:   m => -15 + (m > 5 ? 4 : 0),
    annotations: [{ month: 0, label: 'Tier mismatch at sign-up', yAnchor: 'low' }],
    interventions: [
      { month: 5, type: 'price-lock',    effect: 0.05, label: IV_LABEL['price-lock'],
        desc: 'Price freeze attempted but root cause (tier mismatch) not addressed. Marginal effect.' },
      { month: 9, type: 'upgrade-offer', effect: 0.15, label: IV_LABEL['upgrade-offer'],
        desc: 'Premium upgrade offered at month 9. Significant risk reduction as value gap closed.' },
    ],
  },
];

// ── Data generation ────────────────────────────────────────────────────────────

function generateData(persona) {
  const pts = [];
  for (let m = 0; m <= MONTHS; m++) {
    const sessions = Math.max(0.1, persona.baseParams.sessionsPerWeek * persona.sessionsMod(m));
    const base     = scoreAtMonth({ ...persona.baseParams, sessionsPerWeek: sessions }, m);
    const pv       = Math.min(100, Math.max(0, base.perceivedValue + persona.valueMod(m)));
    const churnCF  = base.churnProbability;   // counterfactual — no interventions

    // Actual: apply intervention effects, tapering over time
    const totalEffect = (persona.interventions ?? []).reduce((sum, iv) => {
      if (iv.month > m) return sum;
      const age   = m - iv.month;
      const taper = age === 0 ? 1.0
                  : age <= 3  ? 1 - age * 0.12
                  : Math.max(0.3, 1 - age * 0.07);
      return sum + iv.effect * taper;
    }, 0);

    let churnActual = Math.max(0.01, Math.min(0.99, churnCF - totalEffect));
    if (persona.churned && m >= persona.churnMonth) churnActual = 0.97;

    pts.push({ month: m, sessions, perceivedValue: pv, churnRisk: churnActual, churnRiskCF: churnCF });
  }
  return pts;
}

// ── Tooltip helper ─────────────────────────────────────────────────────────────

function makeTooltip() {
  let el = document.getElementById('journey-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'journey-tooltip';
    el.className = 'viz-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

// ── Chart factory ──────────────────────────────────────────────────────────────

export function createJourneyChart(containerEl, ivCardEl) {
  const tooltip = makeTooltip();
  let currentIdx = 0;
  let showCF     = false;
  let activeIvDot = null;

  // D3 element references (rebuilt on resize, updated on persona switch)
  let svgSel, gSel;
  let xScale, yEng, yVal, yChurn;
  let engAreaPath, engLinePath, engValleyPath;
  let valLinePath;
  let churnAreaPath, churnLinePath, churnCfAreaPath, churnCfLinePath;
  let churnThresholdLine;
  let hoverLine;
  let iW;

  // Line/area generators (rebuilt on resize)
  let lineEng, areaEng;
  let lineVal;
  let lineChurn, areaChurn, areaChurnCf, lineChurnCf;

  function rebuild() {
    containerEl.innerHTML = '';
    activeIvDot = null;

    const persona = PERSONAS[currentIdx];
    const data    = generateData(persona);

    const W   = containerEl.clientWidth || 900;
    iW        = W - MARGIN.left - MARGIN.right;
    const H   = TOTAL_iH + MARGIN.top + MARGIN.bottom;

    xScale = d3.scaleLinear().domain([0, MONTHS]).range([0, iW]);
    yEng   = d3.scaleLinear().domain([0, d3.max(data, d => d.sessions) * 1.25]).range([LANE_H.eng, 0]);
    yVal   = d3.scaleLinear().domain([0, 100]).range([LANE_H.val, 0]);
    yChurn = d3.scaleLinear().domain([0, 1]).range([LANE_H.churn, 0]);

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('class', 'viz-canvas')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%');
    svgSel = svg;

    const defs = svg.append('defs');

    // Churn fill gradient (green → amber → red, bottom → top)
    const churnGrad = defs.append('linearGradient')
      .attr('id', 'journey-churn-grad')
      .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
    churnGrad.append('stop').attr('offset', '0%')
      .attr('stop-color', '#FF716C').attr('stop-opacity', 0.50);
    churnGrad.append('stop').attr('offset', `${Math.round((1 - IV_THRESHOLD) * 100)}%`)
      .attr('stop-color', '#F5A623').attr('stop-opacity', 0.35);
    churnGrad.append('stop').attr('offset', '100%')
      .attr('stop-color', '#4AF090').attr('stop-opacity', 0.25);

    // Engagement gradient
    const engGrad = defs.append('linearGradient')
      .attr('id', 'journey-eng-grad')
      .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
    engGrad.append('stop').attr('offset', '0%')
      .attr('stop-color', '#00B8D4').attr('stop-opacity', 0.28);
    engGrad.append('stop').attr('offset', '100%')
      .attr('stop-color', '#00B8D4').attr('stop-opacity', 0.04);

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    gSel = g;

    // Shared x-axis (below events lane)
    const xAxisG = g.append('g')
      .attr('class', 'viz-axis viz-axis--x')
      .attr('transform', `translate(0,${LANE_TOPS.events + LANE_H.events})`);
    xAxisG.call(
      d3.axisBottom(xScale)
        .ticks(MONTHS)
        .tickFormat(m => m % 3 === 0 ? `${m}mo` : '')
    );
    xAxisG.append('text')
      .attr('x', iW / 2).attr('y', 36)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
      .style('font-size', '10px').style('letter-spacing', '0.07em')
      .style('text-transform', 'uppercase').text('Subscription Month →');

    // ── Lane backgrounds + separators ──────────────────────────────────────────
    const LANE_DEFS = [
      { key: 'eng',    label: 'Engagement',      top: LANE_TOPS.eng,    h: LANE_H.eng    },
      { key: 'val',    label: 'Perceived Value',  top: LANE_TOPS.val,    h: LANE_H.val    },
      { key: 'churn',  label: 'Churn Risk',       top: LANE_TOPS.churn,  h: LANE_H.churn  },
      { key: 'events', label: 'Interventions',    top: LANE_TOPS.events, h: LANE_H.events },
    ];

    LANE_DEFS.forEach(({ key, label, top, h }, i) => {
      g.append('rect')
        .attr('class', 'journey-lane-bg')
        .attr('x', 0).attr('y', top).attr('width', iW).attr('height', h)
        .attr('rx', 4)
        .attr('fill', i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.01)');

      g.append('text')
        .attr('class', 'journey-lane-label')
        .attr('x', -14).attr('y', top + h / 2)
        .text(label);

      if (i < LANE_DEFS.length - 1) {
        g.append('line')
          .attr('class', 'journey-lane-separator')
          .attr('x1', 0).attr('x2', iW)
          .attr('y1', top + h + LANE_GAP / 2)
          .attr('y2', top + h + LANE_GAP / 2);
      }
    });

    // ── Lane y-axes ────────────────────────────────────────────────────────────
    // Engagement
    const engAxisG = g.append('g').attr('class', 'viz-axis viz-axis--y')
      .attr('transform', `translate(0,${LANE_TOPS.eng})`);
    engAxisG.call(d3.axisLeft(yEng).ticks(3).tickFormat(d => `${d.toFixed(1)}×`));
    engAxisG.selectAll('.tick text').attr('dx', '-4');

    // Perceived value
    const valAxisG = g.append('g').attr('class', 'viz-axis viz-axis--y')
      .attr('transform', `translate(0,${LANE_TOPS.val})`);
    valAxisG.call(d3.axisLeft(yVal).ticks(3));
    valAxisG.selectAll('.tick text').attr('dx', '-4');

    // Churn risk
    const churnAxisG = g.append('g').attr('class', 'viz-axis viz-axis--y')
      .attr('transform', `translate(0,${LANE_TOPS.churn})`);
    churnAxisG.call(d3.axisLeft(yChurn).ticks(4).tickFormat(d => `${(d * 100).toFixed(0)}%`));
    churnAxisG.selectAll('.tick text').attr('dx', '-4');

    // ── Line / area generators ─────────────────────────────────────────────────
    lineEng  = d3.line().x(d => xScale(d.month)).y(d => yEng(d.sessions)).curve(d3.curveCatmullRom);
    areaEng  = d3.area().x(d => xScale(d.month)).y0(LANE_H.eng).y1(d => yEng(d.sessions)).curve(d3.curveCatmullRom);

    lineVal  = d3.line().x(d => xScale(d.month)).y(d => yVal(d.perceivedValue)).curve(d3.curveStepAfter);

    lineChurn    = d3.line().x(d => xScale(d.month)).y(d => yChurn(d.churnRisk)).curve(d3.curveCatmullRom);
    areaChurn    = d3.area().x(d => xScale(d.month)).y0(LANE_H.churn).y1(d => yChurn(d.churnRisk)).curve(d3.curveCatmullRom);
    lineChurnCf  = d3.line().x(d => xScale(d.month)).y(d => yChurn(d.churnRiskCF)).curve(d3.curveCatmullRom);
    areaChurnCf  = d3.area()
      .x(d => xScale(d.month))
      .y0(d => yChurn(d.churnRisk))
      .y1(d => yChurn(d.churnRiskCF))
      .curve(d3.curveCatmullRom);

    // ── Engagement lane ────────────────────────────────────────────────────────
    const engG = g.append('g').attr('transform', `translate(0,${LANE_TOPS.eng})`);

    // Valley shading (sessions below mean - 0.4 stdev)
    const sessionMean  = d3.mean(data, d => d.sessions);
    const sessionStdev = d3.deviation(data, d => d.sessions);
    const valleyThresh = sessionMean - 0.4 * sessionStdev;

    engValleyPath = engG.append('path')
      .attr('class', 'journey-eng-valley')
      .datum(data)
      .attr('d', d3.area()
        .x(d => xScale(d.month))
        .y0(LANE_H.eng)
        .y1(d => d.sessions < valleyThresh ? yEng(d.sessions) : LANE_H.eng)
        .curve(d3.curveCatmullRom)
      );

    engAreaPath = engG.append('path')
      .attr('fill', 'url(#journey-eng-grad)')
      .datum(data).attr('d', areaEng);

    engLinePath = engG.append('path')
      .attr('class', 'journey-eng-line')
      .datum(data).attr('d', lineEng);

    // ── Perceived value lane ───────────────────────────────────────────────────
    const valG = g.append('g').attr('transform', `translate(0,${LANE_TOPS.val})`);

    valLinePath = valG.append('path')
      .attr('class', 'journey-val-line')
      .datum(data).attr('d', lineVal);

    // Annotations (flags)
    (persona.annotations ?? []).forEach(ann => {
      const annPt  = data.find(d => d.month === ann.month) ?? data[ann.month] ?? data[0];
      const ax     = xScale(ann.month);
      const ay     = yVal(annPt.perceivedValue);
      const labelY = ann.yAnchor === 'high' ? Math.min(ay - 14, 12) : Math.max(ay + 14, LANE_H.val - 10);
      const stemY2 = ann.yAnchor === 'high' ? ay - 2 : ay + 2;

      valG.append('line').attr('class', 'journey-flag-stem')
        .attr('x1', ax).attr('x2', ax).attr('y1', labelY).attr('y2', stemY2);
      valG.append('text').attr('class', 'journey-flag-label')
        .attr('x', ax + 4).attr('y', labelY)
        .attr('dominant-baseline', ann.yAnchor === 'high' ? 'auto' : 'hanging')
        .text(ann.label);
    });

    // ── Churn risk lane ────────────────────────────────────────────────────────
    const churnG = g.append('g').attr('transform', `translate(0,${LANE_TOPS.churn})`);

    // CF area (hidden until toggle on)
    churnCfAreaPath = churnG.append('path')
      .attr('class', 'journey-cf-area')
      .datum(data).attr('d', areaChurnCf)
      .attr('opacity', showCF ? 1 : 0);

    // Actual filled area
    churnAreaPath = churnG.append('path')
      .attr('fill', 'url(#journey-churn-grad)')
      .datum(data).attr('d', areaChurn);

    // Actual stroke line
    churnLinePath = churnG.append('path')
      .attr('class', 'journey-churn-line')
      .datum(data).attr('d', lineChurn);

    // CF dashed line (hidden until toggle on)
    churnCfLinePath = churnG.append('path')
      .attr('class', 'journey-cf-line')
      .datum(data).attr('d', lineChurnCf)
      .attr('opacity', showCF ? 1 : 0);

    // CF gap annotation (hidden until toggle)
    const cfAnnotG = churnG.append('g').attr('id', 'cf-annot-g').attr('opacity', showCF ? 1 : 0);
    _buildCfAnnotation(cfAnnotG, data);

    // Threshold line
    const ty = yChurn(IV_THRESHOLD);
    churnThresholdLine = churnG.append('line')
      .attr('class', 'journey-threshold-line')
      .attr('x1', 0).attr('x2', iW).attr('y1', ty).attr('y2', ty);

    churnG.append('text').attr('class', 'journey-threshold-label')
      .attr('x', iW - 4).attr('y', ty - 5)
      .attr('text-anchor', 'end')
      .text(`${(IV_THRESHOLD * 100).toFixed(0)}% intervention threshold`);

    // Churned persona marker
    if (persona.churned) {
      const cx = xScale(persona.churnMonth);
      churnG.append('line').attr('class', 'journey-churn-marker')
        .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', LANE_H.churn);
      churnG.append('text').attr('class', 'journey-threshold-label')
        .attr('x', cx + 4).attr('y', 14)
        .attr('fill', '#FF716C')
        .text('Churned');
    }

    // ── Intervention events lane ───────────────────────────────────────────────
    const eventsG = g.append('g').attr('transform', `translate(0,${LANE_TOPS.events})`);
    _buildIvDots(eventsG, persona, data);

    // ── Hover overlay (covers all lanes, shows vertical line + tooltip) ────────
    hoverLine = g.append('line')
      .attr('class', 'journey-hover-line')
      .attr('y1', 0).attr('y2', LANE_TOPS.events + LANE_H.events);

    g.append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', iW).attr('height', LANE_TOPS.events + LANE_H.events)
      .attr('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const month = Math.round(xScale.invert(mx));
        const clamped = Math.max(0, Math.min(MONTHS, month));
        const pt = data[clamped];
        if (!pt) return;

        hoverLine.attr('x1', xScale(clamped)).attr('x2', xScale(clamped))
          .classed('is-visible', true);

        const pName  = PERSONAS[currentIdx];
        tooltip.innerHTML = `
          <div class="viz-tooltip__title">Month ${clamped}</div>
          <div class="viz-tooltip__row"><span>Sessions/wk</span><strong>${pt.sessions.toFixed(1)}</strong></div>
          <div class="viz-tooltip__row"><span>Perceived value</span><strong>${pt.perceivedValue.toFixed(0)}</strong></div>
          <div class="viz-tooltip__row"><span>Churn risk</span><strong>${(pt.churnRisk * 100).toFixed(1)}%</strong></div>
          ${showCF ? `<div class="viz-tooltip__row"><span>Without interventions</span><strong>${(pt.churnRiskCF * 100).toFixed(1)}%</strong></div>` : ''}`;

        const x = Math.min(event.clientX + 14, window.innerWidth  - 220);
        const y = Math.min(event.clientY + 14, window.innerHeight - 160);
        tooltip.style.left = `${x}px`;
        tooltip.style.top  = `${y}px`;
        tooltip.classList.add('is-visible');

        // Cross-link: highlight this persona's node in network graph
        document.dispatchEvent(new CustomEvent('journey:highlight',
          { detail: { userId: pName.userId } }));
      })
      .on('mouseleave', () => {
        hoverLine.classed('is-visible', false);
        tooltip.classList.remove('is-visible');
        document.dispatchEvent(new CustomEvent('journey:highlight', { detail: { userId: null } }));
      });

    _applyThresholdPulse(data);
  }

  // ── Build intervention dots ──────────────────────────────────────────────────

  function _buildIvDots(parentG, persona, data) {
    parentG.selectAll('.journey-iv-dot').remove();
    parentG.selectAll('.journey-iv-type-label').remove();

    const dotY = LANE_H.events / 2;

    (persona.interventions ?? []).forEach(iv => {
      const dx   = xScale(iv.month);
      const col  = IV_COLORS[iv.type] ?? '#ccc';

      const dot = parentG.append('circle')
        .attr('class', 'journey-iv-dot')
        .attr('cx', dx).attr('cy', dotY)
        .attr('r', 7)
        .attr('fill', col)
        .attr('stroke', 'rgba(0,0,0,0.35)')
        .attr('stroke-width', 1)
        .style('color', col)
        .on('click', (event) => {
          event.stopPropagation();
          _showIvCard(iv, dx, col);
          parentG.selectAll('.journey-iv-dot').classed('is-active', false);
          dot.classed('is-active', true);
          activeIvDot = iv;
        });

      // Small type label under dot
      parentG.append('text').attr('class', 'journey-iv-type-label')
        .attr('x', dx).attr('y', dotY + 13)
        .attr('text-anchor', 'middle')
        .attr('fill', col)
        .style('font-size', '8px').style('font-weight', '700').style('letter-spacing', '0.05em')
        .text(iv.type === 'upgrade-offer' ? 'UP' : iv.type === 'price-lock' ? 'PL' : 'CD');
    });
  }

  // ── Counterfactual gap annotation ────────────────────────────────────────────

  function _buildCfAnnotation(g, data) {
    g.selectAll('*').remove();
    const midPt = data[Math.floor(MONTHS / 2)];
    if (!midPt) return;

    const mx  = xScale(midPt.month);
    const ay  = yChurn(midPt.churnRisk);
    const cfy = yChurn(midPt.churnRiskCF);
    const gap = ((midPt.churnRiskCF - midPt.churnRisk) * 100).toFixed(1);

    if (Math.abs(ay - cfy) < 3) return;  // gap too small to annotate

    g.append('line')
      .attr('x1', mx).attr('x2', mx).attr('y1', ay).attr('y2', cfy)
      .attr('stroke', 'var(--ps-teal-light)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 2').attr('opacity', 0.7);

    g.append('text').attr('class', 'journey-cf-annotation')
      .attr('x', mx + 5).attr('y', (ay + cfy) / 2)
      .attr('dominant-baseline', 'middle')
      .text(`−${gap}% avoided`);
  }

  // ── Threshold pulse state ────────────────────────────────────────────────────

  function _applyThresholdPulse(data) {
    const breached = data.some(d => d.churnRisk >= IV_THRESHOLD);
    churnThresholdLine?.classed('is-breached', breached);
  }

  // ── Show intervention detail card ────────────────────────────────────────────

  function _showIvCard(iv, dotXPx, col) {
    if (!ivCardEl) return;
    ivCardEl.style.display = '';
    ivCardEl.querySelector('#iv-card-type').textContent  = iv.label;
    ivCardEl.querySelector('#iv-card-type').style.color  = col;
    ivCardEl.querySelector('#iv-card-type').style.borderColor = col + '55';
    ivCardEl.querySelector('#iv-card-month').textContent = `Month ${iv.month}`;
    ivCardEl.querySelector('#iv-card-desc').textContent  = iv.desc;
    ivCardEl.querySelector('#iv-card-effect').textContent =
      `Estimated churn risk reduction: −${(iv.effect * 100).toFixed(0)}%`;
    ivCardEl.classList.add('journey-iv-card');
  }

  // ── Update (transition existing elements, no DOM rebuild) ────────────────────

  function update(animate = true) {
    const persona = PERSONAS[currentIdx];
    const data    = generateData(persona);
    const dur     = animate ? 600 : 0;

    if (!gSel) return;

    // Rescale yEng domain if sessions changed across personas
    yEng.domain([0, d3.max(data, d => d.sessions) * 1.25]);

    // Engagement
    const sessionMean  = d3.mean(data, d => d.sessions);
    const sessionStdev = d3.deviation(data, d => d.sessions);
    const valleyThresh = sessionMean - 0.4 * sessionStdev;

    engValleyPath.datum(data).transition().duration(dur)
      .attr('d', d3.area()
        .x(d => xScale(d.month))
        .y0(LANE_H.eng)
        .y1(d => d.sessions < valleyThresh ? yEng(d.sessions) : LANE_H.eng)
        .curve(d3.curveCatmullRom)
      );

    engAreaPath.datum(data).transition().duration(dur).attr('d', areaEng);
    engLinePath.datum(data).transition().duration(dur).attr('d', lineEng);

    // Perceived value
    valLinePath.datum(data).transition().duration(dur).attr('d', lineVal);

    // Remove old annotations, redraw
    gSel.selectAll('.journey-flag-stem, .journey-flag-label').remove();
    const valGEl = gSel.select(`g:nth-of-type(2)`);
    const valG   = gSel.append('g').attr('transform', `translate(0,${LANE_TOPS.val})`);
    (persona.annotations ?? []).forEach(ann => {
      const annPt  = data.find(d => d.month === ann.month) ?? data[Math.min(ann.month, MONTHS)];
      const ax     = xScale(ann.month);
      const ay     = yVal(annPt.perceivedValue);
      const labelY = ann.yAnchor === 'high' ? Math.min(ay - 14, 12) : Math.max(ay + 14, LANE_H.val - 10);
      valG.append('line').attr('class', 'journey-flag-stem')
        .attr('x1', ax).attr('x2', ax).attr('y1', labelY)
        .attr('y2', ann.yAnchor === 'high' ? ay - 2 : ay + 2);
      valG.append('text').attr('class', 'journey-flag-label')
        .attr('x', ax + 4).attr('y', labelY)
        .attr('dominant-baseline', ann.yAnchor === 'high' ? 'auto' : 'hanging')
        .text(ann.label);
    });

    // Churn risk
    churnAreaPath.datum(data).transition().duration(dur).attr('d', areaChurn);
    churnLinePath.datum(data).transition().duration(dur).attr('d', lineChurn);
    churnCfAreaPath.datum(data).transition().duration(dur).attr('d', areaChurnCf);
    churnCfLinePath.datum(data).transition().duration(dur).attr('d', lineChurnCf);

    // CF annotation
    const cfAnnotG = gSel.select('#cf-annot-g');
    _buildCfAnnotation(cfAnnotG, data);

    // Churned marker: remove then re-add
    gSel.selectAll('.journey-churn-marker, .journey-churn-text').remove();
    if (persona.churned) {
      const churnG = gSel.select(`g[transform="translate(0,${LANE_TOPS.churn})"]`);
      const cx = xScale(persona.churnMonth);
      churnG.append('line').attr('class', 'journey-churn-marker')
        .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', LANE_H.churn);
      churnG.append('text').attr('class', 'journey-threshold-label journey-churn-text')
        .attr('x', cx + 4).attr('y', 14).attr('fill', '#FF716C').text('Churned');
    }

    // Intervention dots
    const eventsG = gSel.select(`g[transform="translate(0,${LANE_TOPS.events})"]`);
    _buildIvDots(eventsG, persona, data);

    // Reset IV card
    if (ivCardEl) ivCardEl.style.display = 'none';
    activeIvDot = null;

    _applyThresholdPulse(data);
  }

  // ── CF toggle ────────────────────────────────────────────────────────────────

  function setCF(on) {
    showCF = on;
    if (!churnCfLinePath) return;
    const op = on ? 1 : 0;
    churnCfLinePath.transition().duration(350).attr('opacity', op);
    churnCfAreaPath.transition().duration(350).attr('opacity', op);
    gSel?.select('#cf-annot-g').transition().duration(350).attr('opacity', op);
  }

  // ── ResizeObserver ────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    rebuild();
    _applyThresholdPulse(generateData(PERSONAS[currentIdx]));
  });
  ro.observe(containerEl);

  rebuild();

  return {
    setPersona(idx, animate = true) {
      currentIdx = idx;
      if (animate) { update(true); }
      else { rebuild(); }
    },
    setCF,
  };
}

// ── Section builder ────────────────────────────────────────────────────────────

export function renderJourneySection(appEl) {
  const section = document.createElement('section');
  section.className = 'narrative-section journey-section section-enter';
  section.id = 'user-journey';

  section.innerHTML = `
    <div class="bg-orb bg-orb--teal"   style="top:5%;    left:-8%;  opacity:0.09; width:440px; height:440px;"></div>
    <div class="bg-orb bg-orb--purple" style="bottom:5%; right:-6%; opacity:0.09; width:380px; height:380px;"></div>

    <div class="container container--wide" style="position:relative; z-index:10; width:100%;">

      <header class="section-header transition-fade">
        <p class="section-label">Subscriber Intelligence</p>
        <h2 class="section-title">User Journey Timeline</h2>
        <p class="section-subtitle">
          Trace the full lifecycle of a PS+ subscriber — from sign-up through engagement shifts,
          churn risk escalation, and intervention response — across four simultaneous signal lanes.
        </p>
      </header>

      <div class="viz-card transition-fade" style="transition-delay:80ms;">

        <!-- Controls row -->
        <div class="viz-filter-row" style="align-items:center; flex-wrap:wrap; gap:var(--sp-4);">
          <span class="viz-filter-row__label">Subscriber:</span>
          <select class="seg-select" id="journey-persona-select" style="max-width:320px;"></select>
          <label class="cf-toggle-label" style="margin-left:auto;">
            <input type="checkbox" class="cf-toggle-input" id="journey-cf-toggle">
            <span class="cf-toggle-track"><span class="cf-toggle-thumb"></span></span>
            Without interventions
          </label>
        </div>

        <!-- Legend row -->
        <div style="display:flex; gap:var(--sp-5); flex-wrap:wrap; margin-bottom:var(--sp-4);">
          <span class="journey-persona-badge">
            <span style="width:8px;height:8px;border-radius:50%;background:#00B8D4;flex-shrink:0;"></span>
            Engagement
          </span>
          <span class="journey-persona-badge">
            <span style="width:8px;height:8px;border-radius:50%;background:#00AAFF;flex-shrink:0;"></span>
            Perceived Value
          </span>
          <span class="journey-persona-badge">
            <span style="width:8px;height:8px;border-radius:50%;background:#FF716C;flex-shrink:0;"></span>
            Churn Risk
          </span>
          ${Object.entries(IV_COLORS).map(([k, c]) => `
            <span class="journey-persona-badge">
              <span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;"></span>
              ${IV_LABEL[k]}
            </span>`).join('')}
        </div>

        <!-- SVG container -->
        <div id="viz-user-journey"></div>

        <!-- Intervention detail card (hidden until dot click) -->
        <div id="journey-iv-card" style="display:none;">
          <div class="journey-iv-card__header">
            <span class="journey-iv-card__type" id="iv-card-type"></span>
            <span class="journey-iv-card__month" id="iv-card-month"></span>
            <button class="journey-iv-card__close" id="iv-card-close">✕</button>
          </div>
          <p class="journey-iv-card__desc" id="iv-card-desc"></p>
          <div class="journey-iv-card__effect" id="iv-card-effect"></div>
        </div>

      </div>
    </div>`;

  appEl.appendChild(section);

  // Populate persona dropdown
  const select = section.querySelector('#journey-persona-select');
  PERSONAS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.label;
    select.appendChild(opt);
  });

  const chartEl  = section.querySelector('#viz-user-journey');
  const ivCardEl = section.querySelector('#journey-iv-card');

  // Defer chart creation until container has real width
  let chartInstance = null;
  const initRO = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.contentRect.width > 0 && !chartInstance) {
        initRO.disconnect();
        chartInstance = createJourneyChart(chartEl, ivCardEl);

        // Wire controls after chart is created
        select.addEventListener('change', () => {
          chartInstance.setPersona(parseInt(select.value, 10), true);
        });

        const cfToggle = section.querySelector('#journey-cf-toggle');
        cfToggle.addEventListener('change', () => {
          chartInstance.setCF(cfToggle.checked);
        });

        section.querySelector('#iv-card-close').addEventListener('click', () => {
          ivCardEl.style.display = 'none';
          chartEl.querySelectorAll('.journey-iv-dot').forEach(d => d.classList.remove('is-active'));
        });
      }
    }
  });
  initRO.observe(chartEl);

  // Entrance IO
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        section.classList.add('is-visible');
        section.querySelectorAll('.transition-fade').forEach((el, i) => {
          setTimeout(() => el.classList.add('is-visible'), i * 100);
        });
        io.unobserve(section);
      }
    });
  }, { threshold: 0.1 });
  io.observe(section);

  return section;
}
