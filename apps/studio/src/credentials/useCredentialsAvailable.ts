// Whether the rail shows "Ausweise": only when the register is switched on and the signed-in user is
// owner or admin of at least one org (owner default of plan credreg-5, open question 2). Absent, not
// greyed out, otherwise. Follows sign-in and sign-out from the Start section.
import { useEffect, useState } from 'react';
import { loadSession } from '../workspace/session';
import { onDesktopCommand } from '../workspace/desktop';
import { credentialsVisible, fetchOrgs, fetchStatus } from './api';

export function useCredentialsAvailable(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let seq = 0;
    const check = async () => {
      const mine = ++seq;
      const session = await loadSession();
      if (!session) return mine === seq && setVisible(false);
      const status = await fetchStatus();
      if (!status.enabled) return mine === seq && setVisible(false);
      const orgs = await fetchOrgs(session.token).catch(() => null);
      if (mine === seq) setVisible(credentialsVisible(status, orgs));
    };
    void check();
    const off = onDesktopCommand((c) => {
      if (c.kind === 'signedin' || c.kind === 'signout') void check();
    });
    return () => {
      seq++;
      off();
    };
  }, []);
  return visible;
}
