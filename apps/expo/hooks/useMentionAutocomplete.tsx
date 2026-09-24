import React, { useState } from 'react';
import { Text, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import {
  activeMentionQuery,
  applyMention,
  matchMentionables,
  splitMentions,
  type Mentionable,
} from '@/lib/mentions';

type Selection = { start: number; end: number };

/**
 * @-mention support for a controlled multiline TextInput.
 *
 * - `suggestions`: mentionables matching the "@query" before the cursor
 *   (typing just "@" proposes @Mecky).
 * - `pick(m)`: replaces the "@query" with "@Handle " and moves the cursor
 *   behind it.
 * - `children`: the draft as styled Text spans — pass as the TextInput's
 *   children (instead of `value`) so mentions render in `mentionColor`
 *   while typing.
 */
export function useMentionAutocomplete(
  value: string,
  onChangeText: (text: string) => void,
  mentionColor: string,
) {
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  // Set only right after a pick, so the cursor lands behind the mention;
  // released on the next native selection event.
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);

  const cursor = Math.min(selection.end, value.length);
  const query = selection.start === selection.end ? activeMentionQuery(value, cursor) : null;
  const suggestions: Mentionable[] = query ? matchMentionables(query.query) : [];

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(e.nativeEvent.selection);
    if (forcedSelection) setForcedSelection(undefined);
  };

  const pick = (m: Mentionable) => {
    if (!query) return;
    const next = applyMention(value, query.start, cursor, m.handle);
    onChangeText(next.text);
    const sel = { start: next.cursor, end: next.cursor };
    setSelection(sel);
    setForcedSelection(sel);
  };

  const children = splitMentions(value).map((t, i) =>
    t.type === 'mention' ? (
      <Text key={i} style={{ color: mentionColor }}>
        {t.value}
      </Text>
    ) : (
      <Text key={i}>{t.value}</Text>
    ),
  );

  return { suggestions, pick, onSelectionChange, selection: forcedSelection, children };
}
