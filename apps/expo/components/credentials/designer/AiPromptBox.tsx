/**
 * AI help in the touch designer (plan D5): "Beschreibe das Bild" + "Erzeugen". The server
 * generates, marks and stores the image; `onResult` applies it. The entered text survives a
 * failure (offline, limit, time) so it can be sent again; the message is shown below.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addLayer, newLayerId, type CardDesign } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import {
  designErrorMessage,
  type AiBackgroundResult,
  type AiKind,
  type AiStickerResult,
  type DesignResult,
} from '@/lib/credreg/designs';

export const AI_PROMPT_MIN = 3;
export const AI_PROMPT_MAX = 300;

export type AiGenerate = {
  background: (prompt: string) => Promise<DesignResult<AiBackgroundResult>>;
  sticker: (prompt: string) => Promise<DesignResult<AiStickerResult>>;
};

/** The design change of a result: the new background, or a new top sticker layer marked `ai`. */
export function placeAiResult(kind: AiKind, r: AiBackgroundResult | AiStickerResult): (d: CardDesign) => CardDesign {
  if (kind === 'background') return (d) => ({ ...d, background: (r as AiBackgroundResult).background });
  const layer = (r as AiStickerResult).layer;
  return (d) => addLayer(d, { ...layer, id: newLayerId(d), ai: true });
}

type Props = {
  kind: AiKind;
  generate: AiGenerate;
  /** Applies the result (and may close the sheet); `notice` when the sticker kept its background. */
  onResult: (change: (d: CardDesign) => CardDesign, notice?: string) => void;
};

export default function AiPromptBox({ kind, generate, onResult }: Props) {
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const len = prompt.trim().length;
  const ready = len >= AI_PROMPT_MIN && len <= AI_PROMPT_MAX && !running;

  const go = async () => {
    if (!ready) return;
    setRunning(true);
    setMessage(null);
    try {
      const res = kind === 'background' ? await generate.background(prompt.trim()) : await generate.sticker(prompt.trim());
      if (!res.ok) {
        setMessage(designErrorMessage(res));
        return;
      }
      onResult(placeAiResult(kind, res.data), 'notice' in res.data ? res.data.notice : undefined);
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={[styles.box, { borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Beschreibe das Bild</Text>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Müritz bei Sonnenuntergang, ruhig, blau"
        placeholderTextColor={colors.textSecondary}
        maxLength={AI_PROMPT_MAX}
        editable={!running}
        returnKeyType="go"
        onSubmitEditing={() => void go()}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
        accessibilityLabel="Beschreibe das Bild"
        testID={`ai-prompt-${kind}`}
      />
      <Pressable
        onPress={() => void go()}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel={kind === 'background' ? 'Hintergrund erzeugen' : 'Sticker erzeugen'}
        accessibilityState={{ disabled: !ready, busy: running }}
        style={[styles.button, { backgroundColor: colors.primary }, !ready && styles.disabled]}
        testID={`ai-generate-${kind}`}
      >
        {running ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Erzeugen</Text>}
      </Pressable>
      {running ? <Text style={[styles.note, { color: colors.textSecondary }]}>Wird erzeugt … (bis zu einer Minute)</Text> : null}
      {message ? <Text style={[styles.note, { color: colors.error }]} testID={`ai-message-${kind}`}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  label: { fontSize: 13, fontFamily: fontFamily.medium },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 44, fontSize: 15, fontFamily: fontFamily.regular },
  button: { borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.5 },
  note: { fontSize: 13, fontFamily: fontFamily.regular },
});
