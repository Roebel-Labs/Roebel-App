// Whether the rail shows "Ausweise": for every signed-in user (owner decision 2026-11-19), also while
// the register is not switched on yet; the section itself explains that state. Follows sign-in and
// sign-out from the Start section.
import { useEffect, useState } from 'react';
import { loadSession } from '../workspace/session';
import { onDesktopCommand } from '../workspace/desktop';

export function useCredentialsAvailable(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let seq = 0;
    const check = async () => {
      const mine = ++seq;
      const session = await loadSession();
      if (mine === seq) setVisible(!!session);
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
