// Program audio for the recorder stream.
//
// SEAM (Task 6): until the mixer exists, the program carries a silent stereo
// track so ffmpeg always has an audio stream to encode. Task 6 replaces this
// function with the mixer's master output track.

let ctx: AudioContext | null = null;
let track: MediaStreamTrack | null = null;

export function programAudioTrack(): MediaStreamTrack {
  if (track && track.readyState === 'live') return track;
  ctx ??= new AudioContext({ sampleRate: 48000 });
  const src = ctx.createConstantSource();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  src.connect(gain).connect(dest);
  src.start();
  track = dest.stream.getAudioTracks()[0];
  return track;
}
