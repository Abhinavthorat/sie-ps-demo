/**
 * lib/viz-state.js
 * Lightweight event bus + shared selection state for cross-visualization linking.
 * Any module can emit("brush:update", payload) and every subscriber fires.
 */

const _handlers = {};

export const vizBus = {
  on(event, fn) {
    (_handlers[event] ??= []).push(fn);
    return () => {
      _handlers[event] = (_handlers[event] ?? []).filter(h => h !== fn);
    };
  },
  emit(event, data) {
    (_handlers[event] ?? []).forEach(fn => fn(data));
  },
};

/**
 * Shared selection state written by scatter brush,
 * read by heatmap and any future subscriber.
 * Shape: { users: User[], cellKeys: Set<"tier|segment"> } | null
 */
export const selectionState = {
  current: null,

  set(users) {
    const cellKeys = new Set(users.map(u => `${u.tier}|${u.segment}`));
    this.current = users.length ? { users, cellKeys } : null;
    vizBus.emit('selection:change', this.current);
  },

  clear() {
    this.current = null;
    vizBus.emit('selection:change', null);
  },
};
