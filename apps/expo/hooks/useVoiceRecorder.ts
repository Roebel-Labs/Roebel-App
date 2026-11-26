import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';

/** Hard cap so a forgotten recording doesn't run forever. */
export const MAX_RECORDING_SECONDS = 180;
/** Shorter than this is a mis-tap, not a prompt. */
const MIN_RECORDING_MS = 700;

// Mono 64 kbit/s AAC (.m4a): speech stays clear and 3 minutes fit well under Vercel's 4.5 MB limit.
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

// The Hören player sets shouldPlayInBackground + doNotMix for the whole app. Recording needs the
// session switched over completely, and handed back for playback afterwards.
const RECORD_MODE = {
  allowsRecording: true,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  interruptionMode: 'doNotMix',
} as const;
const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true } as const;

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? '');
}

export type VoiceRecorderOptions = {
  /** Turns the recording into text (server STT). */
  transcribe: (uri: string) => Promise<string>;
  /** Called with the recognised text. */
  onText: (text: string) => void;
  /** Short user-facing notices (snackbar). */
  notify: (message: string) => void;
  /** Microphone permission denied. */
  onPermissionDenied?: () => void;
};

/**
 * Speak a prompt: tap the mic → record → tap send → transcribe → `onText`. Shared by the agent
 * chats and the event submission so both behave the same.
 */
export function useVoiceRecorder({ transcribe, onText, notify, onPermissionDenied }: VoiceRecorderOptions) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  // Latest callbacks without re-creating finish/start on every render.
  const cbRef = useRef({ transcribe, onText, notify, onPermissionDenied });
  cbRef.current = { transcribe, onText, notify, onPermissionDenied };

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finish = useCallback(
    async (keep: boolean) => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      clearTimer();
      setRecording(false);
      const elapsed = Date.now() - startedAtRef.current;
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri ?? recorder.getStatus().url ?? null;
      } catch (err) {
        if (__DEV__) console.warn('[voice] stop failed', err);
        uri = null;
      }
      setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      if (!keep) return;
      if (elapsed < MIN_RECORDING_MS) {
        cbRef.current.notify('Halte die Aufnahme etwas länger und sprich dann.');
        return;
      }
      if (!uri) {
        cbRef.current.notify('Aufnahme fehlgeschlagen.');
        return;
      }
      setTranscribing(true);
      try {
        const text = (await cbRef.current.transcribe(uri)).trim();
        if (!text) {
          cbRef.current.notify('Ich konnte nichts verstehen.');
          return;
        }
        cbRef.current.onText(text);
      } catch (err) {
        if (__DEV__) console.warn('[voice] transcribe failed', err);
        cbRef.current.notify(errorText(err) || 'Transkription fehlgeschlagen.');
      } finally {
        setTranscribing(false);
      }
    },
    [recorder],
  );

  const start = useCallback(async () => {
    if (recordingRef.current || transcribing) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        cbRef.current.onPermissionDenied?.();
        return;
      }
      await setAudioModeAsync(RECORD_MODE);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      startedAtRef.current = Date.now();
      setRecording(true);
      setRecordingSeconds(0);
      clearTimer();
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setRecordingSeconds(seconds);
        if (seconds >= MAX_RECORDING_SECONDS) finish(true);
      }, 1000);
    } catch (err) {
      if (__DEV__) console.warn('[voice] start failed', err);
      recordingRef.current = false;
      setRecording(false);
      setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      const detail = errorText(err);
      cbRef.current.notify(detail ? `Aufnahme konnte nicht gestartet werden (${detail}).` : 'Aufnahme konnte nicht gestartet werden.');
    }
  }, [recorder, transcribing, finish]);

  // Stop a running recording when the screen goes away.
  useEffect(
    () => () => {
      clearTimer();
      if (recordingRef.current) {
        recordingRef.current = false;
        recorder.stop().catch(() => {});
        setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      }
    },
    [recorder],
  );

  return {
    recording,
    recordingSeconds,
    transcribing,
    start,
    stop: () => finish(true),
    cancel: () => finish(false),
  };
}
