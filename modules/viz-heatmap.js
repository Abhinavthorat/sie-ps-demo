/**
 * modules/viz-heatmap.js — Task 6 upgrade
 *
 * New in Task 6:
 *   • Clicking a cell sets global store { tier, segment } → filters scatter + distributions
 *   • Selected cell gets PS-teal border highlight + dimmed unselected cells
 *   • Clear-filter button resets the global store
 *   • Still subscribes to scatter brush via vizBus for incoming highlights
 */

import * as d3 from 'd3';
import { vizBus } from '../lib/viz-state.js';
import { store }  from '../lib/state.js';

const TIERS    = ['essential', 'extra', 'premium'];
const SEGMENTS = ['casual', 'mid-core', 'hardcore'];

const TIER_LABEL = { essential: 'Essential', extra: 'Extra', premium: 'Premium' };
const SEG_LABEL  = { casual: 'Casual', 'mid-core': 'Mid-Core', hardcore: 'Hardcore' };

const TIER_ACCENT = {
  essential: '#00AAFF',
  extra:     '#00E5FF',
  premium:   '#A855F7',
};

// ── Data prep ────────────────────────────────────────────────────────────────
function buildCells(users) {
  return TIERS.flatMap(tier =>
    SEGMENTS.map(seg => {
      const group  = users.filter(u => u.tier === tier && u.segment === seg);
      const values = group.map(u => u.perceivedValue);
      const avg    = d3.mean(values) ?? 0;
      const min    = d3.min(values)  ?? 0;
      const max    = d3.max(values)  ?? 0;
      const std    = d3.deviation(values) ?? 0;
      return { tier, seg, avg, min, max, std, count: group.length };
    })
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function makeTooltip() {
  let el = document.getElementById('heatmap-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'heatmap-tooltip';
    el.className = 'viz-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function showTooltip(tooltip, cell, event) {
  tooltip.innerHTML = `
    <div class="viz-tooltip__title">${TIER_LABEL[cell.tier]} · ${SEG_LABEL[cell.seg]}</div>
    <div class="viz-tooltip__row"><span>Avg perceived value</span><strong>${cell.avg.toFixed(1)}</strong></div>
    <div class="viz-tooltip__row"><span>Range</span><strong>${cell.min}–${cell.max}</strong></div>
    <div class="viz-tooltip__row"><span>Std deviation</span><strong>±${cell.std.toFixed(1)}</strong></div>
    <div class="viz-tooltip__divider"></div>
    <div class="viz-tooltip__row"><span>Users in cell</span><strong>${cell.count}</strong></div>
    <div class="viz-tooltip__divider"></div>
    <div style="font-size:10px; color:var(--ps-teal-light); text-align:center; margin-top:4px;">
      Click to filter all charts
    </div>`;
  const x = Math.min(event.clientX + 14, window.innerWidth  - 280);
  const y = Math.min(event.clientY + 14, window.innerHeight - 180);
  tooltip.style.left = `${x}px`;
  tooltip.style.top  = `${y}px`;
  tooltip.classList.add('is-visible');
}

// ── Main factory ──────────────────────────────────────────────────────────────
export function createHeatmap(containerEl, users) {
  const cells   = buildCells(users);
  const tooltip = makeTooltip();

  const colorScale = d3.scaleSequential()
    .domain([d3.min(cells, d => d.avg), d3.max(cells, d => d.avg)])
    .interpolator(d3.interpolateRgbBasis([
      '#050d1a', '#0a2a52', '#0070D1', '#00B8D4', '#00E5FF',
    ]));

  const margin  = { top: 30, right: 20, bottom: 48, left: 104 };
  const cellGap = 4;

  // Track selected cell key locally (mirrors store.tier|store.segment)
  let selectedKey = null;

  // Clear-filter button (injected above the SVG)
  let clearBtn = containerEl.parentElement?.querySelector('.heatmap-clear-btn');
  if (!clearBtn) {
    clearBtn = document.createElement('button');
    clearBtn.className = 'clear-filter-btn heatmap-clear-btn';
    clearBtn.innerHTML = '✕ Clear filter';
    containerEl.parentElement?.querySelector('.viz-filter-row')?.appendChild(clearBtn);
  }
  clearBtn.addEventListener('click', () => {
    selectedKey = null;
    store.reset();
    clearBtn.classList.remove('is-visible');
    redrawCellState();
  });

  function redrawCellState() {
    const s = store.get();
    const activeBrush = vizBus._activeBrushKeys; // from scatter (set externally)

    d3.select(containerEl).selectAll('.heatmap-cell rect')
      .transition().duration(180)
      .attr('stroke', d => {
        const key = `${d.tier}|${d.seg}`;
        if (selectedKey && key === selectedKey) return TIER_ACCENT[d.tier];
        if (!selectedKey && activeBrush?.has(key)) return TIER_ACCENT[d.tier];
        return 'transparent';
      })
      .attr('opacity', d => {
        const key = `${d.tier}|${d.seg}`;
        if (selectedKey) return key === selectedKey ? 1 : 0.32;
        if (activeBrush?.size) return activeBrush.has(key) ? 1 : 0.32;
        return 1;
      });
  }

  function draw() {
    containerEl.innerHTML = '';

    const W  = containerEl.clientWidth || 480;
    const iW = W - margin.left - margin.right;
    const cellW = (iW - cellGap * (SEGMENTS.length - 1)) / SEGMENTS.length;
    const cellH = cellW * 0.68;
    const iH    = TIERS.length * cellH + cellGap * (TIERS.length - 1);
    const H     = iH + margin.top + margin.bottom;

    const xScale = d3.scaleBand()
      .domain(SEGMENTS).range([0, iW])
      .paddingInner(cellGap / (cellW + cellGap));

    const yScale = d3.scaleBand()
      .domain(TIERS).range([0, iH])
      .paddingInner(cellGap / (cellH + cellGap));

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('class', 'viz-canvas')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Column headers
    g.append('g').attr('class', 'viz-axis viz-axis--x')
      .selectAll('text').data(SEGMENTS).join('text')
      .attr('x', d => xScale(d) + xScale.bandwidth() / 2)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-secondary)')
      .style('font-size', '11px').style('font-weight', '600')
      .style('letter-spacing', '0.08em').style('text-transform', 'uppercase')
      .text(d => SEG_LABEL[d]);

    // Row headers
    g.append('g').attr('class', 'viz-axis viz-axis--y')
      .selectAll('text').data(TIERS).join('text')
      .attr('x', -10)
      .attr('y', d => yScale(d) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => TIER_ACCENT[d])
      .style('font-size', '12px').style('font-weight', '700')
      .style('letter-spacing', '0.04em')
      .text(d => TIER_LABEL[d]);

    // Cells
    const cellGroups = g.selectAll('.heatmap-cell')
      .data(cells, d => `${d.tier}|${d.seg}`)
      .join('g')
      .attr('class', 'heatmap-cell')
      .attr('data-key', d => `${d.tier}|${d.seg}`)
      .attr('transform', d => `translate(${xScale(d.seg)},${yScale(d.tier)})`)
      .style('cursor', 'pointer');

    cellGroups.append('rect')
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('rx', 8)
      .attr('fill', d => colorScale(d.avg))
      .attr('stroke', 'transparent')
      .attr('stroke-width', 2.5);

    cellGroups.append('text')
      .attr('x', xScale.bandwidth() / 2)
      .attr('y', yScale.bandwidth() / 2 - 8)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => d.avg > 60 ? 'rgba(0,0,0,0.75)' : '#fff')
      .style('font-family', 'var(--font-display)')
      .style('font-size', '20px').style('font-weight', '800')
      .text(d => d.avg.toFixed(0));

    cellGroups.append('text')
      .attr('x', xScale.bandwidth() / 2)
      .attr('y', yScale.bandwidth() / 2 + 14)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => d.avg > 60 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)')
      .style('font-size', '10px').style('font-weight', '600')
      .style('letter-spacing', '0.08em').style('text-transform', 'uppercase')
      .text(d => `n=${d.count}`);

    // ── Click → global filter ──────────────────────────────────
    cellGroups.on('click', (event, d) => {
      tooltip.classList.remove('is-visible');
      const key = `${d.tier}|${d.seg}`;
      if (selectedKey === key) {
        // Toggle off
        selectedKey = null;
        store.reset();
        clearBtn.classList.remove('is-visible');
      } else {
        selectedKey = key;
        store.set({ tier: d.tier, segment: d.seg, brushedUsers: null });
        clearBtn.classList.add('is-visible');
      }
      redrawCellState();
    });

    cellGroups
      .on('mousemove', (event, d) => showTooltip(tooltip, d, event))
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));

    // Legend bar
    const legendW = iW * 0.55;
    const legendX = (iW - legendW) / 2;
    const legendY = iH + 24;
    const legendH = 6;

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'heatmap-legend-grad');
    [0, 0.25, 0.5, 0.75, 1].forEach(t =>
      grad.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(colorScale.domain()[0] + t * (colorScale.domain()[1] - colorScale.domain()[0]))));

    const lg = g.append('g').attr('transform', `translate(${legendX},${legendY})`);
    lg.append('rect')
      .attr('width', legendW).attr('height', legendH).attr('rx', 3)
      .attr('fill', 'url(#heatmap-legend-grad)');

    const legendScale = d3.scaleLinear()
      .domain(colorScale.domain()).range([0, legendW]);
    lg.append('g').attr('class', 'viz-axis')
      .attr('transform', `translate(0,${legendH + 2})`)
      .call(d3.axisBottom(legendScale).ticks(4).tickSize(3))
      .select('.domain').remove();
    lg.append('text')
      .attr('x', legendW / 2).attr('y', -8)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
      .style('font-size', '10px').style('letter-spacing', '0.08em')
      .style('text-transform', 'uppercase').text('avg perceived value →');

    // ── Incoming: scatter brush → highlight cells ──────────────
    const unsub = vizBus.on('selection:change', selection => {
      if (selectedKey) return; // heatmap cell filter takes priority
      const highlighted = selection ? selection.cellKeys : null;
      vizBus._activeBrushKeys = highlighted;
      cellGroups.select('rect')
        .transition().duration(180)
        .attr('stroke', d =>
          highlighted?.has(`${d.tier}|${d.seg}`) ? TIER_ACCENT[d.tier] : 'transparent')
        .attr('opacity', d =>
          highlighted ? (highlighted.has(`${d.tier}|${d.seg}`) ? 1 : 0.35) : 1);
    });

    // ── Incoming: global store change → sync cell highlight ────
    const unsubStore = store.subscribe(s => {
      if (!s.tier && !s.segment) {
        selectedKey = null;
        clearBtn.classList.remove('is-visible');
        cellGroups.select('rect')
          .transition().duration(180)
          .attr('stroke', 'transparent').attr('opacity', 1);
        return;
      }
      if (s.tier || s.segment) {
        const expected = s.tier && s.segment ? `${s.tier}|${s.segment}` : null;
        if (expected && expected !== selectedKey) {
          selectedKey = expected;
          clearBtn.classList.add('is-visible');
        }
        cellGroups.select('rect')
          .transition().duration(180)
          .attr('stroke', d => {
            const match = (!s.tier || d.tier === s.tier) && (!s.segment || d.seg === s.segment);
            return match ? TIER_ACCENT[d.tier] : 'transparent';
          })
          .attr('opacity', d => {
            const match = (!s.tier || d.tier === s.tier) && (!s.segment || d.seg === s.segment);
            return match ? 1 : 0.32;
          });
      }
    });

    containerEl._heatmapUnsub = () => { unsub(); unsubStore(); };
  }

  const ro = new ResizeObserver(() => {
    containerEl._heatmapUnsub?.();
    draw();
  });
  ro.observe(containerEl);
  draw();
}
