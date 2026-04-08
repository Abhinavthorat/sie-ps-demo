/**
 * modules/viz-scatter.js — Task 6 upgrade
 *
 * New in Task 6:
 *   • Segment filter dropdown above chart → writes to global store
 *   • Brush box persists visually after release
 *   • Subscribes to global store → dims non-matching dots when tier/segment filter active
 *   • Brushed users highlight in churn timeline (via store.brushedUsers)
 *   • Clear brush on Escape key
 */

import * as d3 from 'd3';
import { selectionState, vizBus } from '../lib/viz-state.js';
import { store } from '../lib/state.js';

const SEG_COLOR = {
  casual:     '#5A7090',
  'mid-core': '#00B8D4',
  hardcore:   '#A855F7',
};
const SEG_LABEL = { casual: 'Casual', 'mid-core': 'Mid-Core', hardcore: 'Hardcore' };
const MARGIN = { top: 20, right: 20, bottom: 48, left: 104 };

function makeTooltip() {
  let el = document.getElementById('scatter-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'scatter-tooltip';
    el.className = 'viz-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function updateReadout(readoutEl, selected) {
  if (!selected || selected.length === 0) {
    readoutEl.innerHTML = `<p class="scatter-readout__empty">Drag to select a cluster —<br>churn stats appear here</p>`;
    return;
  }
  const avgChurn = d3.mean(selected, u => u.churnProbability);
  const churned  = selected.filter(u => u.churned).length;
  const pct      = ((churned / selected.length) * 100).toFixed(0);
  const byTier   = d3.rollup(selected, v => v.length, u => u.tier);
  const tierRows = ['essential','extra','premium']
    .filter(t => byTier.has(t))
    .map(t => {
      const pctT = ((byTier.get(t) / selected.length) * 100).toFixed(0);
      return `<div class="viz-tooltip__row"><span>${t.charAt(0).toUpperCase() + t.slice(1)}</span>
              <strong>${byTier.get(t)} (${pctT}%)</strong></div>`;
    }).join('');

  readoutEl.innerHTML = `
    <p class="scatter-readout__label">Selection · ${selected.length} users</p>
    <div class="scatter-readout__stat">
      <span class="scatter-readout__value">${(avgChurn * 100).toFixed(1)}%</span>
      <span class="scatter-readout__unit">avg churn risk</span>
    </div>
    <p class="scatter-readout__meta">${churned} already churned (${pct}%)</p>
    <div style="margin-top:var(--sp-3); border-top:1px solid var(--border-subtle); padding-top:var(--sp-3);">
      ${tierRows}
    </div>`;
}

function crossPath(r) {
  return `M${-r},${-r}L${r},${r}M${-r},${r}L${r},${-r}`;
}

// ── Segment dropdown ───────────────────────────────────────────────────────────
function buildSegmentDropdown(parentEl) {
  const row = document.createElement('div');
  row.className = 'viz-filter-row';
  row.innerHTML = `
    <span class="viz-filter-row__label">Segment:</span>
    <select class="seg-select" id="scatter-seg-filter">
      <option value="">All</option>
      <option value="casual">Casual</option>
      <option value="mid-core">Mid-Core</option>
      <option value="hardcore">Hardcore</option>
    </select>
    <button class="clear-filter-btn scatter-clear-btn">✕ Clear brush</button>`;
  parentEl.insertBefore(row, parentEl.firstChild);
  return {
    select: row.querySelector('#scatter-seg-filter'),
    clearBtn: row.querySelector('.scatter-clear-btn'),
  };
}

export function createScatter(svgContainerEl, readoutEl, allUsers) {
  const tooltip = makeTooltip();
  let brushedUsers  = [];
  let lastBrushSel  = null;  // persist pixel coords of last brush

  // Build dropdown above SVG container
  const filterParent = svgContainerEl.parentElement;
  const { select: segSelect, clearBtn } = buildSegmentDropdown(filterParent);

  // Active brush G reference (shared across draw calls via closure)
  let brushRef = null;
  let brushGRef = null;

  // Sync dropdown when store changes externally (e.g. heatmap click)
  store.subscribe(s => {
    if (!s.segment && segSelect.value !== '') {
      segSelect.value = '';
    }
    if (s.segment && segSelect.value !== s.segment) {
      segSelect.value = s.segment;
    }
  });

  function draw() {
    svgContainerEl.innerHTML = '';

    const currentSeg = segSelect.value || null;
    const s = store.get();

    // Apply all active filters to displayed data
    let displayUsers = allUsers;
    if (s.tier)    displayUsers = displayUsers.filter(u => u.tier    === s.tier);
    // Note: segment dropdown is handled by visual dimming, not data filter,
    // so all dots stay in the DOM but non-matching ones are dimmed.

    const W  = svgContainerEl.clientWidth || 520;
    const iW = W  - MARGIN.left - MARGIN.right;
    const iH = Math.max(280, Math.min(420, iW * 0.72));
    const H  = iH + MARGIN.top + MARGIN.bottom;

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(allUsers, u => u.sessionsPerWeek) + 0.5])
      .range([0, iW]).nice();

    const yScale = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

    const svg = d3.select(svgContainerEl)
      .append('svg')
      .attr('class', 'viz-canvas')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%');

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Grid
    g.append('g').attr('class', 'viz-grid-line')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(6).tickSize(-iH).tickFormat(''));
    g.append('g').attr('class', 'viz-grid-line')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW).tickFormat(''));

    // Axes
    g.append('g').attr('class', 'viz-axis viz-axis--x')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(6));
    g.append('g').attr('class', 'viz-axis viz-axis--y')
      .call(d3.axisLeft(yScale).ticks(5));

    g.append('text').attr('x', iW / 2).attr('y', iH + 40)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
      .style('font-size', 'var(--fs-xs)').style('letter-spacing', '0.07em')
      .style('text-transform', 'uppercase').text('Sessions per week →');
    g.append('text')
      .attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -38)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
      .style('font-size', 'var(--fs-xs)').style('letter-spacing', '0.07em')
      .style('text-transform', 'uppercase').text('← Perceived value');

    // Churn risk zone
    g.append('rect')
      .attr('x', 0).attr('y', yScale(40))
      .attr('width', xScale(5)).attr('height', iH - yScale(40))
      .attr('fill', 'rgba(255,113,108,0.04)').attr('pointer-events', 'none');
    g.append('text')
      .attr('x', xScale(2.5)).attr('y', yScale(38) - 6)
      .attr('text-anchor', 'middle').attr('fill', 'rgba(255,113,108,0.55)')
      .style('font-size', 'var(--fs-xs)').style('font-weight', 'var(--fw-semi)')
      .style('letter-spacing', '0.08em').style('text-transform', 'uppercase')
      .text('⚠ Churn risk zone');

    // Dots — render all allUsers, apply visual opacity based on filters
    const sorted = [...allUsers].sort((a, b) => (a.churned ? 1 : -1) - (b.churned ? 1 : -1));

    const dotG = g.append('g').attr('class', 'scatter-dots');

    const dots = dotG.selectAll('.dot')
      .data(sorted, d => d.id)
      .join('g')
      .attr('class', 'dot')
      .attr('transform', d => `translate(${xScale(d.sessionsPerWeek)},${yScale(d.perceivedValue)})`)
      .style('cursor', 'crosshair');

    dots.filter(d => !d.churned)
      .append('circle').attr('r', 3.5)
      .attr('fill', d => SEG_COLOR[d.segment])
      .attr('opacity', d => getBaseOpacity(d, currentSeg, s))
      .attr('stroke', 'none');

    dots.filter(d => d.churned)
      .append('path').attr('d', crossPath(3.5))
      .attr('stroke', '#5A6070').attr('stroke-width', 1.5)
      .attr('opacity', d => d.segment === currentSeg || !currentSeg ? 0.50 : 0.12);

    dots.on('mousemove', (event, d) => {
        tooltip.innerHTML = `
          <div class="viz-tooltip__title">${SEG_LABEL[d.segment]} · ${d.tier}</div>
          <div class="viz-tooltip__row"><span>Sessions/wk</span><strong>${d.sessionsPerWeek}</strong></div>
          <div class="viz-tooltip__row"><span>Perceived value</span><strong>${d.perceivedValue}</strong></div>
          <div class="viz-tooltip__row"><span>Churn prob.</span><strong>${(d.churnProbability * 100).toFixed(1)}%</strong></div>
          <div class="viz-tooltip__row"><span>Churned</span><strong>${d.churned ? '✕ Yes' : '✓ No'}</strong></div>`;
        const x = Math.min(event.clientX + 14, window.innerWidth  - 280);
        const y = Math.min(event.clientY + 14, window.innerHeight - 160);
        tooltip.style.left = `${x}px`; tooltip.style.top  = `${y}px`;
        tooltip.classList.add('is-visible');
      })
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));

    // ── Brush ──────────────────────────────────────────────────
    const brush = d3.brush()
      .extent([[0, 0], [iW, iH]])
      .on('start brush end', ({ selection, type }) => {
        if (!selection) {
          // Explicit clear (user clicked outside)
          dotG.selectAll('.dot circle')
            .attr('opacity', d => getBaseOpacity(d, segSelect.value || null, store.get()))
            .attr('stroke', 'none');
          dotG.selectAll('.dot path').attr('opacity', 0.50);
          brushedUsers = [];
          lastBrushSel = null;
          selectionState.clear();
          store.set({ brushedUsers: null });
          updateReadout(readoutEl, []);
          clearBtn.classList.remove('is-visible');
          return;
        }

        lastBrushSel = selection;
        const [[x0, y0], [x1, y1]] = selection;
        const vX0 = xScale.invert(x0), vX1 = xScale.invert(x1);
        const vY0 = yScale.invert(y1), vY1 = yScale.invert(y0);

        brushedUsers = allUsers.filter(u =>
          u.sessionsPerWeek >= vX0 && u.sessionsPerWeek <= vX1 &&
          u.perceivedValue  >= vY0 && u.perceivedValue  <= vY1);

        dotG.selectAll('.dot').each(function(d) {
          const inBrush = brushedUsers.includes(d);
          d3.select(this).select('circle')
            .attr('opacity', inBrush ? 0.95 : 0.10)
            .attr('stroke', inBrush ? d3.color(SEG_COLOR[d.segment]).brighter(0.8) : 'none')
            .attr('stroke-width', 1);
          d3.select(this).select('path')
            .attr('opacity', inBrush ? 0.80 : 0.08);
        });

        if (type === 'end' || type === 'brush') {
          selectionState.set(brushedUsers);
          store.set({ brushedUsers: brushedUsers.length ? brushedUsers : null });
          updateReadout(readoutEl, brushedUsers);
          clearBtn.classList.toggle('is-visible', brushedUsers.length > 0);
        }
      });

    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'scatter-clip')
      .append('rect').attr('width', iW).attr('height', iH);
      
    const brushG = g.append('g').attr('class', 'brush')
      .attr('clip-path', 'url(#scatter-clip)')
      .call(brush);
      
    brushGRef = brushG;
    brushRef  = brush;

    brushG.select('.selection')
      .attr('fill', 'rgba(0,184,212,0.08)')
      .attr('stroke', 'var(--ps-teal)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5 3');

    brushG.selectAll('.handle')
      .attr('fill', 'var(--ps-teal)').attr('opacity', 0.5);

    // Restore persisted brush visual after redraw
    if (lastBrushSel) {
      brushG.call(brush.move, lastBrushSel);
    }

    // ── Subscribe to store → dim dots by tier/segment ──────────
    const unsubStore = store.subscribe(s2 => {
      const seg2 = segSelect.value || null;
      dotG.selectAll('.dot circle')
        .transition().duration(120)
        .attr('opacity', d => getBaseOpacity(d, seg2, s2));
      dotG.selectAll('.dot path')
        .transition().duration(120)
        .attr('opacity', d => {
          if (s2.tier && d.tier !== s2.tier) return 0.05;
          return !seg2 || d.segment === seg2 ? 0.50 : 0.10;
        });
    });

    svgContainerEl._scatterUnsub = unsubStore;
  }

  // Dim logic helper
  function getBaseOpacity(d, seg, s) {
    if (s.tier && d.tier !== s.tier) return 0.06;
    if (seg && d.segment !== seg) return 0.10;
    return d.churned ? 0 : 0.65;
  }

  // Segment dropdown → global store
  segSelect.addEventListener('change', () => {
    const val = segSelect.value || null;
    store.set({ segment: val, brushedUsers: null });
    brushedUsers = [];
    lastBrushSel = null;
    selectionState.clear();
    updateReadout(readoutEl, []);
    clearBtn.classList.remove('is-visible');
    draw();
  });

  // Clear brush button
  clearBtn.addEventListener('click', () => {
    brushedUsers = [];
    lastBrushSel = null;
    selectionState.clear();
    store.set({ brushedUsers: null });
    updateReadout(readoutEl, []);
    clearBtn.classList.remove('is-visible');
    draw();
  });

  // Escape key clears brush
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && brushedUsers.length) {
      brushedUsers = [];
      lastBrushSel = null;
      selectionState.clear();
      store.set({ brushedUsers: null });
      updateReadout(readoutEl, []);
      clearBtn.classList.remove('is-visible');
      draw();
    }
  });

  const ro = new ResizeObserver(() => {
    svgContainerEl._scatterUnsub?.();
    draw();
  });
  ro.observe(svgContainerEl);
  draw();
  updateReadout(readoutEl, []);
}
