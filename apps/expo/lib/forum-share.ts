import { Share } from 'react-native';

/** Deep link into the app; a web URL arrives with the web forum (spec §A2.3). */
const threadLink = (threadId: string) => `roebel://forum/thread/${threadId}`;

export async function shareForumThread(title: string, threadId: string): Promise<void> {
  try {
    await Share.share({ message: `${title}\n${threadLink(threadId)}` });
  } catch (err) {
    console.error('Error sharing forum thread:', err);
  }
}

export async function shareForumReply(body: string, threadId: string): Promise<void> {
  const excerpt = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  try {
    await Share.share({ message: `„${excerpt}“\n${threadLink(threadId)}` });
  } catch (err) {
    console.error('Error sharing forum reply:', err);
  }
}
