// Whether the card designer is open (GET /api/credentials/status → designer). Null while loading;
// unreadable = closed. Independent of the register gate: drafting opens before issuing.
import { useEffect, useState } from 'react';
import { fetchCredentialStatus } from '@/lib/credreg/designs';

export function useDesignerOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCredentialStatus().then((s) => { if (alive) setOpen(s.designer); });
    return () => { alive = false; };
  }, []);
  return open;
}
