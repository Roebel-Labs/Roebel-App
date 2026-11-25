import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MinimalAIChat } from '@/components/ai/MinimalAIChat';
import EventChatHeader from '@/components/ai/EventChatHeader';
import { useChatTokens } from '@/components/chat/tokens';

/** Event submission with Mecky, in the agent-chat look. */
export default function AISubmitScreen() {
  const t = useChatTokens();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]} edges={['top']}>
      <EventChatHeader />
      <MinimalAIChat />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
