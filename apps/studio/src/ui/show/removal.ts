// What removing a source tile does, and whether that would touch the live picture.

import type { Action } from '../../state/reducer';
import type { ShowState } from '../../state/types';

/** `externalSourceId`: the tile is a runtime stream (Live-Raum guest); its owner must end it, not just the reducer. */
export type RemovalPlan = { action: Action; affectedSceneIds: string[]; blockedByLive: boolean; externalSourceId?: string };

/** Scenes on air right now: program, plus the outgoing scene of a running transition. */
export function liveSceneIds(s: ShowState): Set<string> {
  const ids = new Set<string>();
  if (s.programSceneId) ids.add(s.programSceneId);
  if (s.transition.startedAt !== null && s.transition.fromSceneId) ids.add(s.transition.fromSceneId);
  return ids;
}

/**
 * A full-frame scene is "the source" for the operator: its source goes too (cascading into every
 * split / picture-in-picture that uses it) unless another scene still needs it.
 */
export function removalPlan(s: ShowState, sceneId: string): RemovalPlan {
  const scene = s.scenes.find((x) => x.id === sceneId);
  if (!scene) return { action: { type: 'removeScene', id: sceneId }, affectedSceneIds: [], blockedByLive: false };
  const only = scene.layout === 'full' && scene.sourceIds.length === 1 ? scene.sourceIds[0] : null;
  const others = only === null ? [] : s.scenes.filter((x) => x.id !== scene.id && x.sourceIds.includes(only));
  const usedInFullElsewhere = others.some((x) => x.layout === 'full');
  let action: Action;
  let affected: string[];
  if (only !== null && !usedInFullElsewhere) {
    action = { type: 'removeSource', id: only };
    affected = s.scenes.filter((x) => x.sourceIds.includes(only)).map((x) => x.id);
  } else {
    action = { type: 'removeScene', id: scene.id };
    affected = [scene.id];
  }
  const live = liveSceneIds(s);
  const plan: RemovalPlan = { action, affectedSceneIds: affected, blockedByLive: affected.some((id) => live.has(id)) };
  if (action.type === 'removeSource' && s.sources.some((x) => x.id === action.id && x.kind === 'external')) plan.externalSourceId = action.id;
  return plan;
}
