import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { ChatMessage, ChatPart } from '@/lib/chat/types';
import { MessageBubble, BubbleText } from './MessageBubble';
import { OptionsCard } from './OptionsCard';
import { FileCard } from './FileCard';
import { IntegrationCard } from './IntegrationCard';
import { CalendarEventCard } from './CalendarEventCard';
import { SourcesLinks } from './SourcesLinks';
import { ApprovalCard, type ApprovalPart } from './ApprovalCard';
import { TaskCard } from './TaskCard';
import { GeneratedImageCard } from './GeneratedImageCard';
import { ReplyQuote } from './ReplyQuote';
import { chatFont, useChatTokens } from './tokens';

type FilePart = Extract<ChatPart, { type: 'file' }>;
type IntegrationPart = Extract<ChatPart, { type: 'integration' }>;

export type MessagePartsProps = {
  message: ChatMessage;
  /** Streaming bot text that is not yet in `parts` (appended as a text bubble). */
  streamingText?: string;
  onLongPress?: (message: ChatMessage) => void;
  onOptionSelect?: (message: ChatMessage, key: string) => void;
  onFilePress?: (part: FilePart) => void;
  onIntegrationAuthorize?: (part: IntegrationPart, message: ChatMessage, index: number) => void;
  /** calendar_event part: "Zum Kalender hinzufügen" (resolves when the OS sheet closed). */
  onCalendarAdd?: (message: ChatMessage, index: number) => Promise<unknown> | void;
  onCalendarDismiss?: (message: ChatMessage, index: number) => void;
  /** approval part: "Freigeben" / "Mit Wallet bestätigen" (resolves when the stream ended). */
  onApprovalApprove?: (part: ApprovalPart, message: ChatMessage, opts: { alwaysAllow: boolean }) => Promise<unknown> | void;
  onApprovalReject?: (part: ApprovalPart, message: ChatMessage) => Promise<unknown> | void;
  /** "Abbrechen" on a live task card (background task). */
  onTaskCancel?: (taskId: string) => Promise<unknown> | void;
  /** A turn is streaming in this thread: approval buttons are inactive. */
  approvalsDisabled?: boolean;
  onImagePress?: (url: string) => void;
  onLinkPress?: (url: string) => void;
  /** Reaction chips below the message. */
  onReactionPress?: (emoji: string) => void;
  style?: StyleProp<ViewStyle>;
};

// [title](url) | **bold** | bare https URL
const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+)/g;

/** Minimal inline markdown: links (blue underlined), bold. */
export function InlineMarkdownText({
  text,
  role,
  onLinkPress,
}: {
  text: string;
  role: 'user' | 'bot';
  onLinkPress?: (url: string) => void;
}) {
  const t = useChatTokens();
  const linkColor = role === 'user' ? '#9CC3FF' : t.link;
  const open = (url: string) => (onLinkPress ? onLinkPress(url) : Linking.openURL(url).catch(() => {}));
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  let k = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      const url = m[2];
      nodes.push(
        <Text key={k++} onPress={() => open(url)} style={{ color: linkColor, textDecorationLine: 'underline' }}>
          {m[1]}
        </Text>,
      );
    } else if (m[3]) {
      nodes.push(
        <Text key={k++} style={{ fontFamily: chatFont.semiBold }}>
          {m[3]}
        </Text>,
      );
    } else if (m[4]) {
      const url = m[4];
      nodes.push(
        <Text key={k++} onPress={() => open(url)} style={{ color: linkColor, textDecorationLine: 'underline' }}>
          {url}
        </Text>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <BubbleText role={role}>{nodes}</BubbleText>;
}

/** Plain-text preview of a message (for reply quotes / list previews). */
export function messagePreview(parts: ChatPart[]): string {
  for (const p of parts) {
    if (p.type === 'text' && p.text.trim()) return p.text.replace(/\s+/g, ' ').trim();
    if (p.type === 'options') return p.question;
    if (p.type === 'file') return p.name;
    if (p.type === 'image') return 'Bild';
    if (p.type === 'integration') return p.title;
    if (p.type === 'calendar_event') return p.title;
    if (p.type === 'approval') return p.title;
    if (p.type === 'task') return p.title;
    if (p.type === 'generated_image') return 'Bild';
  }
  return '';
}

/**
 * Renders one ChatMessage as a stack of bubbles — one per part, like the
 * refs (text, file card and options card are separate bubbles).
 */
export function MessageParts({
  message,
  streamingText,
  onLongPress,
  onOptionSelect,
  onFilePress,
  onIntegrationAuthorize,
  onCalendarAdd,
  onCalendarDismiss,
  onApprovalApprove,
  onApprovalReject,
  onTaskCancel,
  approvalsDisabled,
  onImagePress,
  onLinkPress,
  onReactionPress,
  style,
}: MessagePartsProps) {
  const t = useChatTokens();
  const role: 'user' | 'bot' = message.role === 'user' ? 'user' : 'bot';
  const lp = onLongPress ? () => onLongPress(message) : undefined;
  const parts: ChatPart[] = streamingText ? [...message.parts, { type: 'text', text: streamingText }] : message.parts;
  const reactions = Object.entries(message.reactions ?? {}).filter(([, n]) => n > 0);

  if (message.role === 'system') {
    return (
      <Text style={[styles.system, { color: t.textTertiary }]}>{messagePreview(message.parts)}</Text>
    );
  }

  return (
    <View style={[styles.stack, style]}>
      {message.replyTo ? <ReplyQuote preview={message.replyTo.preview} align={role === 'user' ? 'right' : 'left'} /> : null}
      {parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        switch (part.type) {
          case 'text':
            if (!part.text.trim()) return null;
            return (
              <MessageBubble key={key} role={role} onLongPress={lp}>
                <InlineMarkdownText text={part.text} role={role} onLinkPress={onLinkPress} />
              </MessageBubble>
            );
          case 'options':
            return (
              <OptionsCard
                key={key}
                question={part.question}
                options={part.options}
                selected={part.selected}
                dismissed={part.dismissed}
                onSelect={onOptionSelect ? (k) => onOptionSelect(message, k) : undefined}
                onLongPress={lp}
              />
            );
          case 'file':
            return (
              <FileCard
                key={key}
                name={part.name}
                ext={part.ext}
                size={part.size}
                onPress={() => onFilePress?.(part)}
                onLongPress={lp}
              />
            );
          case 'image': {
            const w = 224;
            const ratio = part.width && part.height ? part.height / part.width : 4 / 3;
            const h = Math.max(120, Math.min(320, Math.round(w * ratio)));
            return (
              <Pressable
                key={key}
                onPress={() => onImagePress?.(part.url)}
                onLongPress={lp}
                style={[styles.image, role === 'user' ? styles.right : styles.left]}
              >
                <Image source={{ uri: part.url }} style={{ width: w, height: h }} contentFit="cover" transition={150} />
              </Pressable>
            );
          }
          case 'integration':
            return (
              <IntegrationCard
                key={key}
                provider={part.provider}
                title={part.title}
                description={part.description}
                status={part.status}
                onAuthorize={() => onIntegrationAuthorize?.(part, message, i)}
              />
            );
          case 'calendar_event':
            return (
              <CalendarEventCard
                key={key}
                title={part.title}
                start={part.start}
                end={part.end}
                location={part.location}
                status={part.status}
                onAdd={onCalendarAdd ? () => onCalendarAdd(message, i) : undefined}
                onDismiss={onCalendarDismiss ? () => onCalendarDismiss(message, i) : undefined}
                onLongPress={lp}
              />
            );
          case 'approval':
            return (
              <ApprovalCard
                key={key}
                part={part}
                disabled={approvalsDisabled}
                onApprove={onApprovalApprove ? (opts) => onApprovalApprove(part, message, opts) : undefined}
                onReject={onApprovalReject ? () => onApprovalReject(part, message) : undefined}
                onLongPress={lp}
              />
            );
          case 'task':
            return (
              <TaskCard
                key={key}
                part={part}
                onLongPress={lp}
                onCancel={onTaskCancel ? async () => { await onTaskCancel(part.taskId); } : undefined}
              />
            );
          case 'generated_image':
            return <GeneratedImageCard key={`${message.id}-img-${part.imageId}`} part={part} onPress={onImagePress} />;
          case 'sources':
            if (!part.items.length) return null;
            return (
              <MessageBubble key={key} role="bot" onLongPress={lp}>
                <SourcesLinks items={part.items} onLinkPress={onLinkPress} />
              </MessageBubble>
            );
          default:
            return null;
        }
      })}
      {reactions.length ? (
        <View style={[styles.reactions, role === 'user' ? styles.right : styles.left]}>
          {reactions.map(([emoji, n]) => (
            <Pressable
              key={emoji}
              onPress={() => onReactionPress?.(emoji)}
              style={[styles.reaction, { backgroundColor: t.chipBackground }]}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {n > 1 ? <Text style={[styles.reactionCount, { color: t.textSecondary }]}>{n}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  image: { borderRadius: 22, overflow: 'hidden' },
  system: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginVertical: 6 },
  reactions: { flexDirection: 'row', gap: 6, marginTop: -2 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, borderRadius: 13, paddingHorizontal: 8 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontFamily: chatFont.medium, fontSize: 13 },
});

export default MessageParts;
