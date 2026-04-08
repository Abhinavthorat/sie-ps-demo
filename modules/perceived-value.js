/**
 * modules/perceived-value.js
 * Orchestrates the three coordinated D3 visualizations:
 *   1. KDE distribution curves  (#viz-distributions)
 *   2. Tier × Segment heatmap   (#viz-heatmap)
 *   3. Session × Value scatter  (#viz-scatter)
 *
 * All three share data/users.json and are cross-linked via lib/viz-state.js.
 * Inject styles/viz.css before calling renderPerceivedValueSection().
 */

import users from '../data/users.json';
import { createHeatmap }       from './viz-heatmap.js';
import { createDistributions } from './viz-distributions.js';
import { createScatter }       from './viz-scatter.js';

// ── Section HTML skeleton ─────────────────────────────────────────────────────
function buildSkeleton() {
  return `
    <section class="narrative-section pv-section" id="perceived-value">

      <!-- Background orbs -->
      <div class="bg-orb bg-orb--teal"   style="top:10%;  right:-10%; opacity:0.12; width:380px; height:380px;"></div>
      <div class="bg-orb bg-orb--purple" style="bottom:5%; left:-8%;  opacity:0.10; width:340px; height:340px;"></div>

      <div class="container" style="position:relative; z-index:10; width:100%;">

        <!-- Section heading -->
        <header class="section-header transition-fade">
          <p class="section-label">Tier Intelligence</p>
          <h2 class="section-title">Perceived Value Engine</h2>
          <p class="section-subtitle">
            Same SKU name — wildly different value felt. Explore how session
            depth and segment determine perceived worth across the three tiers.
          </p>
        </header>

        <!-- Viz grid -->
        <div class="viz-grid">

          <!-- 1 — KDE Distributions (full width) -->
          <div class="viz-card viz-card--distributions transition-fade" style="transition-delay:80ms;">
            <div class="viz-card__header">
              <div>
                <p class="viz-card__title">Value Distribution by Tier</p>
                <p class="viz-card__subtitle">
                  Kernel density of perceived value scores (0–100) per tier.
                  Width of each curve reveals spread within a SKU.
                </p>
              </div>
              <div class="viz-card__badges">
                <span class="viz-badge viz-badge--essential">Essential</span>
                <span class="viz-badge viz-badge--extra">Extra</span>
                <span class="viz-badge viz-badge--premium">Premium</span>
              </div>
            </div>
            <div id="viz-distributions"></div>
            <div class="viz-legend">
              <div class="viz-legend__item">
                <div class="viz-legend__swatch" style="background:#00AAFF;"></div>
                Essential
              </div>
              <div class="viz-legend__item">
                <div class="viz-legend__swatch" style="background:#00E5FF;"></div>
                Extra
              </div>
              <div class="viz-legend__item">
                <div class="viz-legend__swatch" style="background:#A855F7;"></div>
                Premium
              </div>
              <div class="viz-legend__item" style="margin-left:auto;">
                <span style="color:var(--text-muted); font-size:var(--fs-2xs);">
                  Dashed lines = tier mean (μ) · Arrow = value gap Essential → Premium
                </span>
              </div>
            </div>
          </div>

          <!-- 2 — Heatmap -->
          <div class="viz-card viz-card--heatmap transition-fade" style="transition-delay:160ms;">
            <div class="viz-card__header">
              <div>
                <p class="viz-card__title">Value Heatmap</p>
                <p class="viz-card__subtitle">
                  Avg perceived value per tier × segment cell.
                  Highlighted when scatter selection is active.
                </p>
              </div>
            </div>
            <div id="viz-heatmap"></div>
          </div>

          <!-- 3 — Scatter + readout -->
          <div class="viz-card viz-card--scatter transition-fade" style="transition-delay:240ms;">
            <div class="viz-card__header">
              <div>
                <p class="viz-card__title">Session Depth vs Value</p>
                <p class="viz-card__subtitle">
                  Drag to select a cluster. Churned users shown as ✕.
                </p>
              </div>
              <div class="viz-card__badges">
                <span class="viz-badge" style="color:var(--ps-teal-light);border-color:rgba(0,229,255,0.25);background:rgba(0,184,212,0.1);">
                  Brush to filter
                </span>
              </div>
            </div>

            <!-- Scatter SVG container -->
            <div id="viz-scatter"></div>

            <!-- Legend row -->
            <div class="viz-legend" style="margin-bottom:var(--sp-3);">
              <div class="viz-legend__item">
                <div class="viz-legend__dot" style="background:#5A7090;"></div>
                Casual
              </div>
              <div class="viz-legend__item">
                <div class="viz-legend__dot" style="background:#00B8D4;"></div>
                Mid-Core
              </div>
              <div class="viz-legend__item">
                <div class="viz-legend__dot" style="background:#A855F7;"></div>
                Hardcore
              </div>
              <div class="viz-legend__item">
                <span style="font-size:10px; color:var(--text-muted);">✕ Churned</span>
              </div>
            </div>

            <!-- Side readout (below scatter on narrow, inline on wide) -->
            <div class="scatter-readout" id="scatter-readout"></div>
          </div>

        </div><!-- /viz-grid -->
      </div><!-- /container -->
    </section>`;
}

// ── Entrance animations ────────────────────────────────────────────────────────
function attachEntranceObserver(sectionEl) {
  const targets = sectionEl.querySelectorAll('.transition-fade');
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  targets.forEach(el => io.observe(el));
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * renderPerceivedValueSection(appEl)
 * Appends the full section to `appEl` and initialises all three D3 charts.
 */
export function renderPerceivedValueSection(appEl) {
  // Inject markup
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildSkeleton();
  const sectionEl = wrapper.firstElementChild;
  appEl.appendChild(sectionEl);

  // Mount D3 charts into their containers
  createDistributions(document.getElementById('viz-distributions'), users);
  createHeatmap(document.getElementById('viz-heatmap'), users);
  createScatter(
    document.getElementById('viz-scatter'),
    document.getElementById('scatter-readout'),
    users,
  );

  // Entrance animations
  attachEntranceObserver(sectionEl);

  return sectionEl;
}
