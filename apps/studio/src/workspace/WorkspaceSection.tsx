import { useCallback, useEffect, useState } from 'react';
import { clearSession, loadSession, saveSession, type StoredSession } from './session';
import { SignIn } from './SignIn';
import { Workspace } from './Workspace';
import { emitCommand, onDesktopCommand } from './desktop';
import { UpdateButton } from '../ui/UpdateButton';
import { SkChat, SkThreads, Skeleton } from '../ui/Skeleton';
import './workspace.css';

/** Start section: the multi-agent workspace (the main product), with pairing on first use. */
export function WorkspaceSection() {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    void loadSession().then(setSession);
  }, []);

  const signedIn = useCallback((s: StoredSession) => {
    void saveSession(s).then(() => emitCommand({ kind: 'signedin' }));
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    void clearSession();
    setSession(null);
  }, []);

  useEffect(() => onDesktopCommand((c) => c.kind === 'signout' && signOut()), [signOut]);

  // Session still being read: the workspace's own shape (list column + conversation) as a skeleton.
  if (session === undefined)
    return (
      <div className="ws" aria-busy="true">
        <aside className="ws-list">
          <Skeleton h={60} style={{ borderRadius: 14 }} />
          <Skeleton h={34} w={96} style={{ borderRadius: 17 }} />
          <SkThreads />
        </aside>
        <section className="ws-chat">
          <SkChat />
        </section>
      </div>
    );
  if (!session) return <SignIn onSignedIn={signedIn} />;
  return <Workspace token={session.token} onSignOut={signOut} footer={<UpdateButton />} />;
}
