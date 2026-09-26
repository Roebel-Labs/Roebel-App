import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  defaultPopoverFrame,
  normalizeMenuGroups,
  popoverFrameFromPress,
  type ChatMenuItem,
  type PopoverFrame,
} from '@/lib/chat/sheets';
import { ChatMenuPopover, ChatMenuSheet } from './ChatMenuSheet';
import { ConfirmSheet, type ConfirmOptions } from './ConfirmSheet';
import { chatSize } from './tokens';

export type { ChatMenuItem } from '@/lib/chat/sheets';
export type { ConfirmOptions } from './ConfirmSheet';

export type OpenMenuOptions = {
  /** Flat list (one group) or several groups (separate rounded containers). */
  items: ChatMenuItem[] | ChatMenuItem[][];
  /** Sheet header (bottom sheet only). */
  title?: string;
  /**
   * Header "⋯" buttons pass their press event (or a frame) → anchored popover under the control.
   * Without an anchor the menu opens as a bottom sheet (long-press pattern).
   */
  anchor?: GestureResponderEvent | PopoverFrame | 'top-right';
};

type Entry =
  | { id: number; kind: 'sheet'; title?: string; groups: ChatMenuItem[][] }
  | { id: number; kind: 'popover'; groups: ChatMenuItem[][]; frame: PopoverFrame }
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void };

export type ChatSheetsApi = {
  openMenu: (options: OpenMenuOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ChatSheetsContext = createContext<ChatSheetsApi | null>(null);

const fallback: ChatSheetsApi = {
  openMenu: () => {
    if (__DEV__) console.warn('[chat] useChatSheets() used outside <ChatSheetsProvider>');
  },
  confirm: async () => {
    if (__DEV__) console.warn('[chat] useChatSheets() used outside <ChatSheetsProvider>');
    return false;
  },
};

/** Imperative designed menus + confirms for the chat suite: `const { openMenu, confirm } = useChatSheets()`. */
export function useChatSheets(): ChatSheetsApi {
  return useContext(ChatSheetsContext) ?? fallback;
}

/** iOS cannot present a Modal while the previous one is still dismissing. */
const IOS_REPRESENT_GAP_MS = 380;

function isPressEvent(a: unknown): a is GestureResponderEvent {
  return !!a && typeof a === 'object' && 'nativeEvent' in (a as object);
}

/**
 * Mount once (app/chat/_layout.tsx). Renders every sheet in one transparent Modal so it sits
 * above the whole route stack (incl. BotSheet / FileSheet); a GestureHandlerRootView inside
 * the Modal keeps swipe-to-dismiss working on Android.
 */
export function ChatSheetsProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [dismissSignal, setDismissSignal] = useState(0);
  const nextId = useRef(1);
  const hiddenAt = useRef(0);
  /** Id of the entry most recently shown (null = nothing on screen). */
  const shownId = useRef<number | null>(null);
  const entryRef = useRef<Entry | null>(null);
  entryRef.current = entry;
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const winWidth = useRef(win.width);
  winWidth.current = win.width;
  const safeTop = useRef(insets.top);
  safeTop.current = insets.top;

  const present = useCallback((make: (id: number) => Entry) => {
    const id = nextId.current++;
    const show = () => {
      Keyboard.dismiss();
      Haptics.selectionAsync().catch(() => {});
      // A still-open confirm that gets replaced counts as cancelled.
      const prev = entryRef.current;
      if (prev?.kind === 'confirm' && shownId.current === prev.id) prev.resolve(false);
      shownId.current = id;
      setEntry(make(id));
    };
    const since = Date.now() - hiddenAt.current;
    if (Platform.OS === 'ios' && since < IOS_REPRESENT_GAP_MS) setTimeout(show, IOS_REPRESENT_GAP_MS - since);
    else show();
  }, []);

  /**
   * A sheet finished animating out: hide the Modal first, then run the result. Running it
   * afterwards keeps navigation (e.g. the native `ultra` modal) from being presented on top of
   * the transient Modal on iOS; a follow-up sheet is delayed by `present` until the Modal is gone.
   */
  const finish = useCallback((id: number, run: () => void) => {
    if (shownId.current === id) {
      shownId.current = null;
      hiddenAt.current = Date.now();
      setEntry(null);
    }
    setTimeout(run, Platform.OS === 'ios' ? 60 : 0);
  }, []);

  const openMenu = useCallback(
    ({ items, title, anchor }: OpenMenuOptions) => {
      const groups = normalizeMenuGroups(items);
      if (groups.length === 0) return;
      if (anchor) {
        const frame: PopoverFrame =
          anchor === 'top-right'
            ? defaultPopoverFrame(safeTop.current)
            : isPressEvent(anchor)
              ? popoverFrameFromPress(anchor.nativeEvent, { windowWidth: winWidth.current, controlSize: chatSize.control })
              : anchor;
        present((id) => ({ id, kind: 'popover', groups, frame }));
      } else {
        present((id) => ({ id, kind: 'sheet', title, groups }));
      }
    },
    [present],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        present((id) => ({ id, kind: 'confirm', options, resolve }));
      }),
    [present],
  );

  const api = useMemo<ChatSheetsApi>(() => ({ openMenu, confirm }), [openMenu, confirm]);

  let content: React.ReactNode = null;
  if (entry?.kind === 'sheet') {
    const id = entry.id;
    content = (
      <ChatMenuSheet
        key={id}
        title={entry.title}
        groups={entry.groups}
        dismissSignal={dismissSignal}
        onDone={(action) => finish(id, () => action?.())}
      />
    );
  } else if (entry?.kind === 'popover') {
    const id = entry.id;
    content = (
      <ChatMenuPopover
        key={id}
        groups={entry.groups}
        frame={entry.frame}
        dismissSignal={dismissSignal}
        onDone={(action) => finish(id, () => action?.())}
      />
    );
  } else if (entry?.kind === 'confirm') {
    const { id, resolve, options } = entry;
    content = (
      <ConfirmSheet
        key={id}
        {...options}
        dismissSignal={dismissSignal}
        onDone={(ok) => finish(id, () => resolve(ok))}
      />
    );
  }

  return (
    <ChatSheetsContext.Provider value={api}>
      {children}
      <Modal
        visible={entry !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDismissSignal((n) => n + 1)}
      >
        <GestureHandlerRootView style={styles.fill}>{content}</GestureHandlerRootView>
      </Modal>
    </ChatSheetsContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default ChatSheetsProvider;
