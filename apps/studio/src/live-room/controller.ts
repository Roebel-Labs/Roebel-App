// Live-Raum runtime: one module-level controller, so Realtime, alerts, guests and the on-stage sync keep
// running while the operator is on another tab (as long as something keeps it bound — see LiveRoomRuntime).
// The studio token lives only here and in the controller's own localStorage key; it is never logged.

import type { Action } from '../state/reducer';
import type { ShowState, Table, Template } from '../state/types';
import { AlertQueue, type SupportAlert } from './alerts';
import { adminCall, errorMessage, fetchChat, fetchRundown, fetchShow, fetchShows, LiveApiError } from './api';
import { LIVE_ROOM_STORAGE_KEY } from './config';
import { isJoined, joinGuest, leaveGuest, resyncGuestSources } from './guests';
import { subscribeShow, type RealtimeState } from './realtime';
import { guessColumnMap, mapRowsToItems, resolveItemForRow, sanitizeColumnMap, tableToRundown, type ColumnMap } from './rundown';
import { liveRoomChatHighlight, liveRoomDonation, liveRoomSeams, type OnAirSource } from './seams';
import { decideOnStage, followOnAir } from './stage-sync';
import type { ChatMessage, GuestJoin, GuestRequest, LiveShow, LiveShowStatus, RundownItem } from './types';

// ---------------------------------------------------------------- persistence

type Persisted = {
  v: 1;
  token: string;
  showId: string | null;
  autoStage: boolean;
  autoAlerts: boolean;
  autoFollowAir: boolean;
  alertSeconds: number;
  columnMap: ColumnMap | null;
  /** showId → studio row id → rundown item id (from the last "Tabelle → App"). */
  rowMaps: Record<string, Record<string, string>>;
};

const DEFAULTS: Persisted = {
  v: 1,
  token: '',
  showId: null,
  autoStage: true,
  autoAlerts: true,
  autoFollowAir: true,
  alertSeconds: 8,
  columnMap: null,
  rowMaps: {},
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LIVE_ROOM_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...DEFAULTS,
      ...v,
      token: typeof v.token === 'string' ? v.token : '',
      rowMaps: v.rowMaps && typeof v.rowMaps === 'object' ? v.rowMaps : {},
      alertSeconds: typeof v.alertSeconds === 'number' && v.alertSeconds >= 3 && v.alertSeconds <= 30 ? v.alertSeconds : 8,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(LIVE_ROOM_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // never crash the show over storage
  }
}

// ---------------------------------------------------------------- snapshot

export type ConnState = { state: 'idle' | 'testing' | 'ok' | 'error'; message: string | null };

export type Snapshot = Persisted & {
  shows: LiveShow[];
  showsError: string | null;
  show: LiveShow | null;
  rundown: RundownItem[];
  chat: ChatMessage[];
  realtime: RealtimeState;
  viewers: number | null;
  reactionsPerMin: number;
  conn: ConnState;
  pendingAlerts: SupportAlert[];
  currentAlert: SupportAlert | null;
  alertError: string | null;
  supportTotal: { cents: number; count: number };
  guests: GuestRequest[];
  livekit: boolean | null;
  guestError: string | null;
  stageNote: string | null;
  stageError: string | null;
  stageSending: boolean;
  /** The studio went off air while the app still says LIVE: ask before ending it there. */
  askEnd: boolean;
  studioOnAir: boolean | null;
  followError: string | null;
};

type Bound = { dispatch: (a: Action) => void; getState: () => ShowState };

const CHAT_CAP = 300;
const CHAT_POLL_MS = 5000;
const GUEST_POLL_MS = 2000;
const STAGE_DEBOUNCE_MS = 1200;

const chatHighlightTemplate = (s: ShowState): Template | undefined =>
  s.templates.find((t) => (t.kind as string) === 'chatHighlight' || t.id === 'chat-highlight');

class LiveRoomController {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private alerts = new AlertQueue();
  private bound: Bound | null = null;
  private unsubRealtime: (() => void) | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private reactTimes: number[] = [];
  private chatRefetch: ReturnType<typeof setTimeout> | null = null;
  private alertTimer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;
  private stageTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHandledRowId: string | null = null;
  private stageBaseline = true;
  private lastTable: Table | null = null;
  private onAirSource: OnAirSource | null = null;
  private onAirUnsub: (() => void) | null = null;
  private prevOn: boolean | null = null;
  private guestPollBusy = false;
  private started = false;

  constructor() {
    const p = load();
    this.snap = {
      ...p,
      shows: [],
      showsError: null,
      show: null,
      rundown: [],
      chat: [],
      realtime: 'off',
      viewers: null,
      reactionsPerMin: 0,
      conn: { state: 'idle', message: null },
      pendingAlerts: [],
      currentAlert: null,
      alertError: null,
      supportTotal: { cents: 0, count: 0 },
      guests: [],
      livekit: null,
      guestError: null,
      stageNote: null,
      stageError: null,
      stageSending: false,
      askEnd: false,
      studioOnAir: null,
      followError: null,
    };
  }

  // ---- store plumbing
  get = (): Snapshot => this.snap;
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of [...this.listeners]) l();
  }
  private persist(patch: Partial<Persisted>) {
    this.set(patch);
    const s = this.snap;
    save({
      v: 1,
      token: s.token,
      showId: s.showId,
      autoStage: s.autoStage,
      autoAlerts: s.autoAlerts,
      autoFollowAir: s.autoFollowAir,
      alertSeconds: s.alertSeconds,
      columnMap: s.columnMap,
      rowMaps: s.rowMaps,
    });
  }

  /** Idempotent: loads the show list, reconnects the remembered show, starts the background loops. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.refreshShows();
    if (this.snap.showId) void this.selectShow(this.snap.showId);
    this.timers.push(setInterval(() => void this.pollChat(), CHAT_POLL_MS));
    this.timers.push(setInterval(() => void this.pollGuests(), GUEST_POLL_MS));
    this.timers.push(setInterval(() => this.recountReactions(), 2000));
    liveRoomSeams.subscribe(() => {
      resyncGuestSources();
      this.attachOnAir(this.onAirSource);
    });
  }

  /** Several bridges may be mounted (runtime + panel); the newest one wins, unmounting falls back. */
  bind(b: Bound): () => void {
    this.bindings.push(b);
    this.bound = b;
    this.playNext();
    return () => {
      this.bindings = this.bindings.filter((x) => x !== b);
      this.bound = this.bindings[this.bindings.length - 1] ?? null;
    };
  }
  private bindings: Bound[] = [];

  private call<T>(action: string, extra?: Record<string, unknown>): Promise<T> {
    const id = this.snap.show?.id ?? this.snap.showId;
    if (!id) return Promise.reject(new LiveApiError('NO_SHOW', 'Bitte zuerst eine Übertragung wählen.', 0));
    return adminCall<T>(this.snap.token, id, action, extra);
  }

  // ---- connection
  setToken(token: string) {
    this.persist({ token: token.trim() });
    this.set({ conn: { state: 'idle', message: null } });
  }

  async testConnection(): Promise<void> {
    this.set({ conn: { state: 'testing', message: null } });
    try {
      const r = await this.call<{ requests: GuestRequest[]; livekit: boolean }>('guest_list');
      this.set({ conn: { state: 'ok', message: null }, livekit: r.livekit, guests: r.requests });
    } catch (e) {
      this.set({ conn: { state: 'error', message: errorMessage(e) } });
    }
  }

  async refreshShows(): Promise<void> {
    try {
      this.set({ shows: await fetchShows(), showsError: null });
    } catch (e) {
      this.set({ showsError: errorMessage(e) });
    }
  }

  async selectShow(showId: string | null): Promise<void> {
    this.unsubRealtime?.();
    this.unsubRealtime = null;
    this.alerts.reset();
    this.reactTimes = [];
    this.lastHandledRowId = null;
    this.stageBaseline = true;
    this.prevOn = null;
    this.persist({ showId });
    this.set({
      show: null,
      rundown: [],
      chat: [],
      viewers: null,
      reactionsPerMin: 0,
      realtime: 'off',
      pendingAlerts: [],
      supportTotal: { cents: 0, count: 0 },
      guests: [],
      stageNote: null,
      stageError: null,
      askEnd: false,
      conn: { state: 'idle', message: null },
    });
    if (!showId) return;
    try {
      const [show, rundown, chat] = await Promise.all([fetchShow(showId), fetchRundown(showId), fetchChat(showId)]);
      if (this.snap.showId !== showId) return;
      this.alerts.seed(chat);
      this.set({ show, rundown, chat: chat.filter((m) => !m.hidden_at).slice(-CHAT_CAP), supportTotal: this.alerts.total });
    } catch (e) {
      this.set({ showsError: errorMessage(e) });
    }
    if (this.snap.showId !== showId) return;
    this.unsubRealtime = subscribeShow(showId, {
      onState: (realtime) => this.set({ realtime }),
      onShow: (s) => this.snap.show && this.set({ show: { ...this.snap.show, ...s } }),
      onRundownChange: () => void fetchRundown(showId).then((rundown) => this.snap.showId === showId && this.set({ rundown })),
      onChat: (m, ev) => this.onRealtimeChat(m, ev),
      onViewers: (viewers) => this.set({ viewers }),
      onReaction: () => {
        this.reactTimes.push(Date.now());
      },
    });
    this.applyOnAir();
  }

  // ---- chat
  private onRealtimeChat(m: Partial<ChatMessage> & { id: string }, ev: 'INSERT' | 'UPDATE' | 'DELETE') {
    if (ev === 'DELETE' || m.hidden_at) {
      this.set({ chat: this.snap.chat.filter((x) => x.id !== m.id) });
      return;
    }
    if (typeof m.body === 'string' && typeof m.kind === 'string' && typeof m.created_at === 'string') {
      this.merge([
        {
          id: m.id,
          show_id: m.show_id ?? this.snap.showId ?? '',
          display_name: m.display_name ?? null,
          avatar_url: m.avatar_url ?? null,
          body: m.body,
          kind: m.kind,
          amount_cents: m.amount_cents ?? null,
          created_at: m.created_at,
          hidden_at: null,
          featured_at: m.featured_at ?? null,
        },
      ]);
    } else {
      // Payload without the columns we need: fetch them through REST instead.
      if (this.chatRefetch) clearTimeout(this.chatRefetch);
      this.chatRefetch = setTimeout(() => void this.pollChat(), 300);
    }
  }

  private merge(msgs: ChatMessage[]) {
    if (msgs.length === 0) return;
    const byId = new Map(this.snap.chat.map((m) => [m.id, m]));
    let alerted = false;
    for (const m of msgs) {
      if (m.hidden_at) {
        byId.delete(m.id);
        continue;
      }
      if (!byId.has(m.id) && this.alerts.push(m)) alerted = true;
      byId.set(m.id, { ...byId.get(m.id), ...m });
    }
    const chat = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-CHAT_CAP);
    this.set({ chat, supportTotal: this.alerts.total, pendingAlerts: this.alerts.pending() });
    if (alerted) this.playNext();
  }

  private async pollChat() {
    const showId = this.snap.show?.id;
    if (!showId) return;
    const last = this.snap.chat[this.snap.chat.length - 1]?.created_at;
    try {
      const msgs = await fetchChat(showId, last);
      if (this.snap.show?.id === showId) this.merge(msgs);
    } catch {
      // next tick retries; Realtime keeps running meanwhile
    }
  }

  async hideMessage(id: string) {
    await this.call('hide_message', { message_id: id });
    this.set({ chat: this.snap.chat.filter((m) => m.id !== id) });
    if (this.featuredId() === id) this.clearHighlight();
  }

  async muteMessage(id: string) {
    await this.call('mute', { message_id: id });
    const victim = this.snap.chat.find((m) => m.id === id);
    // The server hides all their chat lines; mirror that for the same display name as a best guess until REST confirms.
    this.set({ chat: this.snap.chat.filter((m) => m.id !== id && !(victim && m.kind === 'chat' && m.display_name === victim.display_name)) });
    if (this.featuredId() === id) this.clearHighlight();
  }

  featuredId(): string | null {
    const f = this.snap.show?.overlay?.featured_message_id;
    return typeof f === 'string' ? f : null;
  }

  hasChatHighlightTemplate(): boolean {
    return !!this.bound && !!chatHighlightTemplate(this.bound.getState());
  }

  async featureMessage(id: string | null) {
    const r = await this.call<{ overlay: Record<string, unknown> }>('feature_message', { message_id: id });
    if (this.snap.show) this.set({ show: { ...this.snap.show, overlay: r.overlay } });
    if (id === null) return this.clearHighlight();
    const m = this.snap.chat.find((x) => x.id === id);
    const b = this.bound;
    const tpl = b ? chatHighlightTemplate(b.getState()) : undefined;
    if (!m || !b || !tpl) return;
    liveRoomChatHighlight.set({ name: m.display_name?.trim() || 'Jemand', body: m.body, avatarUrl: m.avatar_url ?? '' });
    const ov = this.ensureOverlay(tpl, 'ov-liveroom-chat');
    if (ov) b.dispatch({ type: 'setOverlay', id: ov, visible: true, now: Date.now() });
  }

  private clearHighlight() {
    const b = this.bound;
    const tpl = b ? chatHighlightTemplate(b.getState()) : undefined;
    if (b && tpl) {
      for (const o of b.getState().overlays) if (o.templateId === tpl.id && o.visible) b.dispatch({ type: 'setOverlay', id: o.id, visible: false, now: Date.now() });
      setTimeout(() => liveRoomChatHighlight.set(null), tpl.animOut.durationMs + 300);
    } else liveRoomChatHighlight.set(null);
  }

  async systemMessage(body: string) {
    await this.call('system_message', { body });
    void this.pollChat();
  }

  // ---- flags / status / overlay
  async setFlags(patch: { chat_enabled?: boolean; slow_mode_seconds?: number; voting_open?: boolean }) {
    const r = await this.call<{ show: LiveShow }>('set_flags', patch);
    this.set({ show: { ...this.snap.show, ...r.show } });
  }

  async setStatus(status: LiveShowStatus) {
    await this.call('set_status', { status });
    if (this.snap.show) this.set({ show: { ...this.snap.show, status }, askEnd: false });
  }

  async setAppOverlay(patch: Record<string, unknown>) {
    const r = await this.call<{ overlay: Record<string, unknown> }>('set_overlay', { patch });
    if (this.snap.show) this.set({ show: { ...this.snap.show, overlay: r.overlay } });
  }

  dismissAskEnd() {
    this.set({ askEnd: false });
  }

  setAutoFollowAir(on: boolean) {
    this.persist({ autoFollowAir: on });
    this.prevOn = null;
    this.applyOnAir();
  }

  /** Follows the studio's broadcast: on → app LIVE; off → ask before "Beendet". */
  attachOnAir(src: OnAirSource | null) {
    const preferred = liveRoomSeams.get().onAir ?? src;
    this.onAirSource = src;
    if (preferred === this.currentOnAirTarget) return;
    this.onAirUnsub?.();
    this.onAirUnsub = null;
    this.currentOnAirTarget = preferred;
    if (preferred) this.onAirUnsub = preferred.subscribe(() => this.applyOnAir());
    this.applyOnAir();
  }
  private currentOnAirTarget: OnAirSource | null = null;

  private applyOnAir() {
    const src = this.currentOnAirTarget;
    if (!src) return;
    const on = src.get();
    if (this.snap.studioOnAir !== on) this.set({ studioOnAir: on });
    const show = this.snap.show;
    if (!show || !this.snap.token || !this.snap.autoFollowAir) {
      this.prevOn = on;
      return;
    }
    const act = followOnAir(this.prevOn, on, show.status);
    this.prevOn = on;
    if (act === 'live') {
      this.setStatus('live').then(
        () => this.set({ followError: null }),
        (e) => this.set({ followError: `App konnte nicht auf LIVE gestellt werden: ${errorMessage(e)}` }),
      );
    } else if (act === 'ask-end') this.set({ askEnd: true });
  }

  // ---- rundown + on-stage
  columnMapFor(columns: string[]): ColumnMap {
    return this.snap.columnMap ? sanitizeColumnMap(this.snap.columnMap, columns) : guessColumnMap(columns);
  }

  setColumnMap(map: ColumnMap) {
    this.persist({ columnMap: map });
  }

  previewRundown(table: Table) {
    return tableToRundown(table, this.columnMapFor(table.columns), this.baseDate());
  }

  private baseDate(): Date {
    const s = this.snap.show?.starts_at;
    const t = s ? Date.parse(s) : NaN;
    return Number.isNaN(t) ? new Date() : new Date(t);
  }

  async pushRundown(table: Table): Promise<number> {
    const showId = this.snap.show?.id;
    if (!showId) throw new LiveApiError('NO_SHOW', 'Bitte zuerst eine Übertragung wählen.', 0);
    const { rows, rowIds } = this.previewRundown(table);
    if (rows.length === 0) throw new LiveApiError('EMPTY', 'Keine Zeile mit Titel in der Tabelle.', 0);
    const r = await this.call<{ items: RundownItem[] }>('rundown_replace', { rows });
    const items = [...r.items].sort((a, b) => a.position - b.position);
    this.persist({ rowMaps: { ...this.snap.rowMaps, [showId]: mapRowsToItems(rowIds, items) } });
    this.set({ rundown: items, show: this.snap.show ? { ...this.snap.show, current_item_id: null } : null, stageNote: null, stageError: null });
    this.stageBaseline = true;
    if (this.lastTable) this.onTable(this.lastTable);
    return items.length;
  }

  private resolve(table: Table) {
    const showId = this.snap.show?.id ?? '';
    const map = this.columnMapFor(table.columns);
    const rowMap = this.snap.rowMaps[showId] ?? {};
    return (rowId: string) => resolveItemForRow(rowId, rowMap, table, map, this.snap.rundown);
  }

  /** Called on every studio Tabelle change (via the React bridge). */
  onTable(table: Table) {
    this.lastTable = table;
    if (!this.snap.show) return;
    if (this.stageBaseline) {
      // First look after connecting / pushing / enabling: remember the row, never push reminders on startup.
      this.stageBaseline = false;
      this.lastHandledRowId = table.currentRowId;
      return;
    }
    const d = decideOnStage({
      auto: this.snap.autoStage,
      connected: !!this.snap.token,
      currentRowId: table.currentRowId,
      lastHandledRowId: this.lastHandledRowId,
      appCurrentItemId: this.snap.show.current_item_id,
      resolveItem: this.resolve(table),
    });
    if (d.kind === 'none') return;
    this.lastHandledRowId = d.rowId;
    if (d.kind === 'unmapped') {
      const map = this.columnMapFor(table.columns);
      const row = table.rows.find((r) => r.id === d.rowId);
      const title = (map.title && row?.values[map.title]) || 'Diese Zeile';
      this.set({ stageNote: `„${title}“ ist nicht im App-Programm. Erst „Tabelle → App“ senden.` });
      return;
    }
    this.set({ stageNote: null });
    if (this.stageTimer) clearTimeout(this.stageTimer);
    this.stageTimer = setTimeout(() => void this.sendOnStage(d.itemId), STAGE_DEBOUNCE_MS);
  }

  async sendOnStage(itemId: string | null) {
    this.set({ stageSending: true, stageError: null });
    try {
      await this.call('set_on_stage', { item_id: itemId });
      if (this.snap.show) this.set({ show: { ...this.snap.show, current_item_id: itemId } });
    } catch (e) {
      this.set({ stageError: errorMessage(e) });
    } finally {
      this.set({ stageSending: false });
    }
  }

  /** Manual "abgleichen": puts the studio's current row on stage in the app now. */
  async syncStageNow() {
    const t = this.lastTable;
    if (!t || t.currentRowId === null) throw new LiveApiError('NO_ROW', 'In der Tabelle ist keine Zeile aktiv.', 0);
    const itemId = this.resolve(t)(t.currentRowId);
    if (!itemId) throw new LiveApiError('UNMAPPED', 'Die aktive Zeile ist nicht im App-Programm. Erst „Tabelle → App“ senden.', 0);
    this.lastHandledRowId = t.currentRowId;
    await this.sendOnStage(itemId);
    if (this.snap.stageError) throw new LiveApiError('FAILED', this.snap.stageError, 0);
  }

  async nextOnStage() {
    const r = await this.call<{ current?: { id?: string } | null }>('next');
    const id = r?.current?.id ?? null;
    if (this.snap.show && id) this.set({ show: { ...this.snap.show, current_item_id: id } });
  }

  setAutoStage(on: boolean) {
    this.persist({ autoStage: on });
    this.stageBaseline = true;
    if (this.lastTable) this.onTable(this.lastTable);
  }

  // ---- alerts
  setAutoAlerts(on: boolean) {
    this.persist({ autoAlerts: on });
    if (on) this.playNext();
  }

  setAlertSeconds(n: number) {
    this.persist({ alertSeconds: Math.min(30, Math.max(3, Math.round(n))) });
  }

  dismissAlert(id: string) {
    this.alerts.remove(id);
    this.set({ pendingAlerts: this.alerts.pending() });
  }

  /** Shows one queued alert now (manual mode), or the next one. */
  showAlertNow(id?: string) {
    if (this.playing) return;
    const a = id ? this.alerts.pending().find((x) => x.id === id) : this.alerts.pending()[0];
    if (!a) return;
    this.alerts.remove(a.id);
    this.fire(a);
  }

  private playNext() {
    if (this.playing || !this.snap.autoAlerts || !this.bound) return;
    const a = this.alerts.shift();
    if (!a) return;
    this.fire(a);
  }

  private donationOverlay(b: Bound): { overlayId: string; template: Template } | null {
    const st = b.getState();
    const tpl = st.templates.find((t) => t.kind === 'donation');
    if (!tpl) return null;
    const id = this.ensureOverlay(tpl, 'ov-liveroom-donation');
    return id ? { overlayId: id, template: tpl } : null;
  }

  private ensureOverlay(tpl: Template, fallbackId: string): string | null {
    const b = this.bound;
    if (!b) return null;
    const existing = b.getState().overlays.find((o) => o.templateId === tpl.id);
    if (existing) return existing.id;
    // useReducer applies queued actions in order, so a setOverlay dispatched right after sees this instance.
    b.dispatch({ type: 'addOverlay', templateId: tpl.id, id: fallbackId });
    return fallbackId;
  }

  private fire(a: SupportAlert) {
    const b = this.bound;
    this.set({ pendingAlerts: this.alerts.pending() });
    if (!b) {
      this.set({ alertError: 'Studio nicht verbunden – Alert konnte nicht gezeigt werden.' });
      return;
    }
    const target = this.donationOverlay(b);
    if (!target) {
      this.set({ alertError: 'Keine Unterstützungs-Vorlage im Design gefunden.' });
      return;
    }
    this.playing = true;
    liveRoomDonation.set({ name: a.name, amount: a.amount, message: a.message });
    b.dispatch({ type: 'setOverlay', id: target.overlayId, visible: true, now: Date.now() });
    this.set({ currentAlert: a, alertError: null });
    const holdMs = this.snap.alertSeconds * 1000 + target.template.animIn.durationMs;
    this.alertTimer = setTimeout(() => {
      this.bound?.dispatch({ type: 'setOverlay', id: target.overlayId, visible: false, now: Date.now() });
      this.alertTimer = setTimeout(() => {
        liveRoomDonation.set(null);
        this.playing = false;
        this.set({ currentAlert: null });
        this.alertTimer = setTimeout(() => this.playNext(), 800);
      }, target.template.animOut.durationMs + 300);
    }, holdMs);
  }

  /** Takes the running alert off air early. */
  stopAlert() {
    if (!this.playing) return;
    if (this.alertTimer) clearTimeout(this.alertTimer);
    const b = this.bound;
    const st = b?.getState();
    const tpl = st?.templates.find((t) => t.kind === 'donation');
    if (b && st && tpl) for (const o of st.overlays) if (o.templateId === tpl.id && o.visible) b.dispatch({ type: 'setOverlay', id: o.id, visible: false, now: Date.now() });
    this.alertTimer = setTimeout(() => {
      liveRoomDonation.set(null);
      this.playing = false;
      this.set({ currentAlert: null });
    }, (tpl?.animOut.durationMs ?? 300) + 300);
  }

  // ---- reactions
  private recountReactions() {
    const cutoff = Date.now() - 60_000;
    while (this.reactTimes.length && this.reactTimes[0] < cutoff) this.reactTimes.shift();
    if (this.snap.reactionsPerMin !== this.reactTimes.length) this.set({ reactionsPerMin: this.reactTimes.length });
  }

  // ---- guests
  private async pollGuests() {
    const show = this.snap.show;
    if (!show || !this.snap.token || show.guests_enabled === false || this.guestPollBusy) return;
    if (this.snap.conn.state === 'error') return; // wrong token: wait for the operator
    this.guestPollBusy = true;
    try {
      const r = await this.call<{ requests: GuestRequest[]; livekit: boolean }>('guest_list');
      if (this.snap.show?.id !== show.id) return;
      // A joined guest that left the list hung up (guest_cancel) or was ended elsewhere.
      const open = new Set(r.requests.map((g) => g.id));
      for (const g of this.snap.guests) if (!open.has(g.id) && isJoined(g.id)) void leaveGuest(g.id);
      this.set({ guests: r.requests, livekit: r.livekit, guestError: null });
    } catch (e) {
      if (e instanceof LiveApiError && e.status === 401) this.set({ conn: { state: 'error', message: e.message } });
      this.set({ guestError: errorMessage(e) });
    } finally {
      this.guestPollBusy = false;
    }
  }

  async acceptGuest(g: GuestRequest) {
    const join = await this.call<GuestJoin>(g.status === 'accepted' ? 'guest_studio_token' : 'guest_accept', { request_id: g.id });
    await joinGuest(join, `📱 ${g.display_name?.trim() || join.display_name?.trim() || 'Gast'}`);
    void this.pollGuests();
  }

  async declineGuest(g: GuestRequest) {
    await this.call('guest_decline', { request_id: g.id });
    this.set({ guests: this.snap.guests.filter((x) => x.id !== g.id) });
  }

  async endGuest(g: GuestRequest) {
    await leaveGuest(g.id);
    await this.call('guest_end', { request_id: g.id });
    this.set({ guests: this.snap.guests.filter((x) => x.id !== g.id) });
  }

  // ---- Cloudflare (credentials are returned to the caller, never stored here)
  cf<T>(action: string, extra?: Record<string, unknown>): Promise<T> {
    return this.call<T>(action, extra);
  }
}

export const liveRoom = new LiveRoomController();
