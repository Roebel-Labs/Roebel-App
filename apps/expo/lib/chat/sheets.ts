// Pure helpers for the chat suite's designed menus / confirm sheets (components/chat/ChatSheetsProvider).

export type ChatMenuIconSet = 'ionicons' | 'feather';

export interface ChatMenuItem {
  label: string;
  /** Glyph name in `iconSet` (default Ionicons). */
  icon?: string;
  iconSet?: ChatMenuIconSet;
  destructive?: boolean;
  /** Hidden items are dropped (lets callers build menus declaratively). */
  hidden?: boolean;
  onPress: () => void;
}

/** Where a popover card sits: distance of its top edge from the window top and its right edge from the window right. */
export interface PopoverFrame {
  top: number;
  right: number;
}

/** Minimal slice of a press event (GestureResponderEvent.nativeEvent). */
export interface PressPoint {
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
}

/**
 * Accepts either a flat item list (one group) or a list of groups; drops hidden
 * items and empty groups so every rendered container has at least one row.
 */
export function normalizeMenuGroups(input: ChatMenuItem[] | ChatMenuItem[][]): ChatMenuItem[][] {
  if (input.length === 0) return [];
  const groups: ChatMenuItem[][] = Array.isArray(input[0])
    ? (input as ChatMenuItem[][])
    : [input as ChatMenuItem[]];
  return groups.map((g) => g.filter((i) => !i.hidden)).filter((g) => g.length > 0);
}

/**
 * Anchors a popover under the pressed control (ref 11, mirrored to the top right):
 * the control's frame is derived from the touch point minus its offset inside the control.
 */
export function popoverFrameFromPress(
  press: PressPoint,
  opts: { windowWidth: number; controlSize: number; gap?: number; minEdge?: number },
): PopoverFrame {
  const gap = opts.gap ?? 8;
  const minEdge = opts.minEdge ?? 9;
  const controlLeft = press.pageX - press.locationX;
  const controlTop = press.pageY - press.locationY;
  const right = Math.max(minEdge, opts.windowWidth - (controlLeft + opts.controlSize));
  return { top: Math.max(0, controlTop + opts.controlSize + gap), right };
}

/** Fallback anchor when no press event is available: under a top-right header control. */
export function defaultPopoverFrame(safeTop: number, controlSize = 44): PopoverFrame {
  return { top: safeTop + 8 + controlSize + 8, right: 18 };
}
