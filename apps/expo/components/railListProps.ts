/**
 * Virtualization tuning shared by every horizontal card rail on Erkunden.
 * A rail sits inside a vertical ScrollView, so FlatList can only window
 * along its own axis; the defaults (10 initial items, 21 viewports) render
 * a 60-event rail almost entirely on the first frame. Five cards cover the
 * viewport plus the teased sixth; the rest mount as the user scrolls.
 */
export const RAIL_LIST_PROPS = {
  initialNumToRender: 5,
  maxToRenderPerBatch: 5,
  updateCellsBatchingPeriod: 50,
  windowSize: 3,
} as const;
