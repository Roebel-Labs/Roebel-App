/**
 * Erkunden slot for at most one mini-app suggestion (lib/miniapp-suggestions.ts). Matching runs
 * on the device; nothing about the match is logged or sent. Renders nothing for a person
 * without fitting apps.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from '@/context/AccountContext';
import { fetchLiveMiniApps } from '@/lib/miniapps';
import { useMatchCredentials } from '@/lib/miniapp-credentials';
import { orgIdsOf } from '@/lib/miniapp-open';
import { miniAppBlockId, miniAppSlugOf, useExploreLayout } from '@/lib/explore-layout';
import { markSuggested, pickSuggestion, readSuggestQueue, readSuggested } from '@/lib/miniapp-suggestions';
import MiniAppSuggestionCard from './MiniAppSuggestionCard';

export default function MiniAppSuggestion() {
  const { data: apps } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });
  const { held, ready } = useMatchCredentials();
  const { ownedAccounts } = useAccount();
  const myOrgIds = useMemo(() => orgIdsOf(ownedAccounts), [ownedAccounts]);
  const { ready: layoutReady, layout, save } = useExploreLayout();

  const [stored, setStored] = useState<{ suggested: string[]; queue: string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([readSuggested(), readSuggestQueue()]).then(([suggested, queue]) => {
      if (alive) setStored({ suggested, queue });
    });
    return () => {
      alive = false;
    };
  }, []);

  const pinned = useMemo(
    () => layout.order.map(miniAppSlugOf).filter((s): s is string => !!s),
    [layout.order],
  );
  const app = useMemo(
    () =>
      apps && ready && layoutReady && stored
        ? pickSuggestion({
            apps,
            held,
            myOrgIds,
            pinned,
            alreadySuggested: stored.suggested,
            queuedOrgIds: stored.queue,
          })
        : null,
    [apps, ready, layoutReady, stored, held, myOrgIds, pinned],
  );
  if (!app) return null;

  const done = () => {
    setStored((s) => (s ? { ...s, suggested: [...s.suggested, app.slug] } : s));
    void markSuggested(app.slug);
  };
  return (
    <MiniAppSuggestionCard
      app={app}
      onAccept={() => {
        void save({ ...layout, order: [...layout.order, miniAppBlockId(app.slug)] });
        done();
      }}
      onDismiss={done}
    />
  );
}
