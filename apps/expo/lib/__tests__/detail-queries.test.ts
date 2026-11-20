jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/supabase-marketplace', () => ({ trackListingView: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/supabase-event-views', () => ({ recordView: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/firebase', () => ({ logEventView: jest.fn() }));
jest.mock('@/lib/query-client', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import { router } from 'expo-router';
import { queryClient } from '@/lib/query-client';
import { logEventView } from '@/lib/firebase';
import { trackListingView } from '@/lib/supabase-marketplace';
import {
  __resetDetailTracking,
  eventDetailKey,
  listingDetailKey,
  seedEventDetail,
  seedListingDetail,
  trackEventOpen,
  trackListingOpen,
} from '@/lib/queries/detailQueries';
import { openEvent, openListing } from '@/lib/navigation/openDetail';
import type { EventRecord, MarketplaceListingRecord } from '@/lib/types';

beforeEach(() => {
  queryClient.clear();
  __resetDetailTracking();
  jest.clearAllMocks();
});

it('seeds an empty event query, stale at once', () => {
  seedEventDetail({ id: 'e1', title: 'Hafenfest' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Hafenfest' });
  expect(queryClient.getQueryState(eventDetailKey('e1'))?.dataUpdatedAt).toBe(0);
});

it('never overwrites existing detail data', () => {
  queryClient.setQueryData(eventDetailKey('e1'), { id: 'e1', title: 'Full' });
  seedEventDetail({ id: 'e1', title: 'Card' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Full' });
  queryClient.setQueryData(listingDetailKey('l1'), { id: 'l1', title: 'Full' });
  seedListingDetail({ id: 'l1', title: 'Card' } as MarketplaceListingRecord);
  expect(queryClient.getQueryData(listingDetailKey('l1'))).toMatchObject({ title: 'Full' });
});

it('openEvent seeds a full record and pushes; an id-only call does not seed', () => {
  openEvent({ id: 'e1', title: 'Hafenfest' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Hafenfest' });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'e1' } });
  openEvent({ id: 'e2' });
  expect(queryClient.getQueryData(eventDetailKey('e2'))).toBeUndefined();
});

it('openListing seeds and can replace', () => {
  openListing({ id: 'l1', title: 'Massage' } as MarketplaceListingRecord, { replace: true });
  expect(queryClient.getQueryData(listingDetailKey('l1'))).toMatchObject({ title: 'Massage' });
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/marketplace/[id]', params: { id: 'l1' } });
});

it('tracks each opened id once per session', () => {
  const ev = { id: 'e1', title: 'A' } as EventRecord;
  trackEventOpen(ev, undefined);
  trackEventOpen(ev, undefined);
  expect(logEventView).toHaveBeenCalledTimes(1);
  const li = { id: 'l1' } as MarketplaceListingRecord;
  trackListingOpen(li);
  trackListingOpen(li);
  expect(trackListingView).toHaveBeenCalledTimes(1);
});
