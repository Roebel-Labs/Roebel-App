import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY = 3200;

/**
 * Manages auto-hiding video controls, YouTube-style: controls fade out a few
 * seconds after the last interaction while the video is playing, and stay put
 * while it is paused.
 *
 * @param isPlaying whether the video is currently playing
 */
export function useAutoHideControls(isPlaying: boolean) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clear();
    if (!playingRef.current) return; // paused → keep controls on screen
    timer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
  }, [clear]);

  const show = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const hide = useCallback(() => {
    clear();
    setVisible(false);
  }, [clear]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      if (v) {
        clear();
        return false;
      }
      scheduleHide();
      return true;
    });
  }, [clear, scheduleHide]);

  // Re-evaluate whenever the play state flips.
  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      clear();
      setVisible(true);
    }
  }, [isPlaying, scheduleHide, clear]);

  useEffect(() => clear, [clear]);

  return { visible, show, hide, toggle };
}
