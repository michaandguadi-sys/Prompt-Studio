/** Shared timing + cap constants. Single source of truth. */

/** Debounce window for all geocode / highlight search inputs. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Max entries in the undo/redo history stack. */
export const MAX_HISTORY = 50;

/** Throttle window for pushing entries onto the history stack —
 *  prevents slider drags from spamming 50 entries in one second. */
export const HISTORY_PUSH_THROTTLE_MS = 400;

/** localStorage key for the persisted studio state. Bump the suffix to
 *  invalidate old saves whenever the schema shape changes incompatibly. */
export const PERSIST_KEY = "prompt-studio-v3";
