/**
 * modules/viz-distributions.js — Task 6 upgrade
 *
 * New in Task 6:
 *   • Tier toggle pill buttons (Essential / Extra / Premium / All) above chart
 *   • Smooth D3 opacity transition when toggling a tier
 *   • Tooltip shows exact perceived value and user count at density peak
 *   • Subscribes to global store — when tier/segment filter is active, dims
 *     non-matching curves and highlights matching one
 */

import * as d3 from 'd3';
import { store } from '../lib/state.js';

const TIERS = ['essential', 'extra', 'premium'];

const TIER_META = {
  essential: { label: 'Essential', color: '#00AAFF', fill: 'rgba(0,170,255,0.12)' },
  extra:     { label: 'Extra',     color: '#00E5FF', fill: 'rgba(0,229,255,0.10)' },
  premium:   { label: 'Premium',   color: '#A855F7', fill: 'rgba(168,85,247,0.12)' },
};

const BANDWIDTH = 5.5;
const THRESHOLDS = d3.range(0, 101, 0.5);

function epanechnikov(bw) {
  return v => {
    const u = v / bw;
    return Math.abs(u) <= 1 ? (0.75 * (1 - u * u)) / bw : 0;
  };
}

function kde(kernel, thresholds, data) {
  return thresholds.map(x => ({ x, y: d3.mean(data, v => kernel(x - v)) }));
}

function tierKDE(users) {
  const k = epanechnikov(BANDWIDTH);
  return TIERS.map(tier => {
    const vals = users.filter(u => u.tier === tier).map(u => u.perceivedValue);
    const curve = kde(k, THRESHOLDS, vals);
    const mean  = d3.mean(vals);
    // Find density peak for tooltip
    const peakPt = curve.reduce((a, b) => b.y > a.y ? b : a);
    const countAtPeak = vals.filter(v => Math.abs(v - peakPt.x) < BANDWIDTH).length;
    return { tier, curve, mean, peakPt, countAtPeak, n: vals.length };
  });
}

function makeTooltip() {
  let el = document.getElementById('dist-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dist-tooltip';
    el.className = 'viz-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

// ── Pill toggle controls ───────────────────────────────────────────────────────
function buildToggleRow(parentEl, visibleTiers, onToggle) {
  const row = document.createElement('div');
  row.className = 'viz-filter-row';
  row.innerHTML = `<span class="viz-filter-row__label">Show:</span>`;

  const allBtn = document.createElement('button');
  allBtn.className = 'pill-btn' + (visibleTiers.size === 3 ? ' is-active' : '');
  allBtn.textContent = 'All';
  allBtn.dataset.tier = 'all';
  row.appendChild(allBtn);

  TIERS.forEach(tier => {
    const btn = document.createElement('button');
    btn.className = `pill-btn pill-btn--${tier}` + (visibleTiers.has(tier) ? ' is-active' : '');
    btn.textContent = TIER_META[tier].label;
    btn.dataset.tier = tier;
    row.appendChild(btn);
  });

  row.addEventListener('click', e => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    const t = btn.dataset.tier;
    if (t === 'all') {
      TIERS.forEach(tier => visibleTiers.add(tier));
    } else {
      if (visibleTiers.has(t) && visibleTiers.size > 1) {
        visibleTiers.delete(t);
      } else {
        visibleTiers.add(t);
      }
    }
    // Sync button states
    row.querySelectorAll('.pill-btn').forEach(b => {
      const bt = b.dataset.tier;
      b.classList.toggle('is-active',
        bt === 'all' ? visibleTiers.size === 3 : visibleTiers.has(bt));
    });
    onToggle(visibleTiers);
  });

  parentEl.insertBefore(row, parentEl.firstChild);
  return row;
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export function createDistributions(containerEl, users) {
  const tierData     = tierKDE(users);
  const tooltip      = makeTooltip();
  const visibleTiers = new Set(['essential', 'extra', 'premium']);

  // Track which paths belong to which tier (for opacity updates)
  const tierPaths = new Map(); // tier → { area, line }

  // Build toggle row above the SVG
  const wrapper = containerEl.closest('.viz-card') ?? containerEl.parentElement;
  buildToggleRow(containerEl.parentElement, visibleTiers, updatedVisible => {
    // Smooth opacity update without full redraw
    tierPaths.forEach(({ areaEl, lineEl }, tier) => {
      const visible = updatedVisible.has(tier);
      areaEl.transition().duration(300)
        .attr('opacity', visible ? 1 : 0)
        .style('pointer-events', visible ? 'all' : 'none');
      lineEl.transition().duration(300)
        .attr('opacity', visible ? 1 : 0);
    });

    // Mean lines
    d3.selectAll(`.dist-mean-line`).each(function() {
      const t = this.dataset?.tier;
      if (t) d3.select(this).transition().duration(300)
        .attr('opacity', updatedVisible.has(t) ? 0.65 : 0);
    });
    d3.selectAll(`.dist-mean-label`).each(function() {
      const t = this.dataset?.tier;
      if (t) d3.select(this).transition().duration(300)
        .attr('opacity', updatedVisible.has(t) ? 1 : 0);
    });
  });

  function draw() {
    containerEl.innerHTML = '';
    tierPaths.clear();

    const W  = containerEl.clientWidth || 900;
    const margin = { top: 24, right: 32, bottom: 48, left: 104 };
    const iW = W - margin.left - margin.right;
    const iH = Math.max(180, Math.min(260, iW * 0.22));
    const H  = iH + margin.top + margin.bottom;

    const xScale = d3.scaleLinear().domain([0, 100]).range([0, iW]);
    const maxDensity = d3.max(tierData, t => d3.max(t.curve, d => d.y));
    const yScale = d3.scaleLinear().domain([0, maxDensity * 1.08]).range([iH, 0]);

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('class', 'viz-canvas')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%');

    const defs = svg.append('defs');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid + axes
    g.append('g').attr('class', 'viz-grid-line')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(10).tickSize(-iH).tickFormat(''));

    g.append('g').attr('class', 'viz-axis viz-axis--x')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(10));

    g.append('text')
      .attr('x', iW / 2).attr('y', iH + 38)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
      .style('font-size', 'var(--fs-xs)').style('letter-spacing', '0.07em')
      .style('text-transform', 'uppercase').text('Perceived Value Score →');

    // Per-tier curves
    tierData.forEach(({ tier, curve, mean, peakPt, countAtPeak, n }) => {
      const meta = TIER_META[tier];
      const visible = visibleTiers.has(tier);

      const gradId = `dist-grad-${tier}`;
      const grad = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%').attr('x2', '0%').attr('y1', '0%').attr('y2', '100%');
      grad.append('stop').attr('offset', '0%')
        .attr('stop-color', meta.color).attr('stop-opacity', 0.22);
      grad.append('stop').attr('offset', '100%')
        .attr('stop-color', meta.color).attr('stop-opacity', 0);

      const area = d3.area()
        .x(d => xScale(d.x)).y0(iH).y1(d => yScale(d.y))
        .curve(d3.curveBasis);

      const areaEl = g.append('path')
        .datum(curve)
        .attr('class', `dist-area dist-area-${tier}`)
        .attr('fill', `url(#${gradId})`)
        .attr('opacity', visible ? 1 : 0)
        .style('pointer-events', visible ? 'all' : 'none')
        .attr('d', area);

      const line = d3.line()
        .x(d => xScale(d.x)).y(d => yScale(d.y))
        .curve(d3.curveBasis);

      const lineEl = g.append('path')
        .datum(curve)
        .attr('class', `dist-line dist-line-${tier}`)
        .attr('fill', 'none')
        .attr('stroke', meta.color).attr('stroke-width', 2)
        .attr('opacity', visible ? 1 : 0)
        .attr('d', line);

      tierPaths.set(tier, { areaEl, lineEl });

      // Peak dot (interactive)
      const peakX = xScale(peakPt.x);
      const peakY = yScale(peakPt.y);

      g.append('circle')
        .attr('class', `dist-peak-dot dist-peak-dot-${tier}`)
        .attr('cx', peakX).attr('cy', peakY).attr('r', 3)
        .attr('fill', meta.color).attr('stroke', 'var(--bg-void)').attr('stroke-width', 1.5)
        .attr('opacity', visible ? 1 : 0)
        .style('cursor', 'crosshair')
        .on('mousemove', event => {
          tooltip.innerHTML = `
            <div class="viz-tooltip__title" style="color:${meta.color}">${meta.label} — Peak Density</div>
            <div class="viz-tooltip__row"><span>Perceived value</span><strong>${peakPt.x.toFixed(1)}</strong></div>
            <div class="viz-tooltip__row"><span>Users near peak</span><strong>≈${countAtPeak}</strong></div>
            <div class="viz-tooltip__row"><span>Tier mean (μ)</span><strong>${mean.toFixed(1)}</strong></div>
            <div class="viz-tooltip__row"><span>Tier total</span><strong>${n}</strong></div>`;
          const x = Math.min(event.clientX + 14, window.innerWidth  - 200);
          const y = Math.min(event.clientY + 14, window.innerHeight - 140);
          tooltip.style.left = `${x}px`;
          tooltip.style.top  = `${y}px`;
          tooltip.classList.add('is-visible');
        })
        .on('mouseleave', () => tooltip.classList.remove('is-visible'));
    });

    // Mean lines + labels
    tierData.forEach(({ tier, mean }) => {
      const meta = TIER_META[tier];
      const visible = visibleTiers.has(tier);
      const x = xScale(mean);

      g.append('line')
        .attr('class', 'dist-mean-line').attr('data-tier', tier)
        .attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', iH)
        .attr('stroke', meta.color).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3').attr('opacity', visible ? 0.65 : 0);

      g.append('text')
        .attr('class', 'dist-mean-label').attr('data-tier', tier)
        .attr('x', x + 4).attr('y', 10)
        .attr('fill', meta.color)
        .style('font-size', 'var(--fs-xs)').style('font-weight', 'var(--fw-bold)')
        .attr('opacity', visible ? 1 : 0)
        .text(`μ ${mean.toFixed(0)}`);
    });

    // Value gap annotation
    const essential = tierData.find(t => t.tier === 'essential');
    const premium   = tierData.find(t => t.tier === 'premium');
    const gapX1 = xScale(essential.mean);
    const gapX2 = xScale(premium.mean);
    const arrowY = iH * 0.12;

    const mkrE = defs.append('marker').attr('id', 'dist-arr-end')
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('refX', 5).attr('refY', 3).attr('orient', 'auto');
    mkrE.append('path').attr('d', 'M0,0 L6,3 L0,6 Z').attr('fill', 'var(--text-muted)');
    const mkrS = defs.append('marker').attr('id', 'dist-arr-start')
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('refX', 1).attr('refY', 3).attr('orient', 'auto-start-reverse');
    mkrS.append('path').attr('d', 'M0,0 L6,3 L0,6 Z').attr('fill', 'var(--text-muted)');

    const ann = g.append('g').attr('class', 'kde-annotation');
    ann.append('line')
      .attr('x1', gapX1).attr('x2', gapX2).attr('y1', arrowY).attr('y2', arrowY)
      .attr('stroke', 'var(--text-muted)').attr('stroke-width', 1)
      .attr('marker-start', 'url(#dist-arr-start)')
      .attr('marker-end', 'url(#dist-arr-end)');
    ann.append('text')
      .attr('x', (gapX1 + gapX2) / 2).attr('y', arrowY - 6)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)')
      .style('font-size', 'var(--fs-xs)').style('font-weight', 'var(--fw-semi)')
      .text(`Value gap: +${(premium.mean - essential.mean).toFixed(0)} pts  (Essential → Premium)`);

    // Hover buckets
    const hoverG = g.append('g').attr('class', 'hover-overlay');
    hoverG.selectAll('rect')
      .data(d3.range(0, 101, 2))
      .join('rect')
      .attr('x', d => xScale(d)).attr('y', 0)
      .attr('width', xScale(2) - xScale(0)).attr('height', iH)
      .attr('fill', 'transparent')
      .on('mousemove', (event, xVal) => {
        const rows = tierData
          .filter(t => visibleTiers.has(t.tier))
          .map(({ tier, curve, mean, n }) => {
            const nearest = curve.reduce((best, pt) =>
              Math.abs(pt.x - xVal) < Math.abs(best.x - xVal) ? pt : best);
            const usersAtX = n * nearest.y * 2; // approx count
            return { tier, density: nearest.y, mean, usersAtX };
          });
        tooltip.innerHTML = `
          <div class="viz-tooltip__title">Value ≈ ${xVal}–${xVal + 2}</div>
          ${rows.map(r => `
            <div class="viz-tooltip__row">
              <span style="color:${TIER_META[r.tier].color}">${TIER_META[r.tier].label}</span>
              <strong>${(r.density * 100).toFixed(2)}% (~${Math.round(r.usersAtX)} users)</strong>
            </div>`).join('')}`;
        const x = Math.min(event.clientX + 14, window.innerWidth  - 200);
        const y = Math.min(event.clientY + 14, window.innerHeight - 120);
        tooltip.style.left = `${x}px`;
        tooltip.style.top  = `${y}px`;
        tooltip.classList.add('is-visible');
      })
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));

    // ── Subscribe to global store → dim non-matching curves ────
    const unsubStore = store.subscribe(s => {
      tierData.forEach(({ tier }) => {
        const { areaEl, lineEl } = tierPaths.get(tier) ?? {};
        if (!areaEl || !lineEl) return;
        const baseVisible = visibleTiers.has(tier);
        const matchFilter = !s.tier || s.tier === tier;
        const targetOpacity = baseVisible ? (s.tier ? (matchFilter ? 1 : 0.15) : 1) : 0;
        areaEl.transition().duration(200).attr('opacity', targetOpacity);
        lineEl.transition().duration(200).attr('opacity', targetOpacity);
      });
    });

    containerEl._distUnsub = unsubStore;
  }

  const ro = new ResizeObserver(() => {
    containerEl._distUnsub?.();
    draw();
  });
  ro.observe(containerEl);
  draw();
}
