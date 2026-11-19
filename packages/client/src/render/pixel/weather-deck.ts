/**
 * The weather's own cloud: one long dark deck just over the map that the rain or snow falls out
 * of (Joel: "have more clouds during rain that creates the rain instead of filling the full
 * map"). Rows are cells above the map's top edge. The scenery shader draws the deck between
 * `DECK_BASE` and `DECK_TOP` (ragged at both), and the weather starts at `DECK_START`, inside
 * it, so every drop comes out of its belly. A drop is in the air for a few seconds instead of
 * the fifteen it took from the top of the tallest sky a view can show.
 */
export const DECK_BASE = 44;
export const DECK_TOP = 150;
export const DECK_START = 96;
