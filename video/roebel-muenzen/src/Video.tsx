import { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, Reveal, ramp, smooth } from './parts';
import { SCENE_VIEWS } from './scenes';
import { CueContext } from './cues';
import { SCENES, VOICE_OFFSET, cuesOf, sceneFrames, type SceneScript } from './script';

const STAGE = 1000;
const FONT_FILES: { family: string; file: string; weight: string }[] = [
  { family: FONT.body, file: 'MonaSans-Regular.ttf', weight: '400' },
  { family: FONT.body, file: 'MonaSans-Medium.ttf', weight: '500' },
  { family: FONT.body, file: 'MonaSans-SemiBold.ttf', weight: '600' },
  { family: FONT.heading, file: 'MonaSansSemiCondensed-Bold.ttf', weight: '700' },
];

/** Blocks rendering until the app's fonts are loaded, so no frame falls back to a system font. */
function useFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(
      FONT_FILES.map(async ({ family, file, weight }) => {
        const face = new FontFace(family, `url(${staticFile(file)})`, { weight });
        document.fonts.add(await face.load());
      }),
    )
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, [handle]);
}

function SceneFrame({ scene }: { scene: SceneScript }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const total = sceneFrames(scene);
  const dark = scene.id === 'outro';
  const portrait = height > width;
  const View = SCENE_VIEWS[scene.id];
  // The outro shows its lines on stage, so it carries no caption.
  const cues = cuesOf(scene);
  const caption = dark ? undefined : cues.find((c) => frame >= c.from && frame < c.to);
  const stage = portrait ? width * 0.92 : height * 0.66;
  // Content leaves upwards; the paper stays, so scenes read as one continuous film.
  const leave = dark ? 0 : ramp(frame, total - 12, 12, smooth);
  // Slow push-in keeps every scene alive.
  const push = interpolate(frame, [0, total], [1, 1.035]);
  // The closing scene opens as a navy circle growing from the centre.
  const reveal = dark ? ramp(frame, 0, 26, smooth) * 75 : 0;

  return (
    <AbsoluteFill style={dark ? { backgroundColor: C.navy, clipPath: `circle(${reveal}% at 50% 50%)` } : undefined}>
      <Sequence from={VOICE_OFFSET} layout="none">
        <Audio src={staticFile(`voice/${scene.id}.mp3`)} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: 'center', opacity: 1 - leave, transform: `translateY(${-leave * 50}px)` }}>
        <div style={{ height: portrait ? height * 0.21 : height * 0.17, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: `0 ${width * 0.07}px` }}>
          {scene.title ? <Reveal text={scene.title.toUpperCase()} start={4} size={portrait ? 92 : 66} style={{ letterSpacing: '0.01em' }} /> : null}
        </div>
        <div style={{ width: stage, height: stage, marginTop: portrait ? height * 0.025 : 0 }}>
          <div style={{ width: STAGE, height: STAGE, position: 'relative', transform: `scale(${(stage / STAGE) * push})`, transformOrigin: '0 0' }}>
            <CueContext.Provider value={cues}>
              <View />
            </CueContext.Provider>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: width * 0.08,
            right: width * 0.08,
            bottom: portrait ? height * 0.075 : height * 0.04,
            minHeight: portrait ? 180 : 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {caption ? (
            <div
              style={{
                fontFamily: FONT.body,
                fontWeight: 500,
                fontSize: portrait ? 46 : 36,
                lineHeight: 1.28,
                textAlign: 'center',
                color: C.muted,
                opacity: ramp(frame, caption.from, 8),
                transform: `translateY(${(1 - ramp(frame, caption.from, 14)) * 14}px)`,
              }}
            >
              {caption.text}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function Video() {
  useFonts();
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 38%, #FBFAF7 0%, ${C.paper} 60%, #EFECE4 100%)` }}>
      {SCENES.map((scene) => {
        const from = cursor;
        cursor += sceneFrames(scene);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={sceneFrames(scene)}>
            <SceneFrame scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
