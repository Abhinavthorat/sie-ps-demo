/**
 * lib/state.js
 * Global reactive store for Task 6 cross-graph filtering.
 *
 * Single source of truth for:
 *   tier         — active heatmap cell tier filter (or null = all)
 *   segment      — active segment filter from scatter dropdown (or null = all)
 *   brushedUsers — array from scatter brush (or null = no brush)
 *   intervention — active causal intervention key
 *
 * Usage:
 *   import { store } from '../lib/state.js';
 *   const unsub = store.subscribe(state => { ... });
 *   store.set({ tier: 'essential' });   // partial patch
 *   store.reset();                       // back to all-users
 */

const DEFAULT = {
  tier:         null,
  segment:      null,
  brushedUsers: null,
  intervention: 'upgrade-offer',
};

function createStore(initial) {
  let state = { ...initial };
  const subs = [];

  return {
    /** Current snapshot (do not mutate directly) */
    get() { return { ...state }; },

    /** Partial patch — only keys provided are changed */
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach(fn => fn(state));
    },

    /** Reset to full-population view (all filters off) */
    reset() {
      state = { ...initial, intervention: state.intervention };
      subs.forEach(fn => fn(state));
    },

    /**
     * Subscribe to every state change.
     * Returns an unsubscribe function.
     */
    subscribe(fn) {
      subs.push(fn);
      return () => {
        const i = subs.indexOf(fn);
        if (i !== -1) subs.splice(i, 1);
      };
    },

    /**
     * Derive the active user set from current filter state.
     * Pass the full users array; get back the filtered subset.
     */
    filterUsers(allUsers) {
      let out = allUsers;
      if (state.tier)    out = out.filter(u => u.tier    === state.tier);
      if (state.segment) out = out.filter(u => u.segment === state.segment);
      if (state.brushedUsers && state.brushedUsers.length > 0) {
        const brushedIds = new Set(state.brushedUsers.map(u => u.id));
        out = out.filter(u => brushedIds.has(u.id));
      }
      return out;
    },

    /** True if any filter is active */
    isFiltered() {
      return !!(state.tier || state.segment || state.brushedUsers?.length);
    },
  };
}

export const store = createStore(DEFAULT);
