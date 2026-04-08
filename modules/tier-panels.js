/**
 * modules/tier-panels.js
 * Renders the three PS+ tier panels into a target container.
 * Reads from data/tiers.json and uses CSS variables from styles/tokens.css.
 */

import tiersData from '../data/tiers.json';

// ── Icon SVGs (inline, no external deps) ────────────────────────────────────
const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
  <circle cx="7" cy="7" r="6.5" fill="currentColor" opacity="0.15"/>
  <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CROSS_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
  <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const STAR_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
  <path d="M6 1l1.24 3.27H11L8.38 6.27l.95 3.28L6 7.46 2.67 9.55l.95-3.28L1 4.27h3.76L6 1z" fill="currentColor"/>
</svg>`;

// ── Tier colour helpers ──────────────────────────────────────────────────────
const TIER_CONFIG = {
  essential: {
    panelClass: 'panel--essential',
    gradient: 'var(--grad-essential)',
    badgeGradient: 'var(--grad-essential-badge)',
    accentColor: 'var(--ps-blue-light)',
    glowVar: 'var(--glow-blue)',
    chipBg: 'rgba(0, 112, 209, 0.2)',
    chipBorder: 'rgba(0, 170, 255, 0.3)',
    tagBg: 'rgba(0, 112, 209, 0.15)',
    tagColor: 'var(--ps-blue-light)',
    headerGrad: 'var(--grad-essential-card)',
  },
  extra: {
    panelClass: 'panel--extra',
    gradient: 'var(--grad-extra)',
    badgeGradient: 'var(--grad-extra-badge)',
    accentColor: 'var(--ps-teal-light)',
    glowVar: 'var(--glow-teal)',
    chipBg: 'rgba(0, 184, 212, 0.15)',
    chipBorder: 'rgba(0, 229, 255, 0.3)',
    tagBg: 'rgba(0, 184, 212, 0.15)',
    tagColor: 'var(--ps-teal-light)',
    headerGrad: 'var(--grad-extra-card)',
  },
  premium: {
    panelClass: 'panel--premium',
    gradient: 'var(--grad-premium)',
    badgeGradient: 'var(--grad-premium-badge)',
    accentColor: 'var(--ps-purple-light)',
    glowVar: 'var(--glow-purple)',
    chipBg: 'rgba(123, 47, 190, 0.2)',
    chipBorder: 'rgba(168, 85, 247, 0.35)',
    tagBg: 'rgba(168, 85, 247, 0.15)',
    tagColor: 'var(--ps-purple-light)',
    headerGrad: 'var(--grad-premium-card)',
  },
};

// ── Sub-renderers ────────────────────────────────────────────────────────────
function renderPriceBlock(pricing, cfg) {
  return `
    <div class="tier-price-block">
      <div class="tier-price-badge" style="background: ${cfg.badgeGradient};">
        <span class="tier-price-amount">${pricing.monthly.label}</span>
      </div>
      <div class="tier-price-alt">
        <span>${pricing.annual.label}</span>
        <span class="tier-price-sep">·</span>
        <span>${pricing.quarterly.label}</span>
      </div>
    </div>`;
}

function renderCatalogChip(catalogCount, cfg) {
  if (!catalogCount) return '';
  return `
    <div class="tier-catalog-chip"
         style="background:${cfg.chipBg}; border-color:${cfg.chipBorder}; color:${cfg.accentColor};">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="7" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="1" y="7" width="4" height="4" rx="1" fill="currentColor" opacity="0.5"/>
        <rect x="7" y="7" width="4" height="4" rx="1" fill="currentColor" opacity="0.5"/>
      </svg>
      ${catalogCount}+ games
    </div>`;
}

function renderFeatureList(features, cfg) {
  return features.map((f) => {
    const iconColor = f.included ? cfg.accentColor : 'var(--text-muted)';
    const rowClass  = f.included ? 'feature-row feature-row--on' : 'feature-row feature-row--off';
    const icon      = f.included ? CHECK_ICON : CROSS_ICON;
    return `
      <li class="${rowClass}">
        <span class="feature-icon" style="color:${iconColor};" title="${f.detail}">${icon}</span>
        <span class="feature-label">${f.label}</span>
      </li>`;
  }).join('');
}

function renderPerks(perks, cfg) {
  if (!perks.length) return '';
  return `
    <div class="tier-perks">
      <p class="tier-perks-heading" style="color:${cfg.accentColor};">
        ${STAR_ICON} Exclusive perks
      </p>
      <ul class="tier-perks-list">
        ${perks.map((p) => `
          <li class="perk-item" style="border-left-color:${cfg.accentColor}25;">
            <span style="color:${cfg.accentColor}; margin-right:6px;">›</span>${p}
          </li>`).join('')}
      </ul>
    </div>`;
}

function renderTierPanel(tier) {
  const cfg = TIER_CONFIG[tier.id];

  return `
    <article class="panel ${cfg.panelClass} transition-scale"
             data-tier="${tier.id}"
             aria-label="${tier.name}">

      <!-- Shimmer overlay -->
      <div class="panel-shimmer" aria-hidden="true"></div>

      <!-- Header gradient zone -->
      <div class="panel-header" style="background: ${cfg.headerGrad};">
        <div class="tier-tag" style="background:${cfg.tagBg}; color:${cfg.tagColor};">
          PS Plus
        </div>
        <h2 class="tier-name">${tier.shortName}</h2>
        <p class="tier-tagline">${tier.tagline}</p>
        ${renderCatalogChip(tier.catalogCount, cfg)}
      </div>

      <!-- Price block -->
      ${renderPriceBlock(tier.pricing, cfg)}

      <!-- Feature list -->
      <div class="panel-body">
        <ul class="feature-list" role="list">
          ${renderFeatureList(tier.features, cfg)}
        </ul>
        ${renderPerks(tier.exclusivePerks, cfg)}
      </div>

      <!-- CTA -->
      <div class="panel-footer">
        <button class="tier-cta-btn" style="--btn-accent:${cfg.accentColor};" data-tier="${tier.id}">
          Choose ${tier.shortName}
        </button>
        <p class="tier-storage">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M1 3h9v5a1 1 0 01-1 1H2a1 1 0 01-1-1V3z" stroke="currentColor" stroke-width="1" fill="none" opacity="0.6"/>
            <path d="M1 3l1.5-2h6L10 3" stroke="currentColor" stroke-width="1" opacity="0.6"/>
          </svg>
          ${tier.cloudStorageGB} GB cloud storage
        </p>
      </div>
    </article>`;
}

// ── Styles injected once ─────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tier-panels-styles')) return;
  const style = document.createElement('style');
  style.id = 'tier-panels-styles';
  style.textContent = `
    /* ── Panel internals ──────────────────────────────────── */
    .panel {
      display: flex;
      flex-direction: column;
      cursor: default;
    }

    .panel-shimmer {
      position: absolute;
      inset: 0;
      background: var(--grad-shimmer);
      background-size: 200% 100%;
      opacity: 0;
      transition: opacity var(--dur-slow) ease;
      pointer-events: none;
      z-index: 1;
      border-radius: inherit;
    }
    .panel:hover .panel-shimmer { opacity: 1; }

    /* Header */
    .panel-header {
      padding: var(--sp-6) var(--sp-6) var(--sp-5);
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      height: 225px; /* Fixed height for consistent vertical alignment */
      box-sizing: border-box;
    }

    .tier-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--fs-2xs);
      font-weight: var(--fw-semi);
      letter-spacing: var(--ls-wider);
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      margin-bottom: var(--sp-3);
    }

    .tier-name {
      font-family: var(--font-display);
      font-size: var(--fs-3xl);
      font-weight: var(--fw-black);
      letter-spacing: var(--ls-tight);
      line-height: var(--lh-tight);
      color: var(--text-primary);
      margin-bottom: var(--sp-2);
    }

    .tier-tagline {
      font-size: var(--fs-sm);
      color: var(--text-secondary);
      margin-bottom: auto; /* Pushes catalog chip down or fills space */
      line-height: var(--lh-snug);
    }

    .tier-catalog-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-xs);
      font-weight: var(--fw-semi);
      padding: 4px 12px;
      border-radius: var(--radius-full);
      border: 1px solid;
      letter-spacing: 0.01em;
    }

    /* Price block */
    .tier-price-block {
      padding: var(--sp-4) var(--sp-6);
      border-top: 1px solid var(--border-subtle);
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(0,0,0,0.2);
      position: relative;
      z-index: 2;
    }

    .tier-price-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: var(--radius-full);
      margin-bottom: var(--sp-2);
    }

    .tier-price-amount {
      font-size: var(--fs-lg);
      font-weight: var(--fw-bold);
      color: #fff;
      letter-spacing: var(--ls-tight);
    }

    .tier-price-alt {
      font-size: var(--fs-xs);
      color: var(--text-muted);
      display: flex;
      gap: 6px;
    }

    .tier-price-sep { opacity: 0.4; }

    /* Body */
    .panel-body {
      padding: var(--sp-5) var(--sp-6);
      flex: 1;
      position: relative;
      z-index: 2;
    }

    .feature-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
    }

    .feature-row {
      display: flex;
      align-items: center; /* Vertically center icon and text */
      gap: var(--sp-3);
      font-size: var(--fs-sm);
      line-height: var(--lh-snug);
      text-align: left; /* Ensure left-alignment */
      min-height: 2rem; /* Consistent row height */
    }

    .feature-row--off {
      opacity: 0.38;
    }

    .feature-icon {
      flex-shrink: 0;
      margin-top: 1px;
      display: flex;
    }

    .feature-label {
      color: var(--text-primary);
    }

    /* Perks */
    .tier-perks {
      margin-top: var(--sp-5);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border-subtle);
    }

    .tier-perks-heading {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-xs);
      font-weight: var(--fw-semi);
      letter-spacing: var(--ls-wide);
      text-transform: uppercase;
      margin-bottom: var(--sp-3);
    }

    .tier-perks-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .perk-item {
      font-size: var(--fs-xs);
      color: var(--text-secondary);
      padding-left: var(--sp-3);
      border-left: 2px solid;
      line-height: var(--lh-snug);
    }

    /* Footer */
    .panel-footer {
      padding: var(--sp-5) var(--sp-6) var(--sp-6);
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      align-items: stretch;
    }

    .tier-cta-btn {
      width: 100%;
      padding: var(--sp-3) var(--sp-5);
      border: 1.5px solid color-mix(in srgb, var(--btn-accent) 40%, transparent);
      background: color-mix(in srgb, var(--btn-accent) 12%, transparent);
      color: var(--btn-accent);
      border-radius: var(--radius-md);
      font-size: var(--fs-sm);
      font-weight: var(--fw-semi);
      letter-spacing: var(--ls-wide);
      text-transform: uppercase;
      cursor: pointer;
      transition:
        background var(--dur-base) ease,
        border-color var(--dur-base) ease,
        transform var(--dur-fast) ease;
    }

    .tier-cta-btn:hover {
      background: color-mix(in srgb, var(--btn-accent) 22%, transparent);
      border-color: color-mix(in srgb, var(--btn-accent) 70%, transparent);
      transform: translateY(-1px);
    }

    .tier-cta-btn:active {
      transform: translateY(0);
    }

    .tier-storage {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--fs-2xs);
      color: var(--text-muted);
      justify-content: center;
    }
  `;
  document.head.appendChild(style);
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * renderTierPanels(containerEl)
 * Renders all three tier panels into the given DOM element.
 * Attaches an IntersectionObserver to trigger entrance animations.
 */
export function renderTierPanels(containerEl) {
  if (!containerEl) throw new Error('renderTierPanels: containerEl is required');

  injectStyles();

  const tiers = tiersData.tiers;
  containerEl.innerHTML = `
    <div class="tier-grid">
      ${tiers.map(renderTierPanel).join('')}
    </div>`;

  // Entrance animation via IntersectionObserver
  const panels = containerEl.querySelectorAll('.transition-scale');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // Stagger each panel by 120ms
          const index = [...panels].indexOf(entry.target);
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, index * 120);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  panels.forEach((el) => observer.observe(el));

  // CTA click events (emits a custom event for downstream modules)
  containerEl.querySelectorAll('.tier-cta-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier;
      containerEl.dispatchEvent(new CustomEvent('tier:select', { detail: { tier }, bubbles: true }));
    });
  });

  return containerEl;
}
