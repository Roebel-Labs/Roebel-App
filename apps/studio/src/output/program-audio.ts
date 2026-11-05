// Program audio for the recorder stream: the mixer's post-limiter master once the
// mixer is registered (StudioProvider), otherwise a silent stereo track so ffmpeg
// always has an audio stream to encode.

let provider: (() => MediaStreamTrack) | null = null;
let ctx: AudioContext | null = null;
let silent: MediaStreamTrack | null = null;

export function setProgramAudioProvider(p: (() => MediaStreamTrack) | null): void {
  provider = p;
}

function silentTrack(): MediaStreamTrack {
  if (silent && silent.readyState === 'live') return silent;
  ctx ??= new AudioContext({ sampleRate: 48000 });
  const src = ctx.createConstantSource();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  src.connect(gain).connect(dest);
  src.start();
  silent = dest.stream.getAudioTracks()[0];
  return silent;
}

export function programAudioTrack(): MediaStreamTrack {
  return provider ? provider() : silentTrack();
}
