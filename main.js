import './styles/layout.css';
import './styles/viz.css';
import './styles/churn.css';
import './styles/causal.css';
import './styles/shell.css';
import './styles/outcomes.css';
import './styles/interactivity.css';
import './styles/journey.css';
import './styles/sku-flow.css';
import { renderTierPanels }             from './modules/tier-panels.js';
import { renderPerceivedValueSection }  from './modules/perceived-value.js';
import { renderChurnSection }           from './modules/churn-pipeline.js';
import { renderCausalSection }          from './modules/causal-intervention.js';
import { renderAppShell }               from './modules/app-shell.js';
import { renderOutcomesSection }        from './modules/outcomes.js';
import { renderJourneySection }         from './modules/viz-user-journey.js';
import { renderSkuFlowSection }         from './modules/sku-flow.js';
import { initScrollNarrativeSystem }    from './modules/scroll-narrative.js';

// ── Hero section ─────────────────────────────────────────────────────────────
function renderHero(container) {
  container.innerHTML = `
    <section class="narrative-section narrative-section--hero" id="hero">
      <div class="bg-orb bg-orb--blue"   style="top:-120px; left:-180px; opacity:0.22;"></div>
      <div class="bg-orb bg-orb--teal"   style="bottom:-80px; right:-120px; opacity:0.18;"></div>
      <div class="bg-orb bg-orb--purple" style="top:40%; left:55%; opacity:0.15;"></div>
      <div class="container container--narrow" style="text-align:center; position:relative; z-index:10;">
        <p class="section-label transition-fade">
          PlayStation Plus Analytics
        </p>
        <h1 class="section-title transition-fade"
            style="transition-delay:80ms; font-size:clamp(2.5rem,6vw,4.5rem);">
          Subscriber Intelligence<br>Dashboard
        </h1>
        <p class="section-subtitle transition-fade" style="transition-delay:160ms;">
          Explore tier value, engagement patterns, churn risk,
          and upgrade opportunity across 1,000 synthetic PS+ subscribers.
        </p>
        <a href="#tiers"
           class="transition-fade"
           style="
             transition-delay:240ms;
             display:inline-block;
             margin-top:var(--sp-8);
             padding:var(--sp-3) var(--sp-8);
             border:1.5px solid rgba(0,184,212,0.4);
             background:rgba(0,184,212,0.1);
             color:var(--ps-teal-light);
             border-radius:var(--radius-full);
             font-size:var(--fs-sm);
             font-weight:var(--fw-semi);
             letter-spacing:var(--ls-wide);
             text-transform:uppercase;
             text-decoration:none;
             transition:background var(--dur-base) ease, border-color var(--dur-base) ease;
           "
           onmouseover="this.style.background='rgba(0,184,212,0.2)'"
           onmouseout="this.style.background='rgba(0,184,212,0.1)'">
          Explore Tiers ↓
        </a>
      </div>
    </section>`;
}

// ── Tier section ─────────────────────────────────────────────────────────────
function renderTierSection(container) {
  const section = document.createElement('section');
  section.className = 'narrative-section narrative-section--tiers';
  section.id = 'tiers';
  section.innerHTML = `
    <div class="container">
      <header class="section-header">
        <p class="section-label transition-fade">Choose your plan</p>
        <h2 class="section-title transition-fade" style="transition-delay:60ms;">PlayStation Plus Tiers</h2>
        <p class="section-subtitle transition-fade" style="transition-delay:120ms;">
          From monthly games to a 700+ title catalogue and cloud streaming —
          find the tier that matches how you play.
        </p>
      </header>
      <div id="tier-panels-mount"></div>
    </div>`;

  container.appendChild(section);
  renderTierPanels(section.querySelector('#tier-panels-mount'));

  section.addEventListener('tier:select', (e) => {
    console.info('[PS+ Demo] Tier selected:', e.detail.tier);
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
renderAppShell();
const app = document.getElementById('app');
renderHero(app);
renderTierSection(app);
renderSkuFlowSection(app);   // Task 8: causal explainer after tiers
renderPerceivedValueSection(app);
renderChurnSection(app);
renderCausalSection(app);
renderJourneySection(app);
renderOutcomesSection(app);

// Scroll narrative must init AFTER all sections are in the DOM
initScrollNarrativeSystem();
