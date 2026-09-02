/**
 * Everything the map bottom sheet shows for an organisation, fetched lazily
 * when a sheet opens on one.
 *
 * Nothing here blocks first paint: the sheet header, opening hours and action
 * row render from the PlaceItem the map already holds. This hook fills in the
 * parts that need the network — photos, reaction counts and the comment
 * thread — and reports `loading` so those sections can show a placeholder.
 *
 * Reactions and likes are optimistic: the count moves immediately and rolls
 * back if the write fails, matching how post likes already behave.
 */
import { useCallback, useEffect, useState } from 'react';

import { useUser } from '@/context/UserContext';
import { fetchAccountPhotos } from '@/lib/supabase-account-photos';
import {
  fetchAccountSaveSummary,
  fetchAccountSavers,
  fetchMyAccountSave,
  setAccountSave,
} from '@/lib/supabase-account-saves';
import {
  fetchAccountExperiences,
  createAccountExperience,
} from '@/lib/supabase-account-experiences';
import { nextSaveState, applySaveDelta } from '@/lib/map/save-state';
import {
  fetchAccountComments,
  submitAccountComment,
  submitCommentReply,
  toggleCommentLike,
} from '@/lib/supabase-account-comments';
import {
  fetchAccountRatingSummary,
  fetchAccountVoteSummary,
  fetchUserAccountVote,
  voteAccount,
  clearAccountVote,
} from '@/lib/supabase-ratings';
import type {
  AccountComment,
  AccountExperience,
  AccountPhoto,
  AccountRatingSummary,
  AccountSaveState,
  AccountSaveSummary,
  AccountVoteSummary,
  SaverProfile,
} from '@/lib/types';

export type OrgSheetData = {
  photos: AccountPhoto[];
  comments: AccountComment[];
  voteSummary: AccountVoteSummary | null;
  ratingSummary: AccountRatingSummary | null;
  myVote: 1 | -1 | null;
  saveSummary: AccountSaveSummary | null;
  savers: SaverProfile[];
  mySave: AccountSaveState | null;
  experiences: AccountExperience[];
  loading: boolean;
  /** Optimistically toggles up/down; tapping the active one clears it. */
  setVote: (vote: 1 | -1) => Promise<void>;
  /** Tapping the state the viewer already holds clears it. */
  setSave: (state: AccountSaveState) => Promise<void>;
  postExperience: (content: string, mediaUrls: string[]) => Promise<boolean>;
  postComment: (text: string, stars?: number | null) => Promise<boolean>;
  postReply: (ratingId: string, text: string) => Promise<boolean>;
  likeComment: (ratingId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const EMPTY_VOTES: AccountVoteSummary = {
  account_id: '',
  up_count: 0,
  down_count: 0,
  vote_count: 0,
  percent_liked: 0,
};

export function useOrgSheetData(accountId: string | null): OrgSheetData {
  const { user } = useUser();
  const wallet = user?.wallet_address ?? null;

  const [photos, setPhotos] = useState<AccountPhoto[]>([]);
  const [comments, setComments] = useState<AccountComment[]>([]);
  const [voteSummary, setVoteSummary] = useState<AccountVoteSummary | null>(null);
  const [ratingSummary, setRatingSummary] = useState<AccountRatingSummary | null>(null);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);
  const [saveSummary, setSaveSummary] = useState<AccountSaveSummary | null>(null);
  const [savers, setSavers] = useState<SaverProfile[]>([]);
  const [mySave, setMySave] = useState<AccountSaveState | null>(null);
  const [experiences, setExperiences] = useState<AccountExperience[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setPhotos([]);
      setComments([]);
      setVoteSummary(null);
      setRatingSummary(null);
      setMyVote(null);
      setSaveSummary(null);
      setSavers([]);
      setMySave(null);
      setExperiences([]);
      return;
    }

    setLoading(true);
    try {
      const [
        photoRows,
        commentRows,
        votes,
        ratings,
        mine,
        saves,
        saverRows,
        mySaveRow,
        experienceRows,
      ] = await Promise.all([
        fetchAccountPhotos(accountId),
        fetchAccountComments(accountId, wallet),
        fetchAccountVoteSummary(accountId),
        fetchAccountRatingSummary(accountId),
        wallet ? fetchUserAccountVote(accountId, wallet) : Promise.resolve(null),
        fetchAccountSaveSummary(accountId),
        fetchAccountSavers(accountId),
        wallet ? fetchMyAccountSave(accountId, wallet) : Promise.resolve(null),
        fetchAccountExperiences(accountId),
      ]);
      setPhotos(photoRows);
      setComments(commentRows);
      setVoteSummary(votes);
      setRatingSummary(ratings);
      setMyVote((mine?.vote as 1 | -1 | undefined) ?? null);
      setSaveSummary(saves);
      setSavers(saverRows);
      setMySave(mySaveRow?.state ?? null);
      setExperiences(experienceRows);
    } catch (err) {
      console.error('useOrgSheetData load error:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const setVote = useCallback(
    async (vote: 1 | -1) => {
      if (!accountId || !wallet) return;

      const previousVote = myVote;
      const previousSummary = voteSummary;
      const clearing = previousVote === vote;
      const next = clearing ? null : vote;

      // Optimistic: move both counters before the write lands.
      const base = voteSummary ?? { ...EMPTY_VOTES, account_id: accountId };
      let up = base.up_count;
      let down = base.down_count;
      if (previousVote === 1) up -= 1;
      if (previousVote === -1) down -= 1;
      if (next === 1) up += 1;
      if (next === -1) down += 1;
      const voteCount = up + down;

      setMyVote(next);
      setVoteSummary({
        ...base,
        up_count: up,
        down_count: down,
        vote_count: voteCount,
        percent_liked: voteCount ? Math.round((up / voteCount) * 100) : 0,
      });

      try {
        if (clearing) {
          await clearAccountVote(accountId, wallet);
        } else {
          await voteAccount({ account_id: accountId, wallet_address: wallet, vote });
        }
      } catch (err) {
        console.error('setVote failed, rolling back:', err);
        setMyVote(previousVote);
        setVoteSummary(previousSummary);
      }
    },
    [accountId, wallet, myVote, voteSummary]
  );

  const setSave = useCallback(
    async (state: AccountSaveState) => {
      if (!accountId || !wallet) return;

      const previous = mySave;
      const next = nextSaveState(previous, state);
      setMySave(next);

      // Move the counters optimistically; the rail refreshes from the server
      // afterwards because it needs the viewer's avatar and name.
      const base = saveSummary ?? {
        account_id: accountId,
        to_try_count: 0,
        been_count: 0,
        save_count: 0,
      };
      setSaveSummary(applySaveDelta(base, previous, next));

      const result = await setAccountSave(accountId, wallet, state);
      if (result !== next) {
        // Write disagreed with the optimistic guess — take the server's word.
        setMySave(result);
        setSaveSummary(await fetchAccountSaveSummary(accountId));
      }
      setSavers(await fetchAccountSavers(accountId));
    },
    [accountId, wallet, mySave, saveSummary]
  );

  const postExperience = useCallback(
    async (content: string, mediaUrls: string[]) => {
      if (!accountId || !wallet) return false;
      if (!content.trim() && !mediaUrls.length) return false;

      const created = await createAccountExperience({
        account_id: accountId,
        wallet_address: wallet,
        content,
        media_urls: mediaUrls,
      });
      if (!created) return false;
      setExperiences((prev) => [created, ...prev]);
      return true;
    },
    [accountId, wallet]
  );

  const postComment = useCallback(
    async (text: string, stars?: number | null) => {
      if (!accountId || !wallet || !text.trim()) return false;
      const saved = await submitAccountComment({
        account_id: accountId,
        wallet_address: wallet,
        comment: text,
        ...(stars !== undefined ? { stars } : {}),
      });
      if (!saved) return false;
      // Refetch rather than splice: the upsert may have replaced an older
      // comment of the viewer's, and the star summary moves with it.
      await load();
      return true;
    },
    [accountId, wallet, load]
  );

  const postReply = useCallback(
    async (ratingId: string, text: string) => {
      if (!wallet || !text.trim()) return false;
      const reply = await submitCommentReply({
        rating_id: ratingId,
        wallet_address: wallet,
        content: text,
      });
      if (!reply) return false;
      setComments((prev) =>
        prev.map((c) => (c.id === ratingId ? { ...c, replies: [...c.replies, reply] } : c))
      );
      return true;
    },
    [wallet]
  );

  const likeComment = useCallback(
    async (ratingId: string) => {
      if (!wallet) return;

      const before = comments;
      setComments((prev) =>
        prev.map((c) =>
          c.id === ratingId
            ? {
                ...c,
                liked_by_me: !c.liked_by_me,
                like_count: c.like_count + (c.liked_by_me ? -1 : 1),
              }
            : c
        )
      );

      try {
        await toggleCommentLike(ratingId, wallet);
      } catch (err) {
        console.error('likeComment failed, rolling back:', err);
        setComments(before);
      }
    },
    [wallet, comments]
  );

  return {
    photos,
    comments,
    voteSummary,
    ratingSummary,
    myVote,
    saveSummary,
    savers,
    mySave,
    experiences,
    loading,
    setVote,
    setSave,
    postExperience,
    postComment,
    postReply,
    likeComment,
    refresh: load,
  };
}
