import { createContext, useContext } from 'react';
import type { Cue } from './script';

/** Spoken-line windows of the current scene, so animation beats can land on the words. */
export const CueContext = createContext<Cue[]>([]);
export const useCues = () => useContext(CueContext);
