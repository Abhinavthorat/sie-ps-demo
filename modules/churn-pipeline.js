/**
 * modules/churn-pipeline.js
 * Task 3 — Churn Model Pipeline & Continuous Prediction Timeline
 *
 * Three sub-visualizations:
 *   1. #viz-pipeline   — Animated ML inference DAG (input → model → output)
 *   2. #viz-importance — Horizontal feature importance bars (data-derived)
 *   3. #viz-timeline   — Lifecycle scrubber, re-scores sample user at any month
 */

import { featureImportance, scoreAtMonth, SAMPLE_USER, SAMPLE_CURVE } from '../lib/churn-score.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1.  PIPELINE DIAGRAM
// ─────────────────────────────────────────────────────────────────────────────

const INPUT_NODES = [
  { id: 'sessions',  label: 'Sessions / Wk',      sub: 'Engagement signal',    color: '#00E5FF' },
  { id: 'value',     label: 'Perceived Value',     sub: 'Tier-fit signal',      color: '#00AAFF' },
  { id: 'titles',    label: 'Titles Played',       sub: 'Catalog depth signal', color: '#A855F7' },
  { id: 'tenure',    label: 'Tenure (Months)',     sub: 'Loyalty signal',       color: '#F5A623' },
];

const OUTPUT_NODES = [
  { id: 'churn-prob',  label: 'Churn Probability', value: '34.2 %', color: '#FF716C' },
  { id: 'feat-imp',    label: 'Feature Weights',   value: 'SHAP',   color: '#00E5FF' },
];

function buildPipelineSVG(containerEl) {
  containerEl.innerHTML = '';

  const W   = Math.max(containerEl.clientWidth || 800, 500);
  const H   = 220;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Layout constants
  const DRAW_W = Math.min(W, 800);
  const OFFSET_X = Math.max(0, (W - DRAW_W) / 2);
  const COL_IN    = OFFSET_X + 80;
  const COL_MODEL = W / 2;
  const COL_OUT   = OFFSET_X + DRAW_W - 80;
  const MODEL_W   = 160;
  const MODEL_H   = 130;
  const MODEL_X   = COL_MODEL - MODEL_W / 2;
  const MODEL_Y   = (H - MODEL_H) / 2;

  const inYs  = INPUT_NODES.map((_, i) =>
    MODEL_Y + (MODEL_H / (INPUT_NODES.length - 1)) * i);
  const outYs = OUTPUT_NODES.map((_, i) =>
    MODEL_Y + MODEL_H * 0.25 + (MODEL_H * 0.5 / (OUTPUT_NODES.length - 1)) * i);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pipeline-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('aria-label', 'Churn model inference pipeline');

  // ── Defs: gradient for model block, scan line ────────────────────────────
  const defs = document.createElementNS(SVG_NS, 'defs');

  // Model block top-border gradient
  const modelGrad = document.createElementNS(SVG_NS, 'linearGradient');
  modelGrad.setAttribute('id', 'model-grad');
  modelGrad.setAttribute('x1', '0%'); modelGrad.setAttribute('x2', '100%');
  modelGrad.setAttribute('y1', '0%'); modelGrad.setAttribute('y2', '0%');
  [['0%', '#0070D1'], ['50%', '#00B8D4'], ['100%', '#7B2FBE']].forEach(([off, col]) => {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', col);
    modelGrad.appendChild(stop);
  });
  defs.appendChild(modelGrad);

  // Glow filter
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', 'node-glow');
  const feGaussian = document.createElementNS(SVG_NS, 'feGaussianBlur');
  feGaussian.setAttribute('stdDeviation', '3');
  feGaussian.setAttribute('result', 'blur');
  const feMerge = document.createElementNS(SVG_NS, 'feMerge');
  ['blur', 'SourceGraphic'].forEach(inp => {
    const n = document.createElementNS(SVG_NS, 'feMergeNode');
    n.setAttribute('in', inp);
    feMerge.appendChild(n);
  });
  filter.appendChild(feGaussian);
  filter.appendChild(feMerge);
  defs.appendChild(filter);

  // Scan-beam clipPath
  const clip = document.createElementNS(SVG_NS, 'clipPath');
  clip.setAttribute('id', 'model-clip');
  const clipRect = document.createElementNS(SVG_NS, 'rect');
  clipRect.setAttribute('x', MODEL_X.toString());
  clipRect.setAttribute('y', MODEL_Y.toString());
  clipRect.setAttribute('width', MODEL_W.toString());
  clipRect.setAttribute('height', MODEL_H.toString());
  clip.appendChild(clipRect);
  defs.appendChild(clip);

  svg.appendChild(defs);

  // ── Edges: input → model ─────────────────────────────────────────────────
  const edgeGroup = document.createElementNS(SVG_NS, 'g');
  edgeGroup.setAttribute('class', 'pipeline-edges-in');

  INPUT_NODES.forEach((node, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    const y    = inYs[i];
    path.setAttribute('d', `M${COL_IN + 20},${y} L${COL_IN + 30},${y} L${COL_IN + 30},${y + 26} L${MODEL_X - 16},${y + 26} L${MODEL_X - 16},${y} L${MODEL_X},${y}`);
    path.setAttribute('class', 'pipeline-edge');
    path.setAttribute('data-edge-in', node.id);
    path.setAttribute('stroke', node.color);
    path.setAttribute('stroke-opacity', '0.55');
    edgeGroup.appendChild(path);
  });
  svg.appendChild(edgeGroup);

  // ── Edges: model → output ────────────────────────────────────────────────
  const edgeGroupOut = document.createElementNS(SVG_NS, 'g');
  edgeGroupOut.setAttribute('class', 'pipeline-edges-out');

  OUTPUT_NODES.forEach((node, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    const y    = outYs[i];
    path.setAttribute('d', `M${MODEL_X + MODEL_W},${y} L${MODEL_X + MODEL_W + 16},${y} L${MODEL_X + MODEL_W + 16},${y + 26} L${COL_OUT - 30},${y + 26} L${COL_OUT - 30},${y} L${COL_OUT - 22},${y}`);
    path.setAttribute('class', 'pipeline-edge');
    path.setAttribute('data-edge-out', node.id);
    path.setAttribute('stroke', node.color);
    path.setAttribute('stroke-opacity', '0.55');
    edgeGroupOut.appendChild(path);
  });
  svg.appendChild(edgeGroupOut);

  // ── Model block ──────────────────────────────────────────────────────────
  const modelGroup = document.createElementNS(SVG_NS, 'g');
  modelGroup.setAttribute('class', 'pipeline-model-block');

  // Outer glow rect
  const glowRect = document.createElementNS(SVG_NS, 'rect');
  glowRect.setAttribute('x', (MODEL_X - 2).toString());
  glowRect.setAttribute('y', (MODEL_Y - 2).toString());
  glowRect.setAttribute('width', (MODEL_W + 4).toString());
  glowRect.setAttribute('height', (MODEL_H + 4).toString());
  glowRect.setAttribute('rx', '10');
  glowRect.setAttribute('fill', 'none');
  glowRect.setAttribute('stroke', 'url(#model-grad)');
  glowRect.setAttribute('stroke-width', '1.5');
  glowRect.setAttribute('opacity', '0.5');
  modelGroup.appendChild(glowRect);

  // Background fill
  const bgRect = document.createElementNS(SVG_NS, 'rect');
  bgRect.setAttribute('x', MODEL_X.toString());
  bgRect.setAttribute('y', MODEL_Y.toString());
  bgRect.setAttribute('width', MODEL_W.toString());
  bgRect.setAttribute('height', MODEL_H.toString());
  bgRect.setAttribute('rx', '8');
  bgRect.setAttribute('fill', 'rgba(13,22,38,0.9)');
  modelGroup.appendChild(bgRect);

  // Top border accent
  const accentLine = document.createElementNS(SVG_NS, 'rect');
  accentLine.setAttribute('x', MODEL_X.toString());
  accentLine.setAttribute('y', MODEL_Y.toString());
  accentLine.setAttribute('width', MODEL_W.toString());
  accentLine.setAttribute('height', '2');
  accentLine.setAttribute('rx', '1');
  accentLine.setAttribute('fill', 'url(#model-grad)');
  modelGroup.appendChild(accentLine);

  // Scan beam (animated)
  const scanBeam = document.createElementNS(SVG_NS, 'rect');
  scanBeam.setAttribute('class', 'model-scan-beam');
  scanBeam.setAttribute('x', MODEL_X.toString());
  scanBeam.setAttribute('y', MODEL_Y.toString());
  scanBeam.setAttribute('width', MODEL_W.toString());
  scanBeam.setAttribute('height', '3');
  scanBeam.setAttribute('fill', 'rgba(0,229,255,0.35)');
  scanBeam.setAttribute('clip-path', 'url(#model-clip)');
  modelGroup.appendChild(scanBeam);

  // Grid lines inside model (6 horizontal)
  for (let gi = 1; gi <= 5; gi++) {
    const gl = document.createElementNS(SVG_NS, 'line');
    gl.setAttribute('x1', MODEL_X.toString());
    gl.setAttribute('x2', (MODEL_X + MODEL_W).toString());
    const gy = MODEL_Y + (MODEL_H / 6) * gi;
    gl.setAttribute('y1', gy.toString());
    gl.setAttribute('y2', gy.toString());
    gl.setAttribute('stroke', 'rgba(255,255,255,0.04)');
    gl.setAttribute('stroke-width', '1');
    modelGroup.appendChild(gl);
  }

  // Label
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', COL_MODEL.toString());
  label.setAttribute('y', (MODEL_Y + 24).toString());
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', 'rgba(255,255,255,0.85)');
  label.setAttribute('font-family', 'var(--font-display)');
  label.setAttribute('font-size', '13');
  label.setAttribute('font-weight', '700');
  label.setAttribute('letter-spacing', '0.05em');
  label.textContent = 'GRADIENT BOOST';
  modelGroup.appendChild(label);

  const subLabel = document.createElementNS(SVG_NS, 'text');
  subLabel.setAttribute('x', COL_MODEL.toString());
  subLabel.setAttribute('y', (MODEL_Y + 40).toString());
  subLabel.setAttribute('text-anchor', 'middle');
  subLabel.setAttribute('fill', 'rgba(255,255,255,0.35)');
  subLabel.setAttribute('font-family', 'var(--font-body)');
  subLabel.setAttribute('font-size', '9');
  subLabel.setAttribute('letter-spacing', '0.12em');
  subLabel.textContent = 'CHURN MODEL · XGBoost';
  modelGroup.appendChild(subLabel);

  // Status LED dots
  [0, 1, 2].forEach((i) => {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', (MODEL_X + 14 + i * 12).toString());
    dot.setAttribute('cy', (MODEL_Y + 14).toString());
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', ['#FF716C', '#F5A623', '#4AF090'][i]);
    dot.setAttribute('opacity', '0.7');
    dot.setAttribute('class', `model-led model-led--${i}`);
    modelGroup.appendChild(dot);
  });

  // Score bar (interior progress indicator)
  const barBg = document.createElementNS(SVG_NS, 'rect');
  barBg.setAttribute('x', (MODEL_X + 20).toString());
  barBg.setAttribute('y', (MODEL_Y + MODEL_H - 30).toString());
  barBg.setAttribute('width', (MODEL_W - 40).toString());
  barBg.setAttribute('height', '4');
  barBg.setAttribute('rx', '2');
  barBg.setAttribute('fill', 'rgba(255,255,255,0.07)');
  modelGroup.appendChild(barBg);

  const barFill = document.createElementNS(SVG_NS, 'rect');
  barFill.setAttribute('class', 'model-progress-fill');
  barFill.setAttribute('x', (MODEL_X + 20).toString());
  barFill.setAttribute('y', (MODEL_Y + MODEL_H - 30).toString());
  barFill.setAttribute('width', '0');
  barFill.setAttribute('height', '4');
  barFill.setAttribute('rx', '2');
  barFill.setAttribute('fill', 'url(#model-grad)');
  modelGroup.appendChild(barFill);

  const progressLabel = document.createElementNS(SVG_NS, 'text');
  progressLabel.setAttribute('class', 'model-progress-label');
  progressLabel.setAttribute('x', (MODEL_X + MODEL_W / 2).toString());
  progressLabel.setAttribute('y', (MODEL_Y + MODEL_H - 12).toString());
  progressLabel.setAttribute('text-anchor', 'middle');
  progressLabel.setAttribute('fill', 'rgba(255,255,255,0.3)');
  progressLabel.setAttribute('font-family', 'var(--font-mono)');
  progressLabel.setAttribute('font-size', '8');
  progressLabel.setAttribute('letter-spacing', '0.1em');
  progressLabel.textContent = 'IDLE';
  modelGroup.appendChild(progressLabel);

  svg.appendChild(modelGroup);

  // ── Input nodes ──────────────────────────────────────────────────────────
  const inputGroup = document.createElementNS(SVG_NS, 'g');
  inputGroup.setAttribute('class', 'pipeline-inputs');

  INPUT_NODES.forEach((node, i) => {
    const y = inYs[i];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pipeline-node');
    g.setAttribute('data-node', node.id);
    g.setAttribute('transform', `translate(${COL_IN}, ${y})`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '20');
    circle.setAttribute('fill', 'rgba(13,22,38,0.95)');
    circle.setAttribute('stroke', node.color);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('stroke-opacity', '0.6');
    g.appendChild(circle);

    // Icon initials
    const icon = document.createElementNS(SVG_NS, 'text');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'central');
    icon.setAttribute('fill', node.color);
    icon.setAttribute('font-family', 'var(--font-display)');
    icon.setAttribute('font-size', '10');
    icon.setAttribute('font-weight', '800');
    icon.setAttribute('letter-spacing', '0.05em');
    icon.textContent = node.id.slice(0, 3).toUpperCase();
    g.appendChild(icon);

    // Label (right of node)
    const lbl = document.createElementNS(SVG_NS, 'text');
    lbl.setAttribute('x', '28');
    lbl.setAttribute('y', '-5');
    lbl.setAttribute('fill', 'rgba(240,244,255,0.85)');
    lbl.setAttribute('font-family', 'var(--font-body)');
    lbl.setAttribute('font-size', '11');
    lbl.setAttribute('font-weight', '600');
    lbl.textContent = node.label;
    g.appendChild(lbl);

    const sub = document.createElementNS(SVG_NS, 'text');
    sub.setAttribute('x', '28');
    sub.setAttribute('y', '10');
    sub.setAttribute('fill', 'rgba(90,112,144,0.9)');
    sub.setAttribute('font-family', 'var(--font-body)');
    sub.setAttribute('font-size', '9');
    sub.textContent = node.sub;
    g.appendChild(sub);

    inputGroup.appendChild(g);
  });
  svg.appendChild(inputGroup);

  // ── Output nodes ─────────────────────────────────────────────────────────
  const outputGroup = document.createElementNS(SVG_NS, 'g');
  outputGroup.setAttribute('class', 'pipeline-outputs');

  OUTPUT_NODES.forEach((node, i) => {
    const y = outYs[i];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pipeline-node');
    g.setAttribute('data-node', node.id);
    g.setAttribute('transform', `translate(${COL_OUT}, ${y})`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '22');
    circle.setAttribute('fill', 'rgba(13,22,38,0.95)');
    circle.setAttribute('stroke', node.color);
    circle.setAttribute('stroke-width', '1.5');
    g.appendChild(circle);

    // Value (updates during animation)
    const val = document.createElementNS(SVG_NS, 'text');
    val.setAttribute('class', `output-value output-val--${node.id}`);
    val.setAttribute('text-anchor', 'middle');
    val.setAttribute('dominant-baseline', 'central');
    val.setAttribute('fill', node.color);
    val.setAttribute('font-family', 'var(--font-display)');
    val.setAttribute('font-size', node.id === 'churn-prob' ? '8' : '9');
    val.setAttribute('font-weight', '800');
    val.setAttribute('letter-spacing', '0.03em');
    val.textContent = node.value;
    g.appendChild(val);

    // Label (left of node)
    const lbl = document.createElementNS(SVG_NS, 'text');
    lbl.setAttribute('x', '-28');
    lbl.setAttribute('y', '-5');
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('fill', 'rgba(240,244,255,0.85)');
    lbl.setAttribute('font-family', 'var(--font-body)');
    lbl.setAttribute('font-size', '11');
    lbl.setAttribute('font-weight', '600');
    lbl.textContent = node.label;
    g.appendChild(lbl);

    outputGroup.appendChild(g);
  });
  svg.appendChild(outputGroup);

  containerEl.appendChild(svg);
  return svg;
}

/**
 * runPipelineAnimation(svg)
 * Plays the full inference sequence:
 * edges draw → input nodes pulse → model scans → output nodes update
 */
function runPipelineAnimation(svg) {
  const allEdgesIn  = svg.querySelectorAll('[data-edge-in]');
  const allEdgesOut = svg.querySelectorAll('[data-edge-out]');
  const allNodesIn  = svg.querySelectorAll('.pipeline-inputs .pipeline-node');
  const allNodesOut = svg.querySelectorAll('.pipeline-outputs .pipeline-node');
  const scanBeam    = svg.querySelector('.model-scan-beam');
  const progressFill = svg.querySelector('.model-progress-fill');
  const progressLabel = svg.querySelector('.model-progress-label');
  const outputValues  = svg.querySelectorAll('.output-value');
  const progressBarW = parseFloat(
    svg.querySelector('.model-progress-fill')?.previousElementSibling?.getAttribute('width') ?? '120'
  );

  // Reset everything
  allEdgesIn.forEach(e  => e.classList.remove('is-flowing'));
  allEdgesOut.forEach(e => e.classList.remove('is-flowing'));
  allNodesIn.forEach(n  => n.classList.remove('is-pulsing'));
  allNodesOut.forEach(n => n.classList.remove('is-pulsing'));
  if (scanBeam) { scanBeam.classList.remove('is-scanning'); }
  outputValues.forEach(v => v.classList.remove('is-updating'));
  if (progressFill) { progressFill.setAttribute('width', '0'); }
  if (progressLabel) progressLabel.textContent = 'IDLE';

  // ── Phase 1: draw input edges (staggered, 0–600 ms) ─────────────────────
  allEdgesIn.forEach((edge, i) => {
    setTimeout(() => {
      edge.classList.add('is-flowing');
    }, i * 120);
  });

  // ── Phase 2: pulse input nodes (600 ms) ──────────────────────────────────
  setTimeout(() => {
    allNodesIn.forEach((node, i) => {
      setTimeout(() => {
        node.classList.add('is-pulsing');
        setTimeout(() => node.classList.remove('is-pulsing'), 750);
      }, i * 80);
    });
  }, 600);

  // ── Phase 3: model scanning (900–2 500 ms) ───────────────────────────────
  setTimeout(() => {
    if (progressLabel) progressLabel.textContent = 'SCORING···';
    if (scanBeam) scanBeam.classList.add('is-scanning');

    // Animate progress bar
    let p = 0;
    const interval = setInterval(() => {
      p = Math.min(p + 4, 100);
      if (progressFill) progressFill.setAttribute('width', ((progressBarW * p) / 100).toString());
      if (p >= 100) {
        clearInterval(interval);
        if (progressLabel) progressLabel.textContent = 'DONE';
      }
    }, 30);
  }, 950);

  // ── Phase 4: stop scanning, draw output edges (2 500 ms) ─────────────────
  setTimeout(() => {
    if (scanBeam) scanBeam.classList.remove('is-scanning');

    allEdgesOut.forEach((edge, i) => {
      setTimeout(() => edge.classList.add('is-flowing'), i * 180);
    });

    // Flash output values
    outputValues.forEach(v => {
      v.classList.add('is-updating');
      setTimeout(() => v.classList.remove('is-updating'), 250);
    });

    // Pulse output nodes
    allNodesOut.forEach((node, i) => {
      setTimeout(() => {
        node.classList.add('is-pulsing');
        setTimeout(() => node.classList.remove('is-pulsing'), 750);
      }, 300 + i * 120);
    });
  }, 2600);
}

function renderPipeline(containerEl) {
  const svg = buildPipelineSVG(containerEl);

  // Auto-play on first intersection
  let hasPlayed = false;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !hasPlayed) {
        hasPlayed = true;
        setTimeout(() => runPipelineAnimation(svg), 400);
      }
    });
  }, { threshold: 0.3 });
  io.observe(containerEl);

  return { svg, replay: () => runPipelineAnimation(svg) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  FEATURE IMPORTANCE BARS
// ─────────────────────────────────────────────────────────────────────────────

function renderImportance(containerEl) {
  containerEl.innerHTML = '';

  const features = featureImportance;   // sorted desc, from churn-score.js

  const rows = features.map((f, i) => {
    const pct = (f.importance * 100).toFixed(1);
    return `
      <div class="importance-row" style="--row-delay:${i * 120}ms; padding: 0;">
        <div style="display: flex; align-items: center;">
          <div>
            <p class="importance-label">${f.label}</p>
            <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:1px;">${f.sublabel}</p>
          </div>
        </div>
        <div>
          <div class="importance-bar-track">
            <div class="importance-bar-fill"
                 data-target="${f.importance}"
                 style="background: linear-gradient(90deg, ${f.color}88, ${f.color});">
            </div>
          </div>
        </div>
        <div class="importance-value" style="color:${f.color}; display: flex; align-items: center; justify-content: flex-end;">${pct}%</div>
      </div>`;
  }).join('');

  containerEl.innerHTML = rows;

  // IntersectionObserver → animate bars
  const bars = containerEl.querySelectorAll('.importance-bar-fill');
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      bars.forEach((bar, i) => {
        const target = parseFloat(bar.dataset.target);
        setTimeout(() => {
          bar.style.width = `${target * 100}%`;
          bar.classList.add('is-animated');
        }, i * 130);
      });
      io.disconnect();
    }
  }, { threshold: 0.2 });
  io.observe(containerEl);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  LIFECYCLE TIMELINE SCRUBBER
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONES = [
  { month: 0,  label: 'Onboarding', isStart: true },
  { month: 3,  label: 'Month 3' },
  { month: 6,  label: 'Month 6' },
  { month: 11, label: '~Renewal' },
  { month: 24, label: 'Month 24' },
];

const MAX_MONTH = 24;

function riskLevel(prob) {
  if (prob >= 0.35) return 'high';
  if (prob >= 0.18) return 'medium';
  return 'low';
}

function riskColor(level) {
  return { high: '#FF716C', medium: '#F5A623', low: '#00E5FF' }[level];
}

function renderTimeline(containerEl) {
  // ── Playback state ────────────────────────────────────────────────────────
  let isPlaying  = false;
  let speedMult  = 1;           // 0.5 / 1 / 2
  const PLAY_DURATION = 8000;   // ms for full 0→MAX_MONTH sweep at 1×
  let rafId      = null;
  let playStart  = null;
  let playFromMonth = 0;

  containerEl.innerHTML = `
    <!-- ── Playback controls ──────────────────────────────── -->
    <div class="timeline-controls">
      <button class="play-btn" id="timeline-play-btn" aria-label="Play/pause autoplay"
              title="Play / Pause">
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <path id="play-icon" d="M2 1l9 6-9 6V1z" fill="currentColor"/>
        </svg>
      </button>
      <div class="speed-group" role="group" aria-label="Playback speed">
        <button class="speed-btn" data-speed="0.5">0.5×</button>
        <button class="speed-btn is-active" data-speed="1">1×</button>
        <button class="speed-btn" data-speed="2">2×</button>
      </div>
      <span class="playback-label">Auto-advance · 8 s</span>
    </div>

    <!-- ── Prediction callout ─────────────────────────────── -->
    <div style="position:relative; margin-top:var(--sp-4); margin-bottom:var(--sp-3);">
      <div class="callout-prediction-start">
        ⬥ Prediction starts here
      </div>

      <!-- Milestone dots row -->
      <div class="timeline-milestones">
        ${MILESTONES.map(m => `
          <div class="timeline-milestone">
            <div class="milestone-dot${m.month === 0 ? ' is-active' : ''}"
                 data-month="${m.month}"></div>
            <span class="milestone-label">${m.label}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- ── Scrubber ───────────────────────────────────────── -->
    <div style="padding: 0 var(--sp-2); margin-bottom: var(--sp-5); display: flex; align-items: center;">
      <input  id="timeline-scrubber"
              class="timeline-scrubber"
              type="range"
              min="0" max="${MAX_MONTH}" step="1" value="0"
              aria-label="Subscription month scrubber" />
    </div>

    <!-- ── Churn readout ──────────────────────────────────── -->
    <div class="churn-readout">
      <span class="churn-readout__pct" id="churn-pct">—</span>
      <span class="churn-readout__label">churn probability</span>
    </div>

    <div style="display:flex; align-items:center; gap:var(--sp-3); flex-wrap:wrap; margin-bottom:var(--sp-5);">
      <div id="risk-badge" class="risk-badge risk-badge--low">
        <div class="risk-dot"></div>
        Low risk
      </div>
      <span id="pv-readout"
            style="font-size:var(--fs-xs); color:var(--text-secondary);">
        Perceived value: — / 100
      </span>
      <span id="month-readout"
            style="margin-left:auto; font-size:var(--fs-xs); color:var(--text-muted);">
        Month 0
      </span>
    </div>

    <!-- ── Mini sparkline ────────────────────────────────── -->
    <div id="timeline-sparkline" style="margin-top:var(--sp-4);"></div>

    <!-- ── Sample user legend ─────────────────────────────── -->
    <div style="margin-top:var(--sp-4); padding-top:var(--sp-3);
                border-top:1px solid var(--border-subtle);
                font-size:var(--fs-xs); color:var(--text-muted);">
      Sample user: <strong style="color:var(--text-secondary);">Extra / Casual</strong>
      · 3 sessions/wk · 3 titles/mo
    </div>`;

  buildSparkline(containerEl.querySelector('#timeline-sparkline'));

  const scrubber    = containerEl.querySelector('#timeline-scrubber');
  const pctEl       = containerEl.querySelector('#churn-pct');
  const badgeEl     = containerEl.querySelector('#risk-badge');
  const pvEl        = containerEl.querySelector('#pv-readout');
  const monthEl     = containerEl.querySelector('#month-readout');
  const dots        = containerEl.querySelectorAll('.milestone-dot');
  const sparkCursor = containerEl.querySelector('.sparkline-cursor');
  const playBtn     = containerEl.querySelector('#timeline-play-btn');
  const playIcon    = containerEl.querySelector('#play-icon');
  const speedBtns   = containerEl.querySelectorAll('.speed-btn');

  function updateReadout(month) {
    const { churnProbability, perceivedValue } = scoreAtMonth(SAMPLE_USER, month);
    const pct  = (churnProbability * 100).toFixed(1);
    const risk = riskLevel(churnProbability);
    const col  = riskColor(risk);

    pctEl.textContent   = `${pct}%`;
    pctEl.style.color   = col;
    pvEl.textContent    = `Perceived value: ${perceivedValue.toFixed(0)} / 100`;
    monthEl.textContent = `Month ${month}`;

    badgeEl.className = `risk-badge risk-badge--${risk}`;
    badgeEl.innerHTML = `<div class="risk-dot"></div>${risk.charAt(0).toUpperCase() + risk.slice(1)} risk`;

    dots.forEach(dot => {
      dot.classList.toggle('is-active', parseInt(dot.dataset.month, 10) <= month);
    });

    if (sparkCursor) {
      const progress = month / MAX_MONTH;
      const sparkW   = parseFloat(sparkCursor.closest('svg')?.getAttribute('viewBox')?.split(' ')[2] ?? '300');
      const SPARK_MARGIN = { l: 8, r: 8 };
      const cx = SPARK_MARGIN.l + progress * (sparkW - SPARK_MARGIN.l - SPARK_MARGIN.r);
      const curvePoint = SAMPLE_CURVE[Math.min(month, SAMPLE_CURVE.length - 1)];
      const sparkH = parseFloat(sparkCursor.closest('svg')?.getAttribute('viewBox')?.split(' ')[3] ?? '60');
      const cy = sparkH - 8 - ((curvePoint.churnProbability - 0) / (0.5 - 0)) * (sparkH - 16);
      sparkCursor.setAttribute('cx', cx.toFixed(1));
      sparkCursor.setAttribute('cy', Math.max(4, Math.min(sparkH - 4, cy)).toFixed(1));
    }

    const progress = (month / MAX_MONTH) * 100;
    scrubber.style.background =
      `linear-gradient(to right, ${col} 0%, ${col} ${progress}%, rgba(255,255,255,0.07) ${progress}%)`;
    scrubber.value = month;
  }

  // ── Autoplay ──────────────────────────────────────────────────────────────
  function setPlayIcon(playing) {
    playIcon.setAttribute('d', playing
      ? 'M2 2h3v10H2zM7 2h3v10H7z'   // pause bars
      : 'M2 1l9 6-9 6V1z');           // play triangle
  }

  function stopPlay() {
    isPlaying = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    setPlayIcon(false);
  }

  function startPlay() {
    isPlaying = true;
    setPlayIcon(true);
    playFromMonth = parseInt(scrubber.value, 10);
    if (playFromMonth >= MAX_MONTH) playFromMonth = 0; // restart from beginning
    playStart = null;

    function tick(ts) {
      if (!playStart) playStart = ts;
      const elapsed  = (ts - playStart) * speedMult;
      const duration = PLAY_DURATION;
      const frac     = Math.min(elapsed / duration, 1);
      const month    = Math.round(playFromMonth + frac * (MAX_MONTH - playFromMonth));

      updateReadout(month);

      if (frac < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        stopPlay();
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    isPlaying ? stopPlay() : startPlay();
  });

  // Speed control
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedMult = parseFloat(btn.dataset.speed);
      speedBtns.forEach(b => b.classList.toggle('is-active', b === btn));
      // If playing, restart from current position with new speed
      if (isPlaying) { stopPlay(); startPlay(); }
    });
  });

  // Manual scrub pauses autoplay
  scrubber.addEventListener('mousedown', stopPlay);
  scrubber.addEventListener('input', () => updateReadout(parseInt(scrubber.value, 10)));

  updateReadout(0);
}

function buildSparkline(containerEl) {
  if (!containerEl) return;

  const curve = SAMPLE_CURVE;           // 25 months, {month, churnProbability}
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 300, H = 60;
  const ML = 8, MR = 8, MT = 8, MB = 8;
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  const yMax = 0.5, yMin = 0;           // churn range for display

  const xOf = m => ML + (m / (curve.length - 1)) * iW;
  const yOf = v => H - MB - Math.max(0, Math.min(1, (v - yMin) / (yMax - yMin))) * iH;

  const points = curve.map(d => `${xOf(d.month).toFixed(1)},${yOf(d.churnProbability).toFixed(1)}`);

  // Area under curve
  const areaPoints = [
    `${xOf(0)},${yOf(0)}`,
    ...points,
    `${xOf(curve.length - 1)},${H - MB}`,
    `${ML},${H - MB}`,
  ].join(' ');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('aria-label', 'Churn probability over subscription months');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'spark-grad');
  grad.setAttribute('x1', '0%'); grad.setAttribute('x2', '0%');
  grad.setAttribute('y1', '0%'); grad.setAttribute('y2', '100%');
  [['0%', 'rgba(0,229,255,0.35)'], ['100%', 'rgba(0,229,255,0)']].forEach(([off, col]) => {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', col);
    grad.appendChild(stop);
  });
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Area fill
  const area = document.createElementNS(SVG_NS, 'polygon');
  area.setAttribute('points', areaPoints);
  area.setAttribute('fill', 'url(#spark-grad)');
  svg.appendChild(area);

  // Line
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', points.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#00E5FF');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  // Renewal spike annotation (month 11)
  const spikeX = xOf(11);
  const spikeLine = document.createElementNS(SVG_NS, 'line');
  spikeLine.setAttribute('x1', spikeX.toFixed(1)); spikeLine.setAttribute('x2', spikeX.toFixed(1));
  spikeLine.setAttribute('y1', '2'); spikeLine.setAttribute('y2', (H - MB).toFixed(1));
  spikeLine.setAttribute('stroke', 'rgba(245,166,35,0.4)');
  spikeLine.setAttribute('stroke-width', '1');
  spikeLine.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(spikeLine);

  const spikeLbl = document.createElementNS(SVG_NS, 'text');
  spikeLbl.setAttribute('x', (spikeX + 3).toFixed(1));
  spikeLbl.setAttribute('y', '10');
  spikeLbl.setAttribute('fill', 'rgba(245,166,35,0.7)');
  spikeLbl.setAttribute('font-family', 'var(--font-body)');
  spikeLbl.setAttribute('font-size', '8');
  spikeLbl.textContent = 'Renewal';
  svg.appendChild(spikeLbl);

  // Cursor dot (moved by scrubber)
  const cursor = document.createElementNS(SVG_NS, 'circle');
  cursor.setAttribute('class', 'sparkline-cursor');
  cursor.setAttribute('cx', xOf(0).toFixed(1));
  cursor.setAttribute('cy', yOf(curve[0].churnProbability).toFixed(1));
  cursor.setAttribute('r', '4');
  cursor.setAttribute('fill', '#00E5FF');
  cursor.setAttribute('stroke', 'rgba(0,229,255,0.3)');
  cursor.setAttribute('stroke-width', '6');
  svg.appendChild(cursor);

  containerEl.appendChild(svg);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION SKELETON + ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

function buildSkeleton() {
  return `
    <section class="narrative-section churn-section" id="churn-pipeline">

      <div class="bg-orb bg-orb--blue"   style="top:-5%;   right:-8%;  opacity:0.12; width:360px; height:360px;"></div>
      <div class="bg-orb bg-orb--purple" style="bottom:5%; left:-10%;  opacity:0.10; width:320px; height:320px;"></div>

      <div class="container" style="position:relative; z-index:10; width:100%;">

        <!-- Section heading -->
        <header class="section-header transition-fade">
          <p class="section-label">Churn Intelligence</p>
          <h2 class="section-title">Continuous Prediction Pipeline</h2>
          <p class="section-subtitle">
            Churn risk is scored at every session, not just at renewal.
            Drag the timeline to see how risk evolves across the subscription lifecycle.
          </p>
        </header>

        <div class="churn-grid">

          <!-- 1 — Pipeline diagram (full width) -->
          <div class="churn-card churn-card--pipeline transition-fade" style="transition-delay:80ms;">
            <div class="churn-card__header">
              <div>
                <p class="churn-card__title">Inference Pipeline</p>
                <p class="churn-card__subtitle">
                  Four input signals feed the gradient-boost model.
                  Each inference cycle pulses through the graph.
                </p>
              </div>
              <button id="pipeline-replay-btn" class="pipeline-replay-btn" aria-label="Replay pipeline animation">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6a4 4 0 1 1 1.2 2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M2 9V6h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Replay
              </button>
            </div>
            <div id="viz-pipeline"></div>
          </div>

          <!-- 2 — Feature importance -->
          <div class="churn-card churn-card--importance transition-fade" style="transition-delay:160ms;">
            <div class="churn-card__header">
              <div>
                <p class="churn-card__title">Feature Importance</p>
                <p class="churn-card__subtitle">
                  Pearson |r| with churn probability, derived from 1,000-user dataset.
                </p>
              </div>
            </div>
            <div id="viz-importance"></div>
          </div>

          <!-- 3 — Lifecycle timeline -->
          <div class="churn-card churn-card--timeline transition-fade" style="transition-delay:240ms;">
            <div class="churn-card__header">
              <div>
                <p class="churn-card__title">Lifecycle Timeline</p>
                <p class="churn-card__subtitle">
                  Scrub through the subscription lifecycle to see how
                  churn probability evolves for a sample Extra/Casual user.
                </p>
              </div>
            </div>
            <div id="viz-timeline"></div>
          </div>

        </div><!-- /churn-grid -->
      </div><!-- /container -->
    </section>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function renderChurnSection(appEl) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildSkeleton();
  const sectionEl = wrapper.firstElementChild;
  appEl.appendChild(sectionEl);

  // Pipeline
  const pipelineContainer = sectionEl.querySelector('#viz-pipeline');
  const { replay } = renderPipeline(pipelineContainer);

  // Replay button
  sectionEl.querySelector('#pipeline-replay-btn').addEventListener('click', replay);

  // Resize-aware pipeline rebuild
  let pipelineRO = new ResizeObserver(() => {
    const { replay: newReplay } = renderPipeline(pipelineContainer);
    sectionEl.querySelector('#pipeline-replay-btn').onclick = newReplay;
  });
  // Only observe width changes to avoid constant redraws
  // (disconnect after first resize to let manual replay work)
  let pipelineBuilt = false;
  const pipelineROWrapped = new ResizeObserver(entries => {
    if (!pipelineBuilt) { pipelineBuilt = true; return; } // skip initial
    const { replay: r } = renderPipeline(pipelineContainer);
    sectionEl.querySelector('#pipeline-replay-btn').onclick = r;
  });
  pipelineROWrapped.observe(pipelineContainer);

  // Feature importance
  renderImportance(sectionEl.querySelector('#viz-importance'));

  // Timeline
  renderTimeline(sectionEl.querySelector('#viz-timeline'));

  // Entrance animations
  const targets = sectionEl.querySelectorAll('.transition-fade');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  targets.forEach(el => io.observe(el));

  return sectionEl;
}
