#!/usr/bin/env node
'use strict';
// Stand-in for ffmpeg in output.test.ts. Behaviour comes from env:
//   FAKE_FFMPEG_DUMP     append every stdin byte to this file
//   FAKE_FFMPEG_EXIT_MS  exit with code 1 after this many ms, ignoring stdin EOF (default: run until stdin EOF)
//   FAKE_FFMPEG_PIDS     append this process's pid (one per line) to this file
//   FAKE_FFMPEG_STDERR   write this line to stderr once, ~120 ms after start
//   FAKE_FFMPEG_ARGS     append this process's argv (JSON, one per line) to this file
//   FAKE_FFMPEG_IGNORE_TERM  ignore SIGTERM and stdin EOF (a hung RTMP slave); only SIGKILL ends it
const fs = require('node:fs');

if (process.env.FAKE_FFMPEG_PIDS) fs.appendFileSync(process.env.FAKE_FFMPEG_PIDS, `${process.pid}\n`);

if (process.env.FAKE_FFMPEG_ARGS) {
  fs.appendFileSync(process.env.FAKE_FFMPEG_ARGS, `${JSON.stringify(process.argv.slice(2))}\n`);
}
if (process.env.FAKE_FFMPEG_STDERR) {
  const line = process.env.FAKE_FFMPEG_STDERR;
  setTimeout(() => process.stderr.write(`${line}\n`), 120);
}

const ignoreTerm = !!process.env.FAKE_FFMPEG_IGNORE_TERM;
if (ignoreTerm) process.on('SIGTERM', () => {});

const dump = process.env.FAKE_FFMPEG_DUMP;
const exitMs = Number(process.env.FAKE_FFMPEG_EXIT_MS || 0);

process.stdin.on('data', (d) => {
  if (dump) fs.appendFileSync(dump, d);
});
// With an exit timer the fake runs until it (EOF on an ignored stdin must not end it early).
process.stdin.on('end', () => {
  if (!exitMs && !ignoreTerm) process.exit(0);
});
process.stdin.on('error', () => {});

const progress = setInterval(() => {
  process.stderr.write('frame=  30 fps= 30 q=-0.0 size=  100kB time=00:00:01.00 bitrate=6000.0kbits/s dup=0 drop=0 speed=1.00x\r');
}, 50);

if (exitMs > 0) {
  setTimeout(() => {
    clearInterval(progress);
    process.stderr.write('Connection to srt://example failed\n');
    process.exit(1);
  }, exitMs);
}
