import { Composition } from 'remotion';
import { FPS, TOTAL_FRAMES } from './script';
import { Video } from './Video';

export const Root = () => (
  <>
    <Composition id="RoebelMuenzen" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="RoebelMuenzenWide" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
