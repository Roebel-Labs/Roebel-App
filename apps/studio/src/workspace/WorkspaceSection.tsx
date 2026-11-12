import { useCallback, useEffect, useState } from 'react';
import { clearSession, loadSession, saveSession, type StoredSession } from './session';
import { SignIn } from './SignIn';
import { Workspace } from './Workspace';
import { onDesktopCommand } from './desktop';
import { UpdateButton } from '../ui/UpdateButton';
import './workspace.css';

/** Start section: the multi-agent workspace (the main product), with pairing on first use. */
export function WorkspaceSection() {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    void loadSession().then(setSession);
  }, []);

  const signedIn = useCallback((s: StoredSession) => {
    void saveSession(s);
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    void clearSession();
    setSession(null);
  }, []);

  useEffect(() => onDesktopCommand((c) => c.kind === 'signout' && signOut()), [signOut]);

  if (session === undefined) return <div className="section placeholder">Lade …</div>;
  if (!session) return <SignIn onSignedIn={signedIn} />;
  return <Workspace token={session.token} onSignOut={signOut} footer={<UpdateButton />} />;
}
