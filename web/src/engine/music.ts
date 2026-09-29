import fs from "node:fs";

/**
 * A small procedural music bed (royalty free by construction): warm pad chords, a plucked arpeggio,
 * a soft kick and hats. Deterministic for a given seed. Writes a 44.1 kHz stereo 16-bit WAV.
 */
export function makeMusic(file: string, seconds: number, opts: { bpm?: number; seed?: number; mood?: "bright" | "calm" } = {}) {
  const sr = 44100;
  const bpm = opts.bpm ?? 108;
  const beat = 60 / bpm;
  const n = Math.ceil((seconds + 1) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let seed = opts.seed ?? 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // I - V - vi - IV in C, or a calmer vi - IV - I - V.
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const prog = opts.mood === "calm"
    ? [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
    : [[48, 55, 60, 64], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]];
  const bar = beat * 4;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const b = Math.floor(t / bar);
    const chord = prog[b % prog.length];
    const inBar = t - b * bar;
    // Pad: detuned saws softened, with slow attack per bar.
    const env = Math.min(1, inBar / 0.6) * (0.75 + 0.25 * Math.cos((inBar / bar) * Math.PI * 2));
    let pad = 0;
    for (const m of chord) {
      const f = hz(m);
      pad += Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 1.003 * t) * 0.35 + Math.sin(2 * Math.PI * f * 2 * t) * 0.08;
    }
    pad *= 0.045 * env;
    L[i] += pad;
    R[i] += pad;
  }

  // Plucked arpeggio on eighth notes, panned.
  const eighth = beat / 2;
  for (let k = 0; k * eighth < seconds; k++) {
    const t0 = k * eighth;
    const chord = prog[Math.floor(t0 / bar) % prog.length];
    const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]] + 12;
    const f = hz(note);
    const pan = 0.5 + 0.35 * Math.sin(k * 0.9);
    const vel = 0.05 + 0.02 * rand();
    const start = Math.floor(t0 * sr);
    for (let j = 0; j < sr * 0.6 && start + j < n; j++) {
      const tt = j / sr;
      const v = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(2 * Math.PI * f * 2 * tt)) * Math.exp(-tt * 7) * vel;
      L[start + j] += v * (1 - pan);
      R[start + j] += v * pan;
    }
  }

  // Soft kick on beats, hats on offbeats (drop in after the first bar).
  for (let k = 4; k * beat < seconds; k++) {
    const start = Math.floor(k * beat * sr);
    for (let j = 0; j < sr * 0.25 && start + j < n; j++) {
      const tt = j / sr;
      const f = 50 + 70 * Math.exp(-tt * 30);
      const v = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 14) * 0.16;
      L[start + j] += v;
      R[start + j] += v;
    }
    const hs = Math.floor((k + 0.5) * beat * sr);
    for (let j = 0; j < sr * 0.05 && hs + j < n; j++) {
      const v = (rand() * 2 - 1) * Math.exp(-(j / sr) * 90) * 0.025;
      L[hs + j] += v;
      R[hs + j] -= v * 0.6;
    }
  }

  // Fade in/out, soft clip, write WAV.
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fade = Math.min(1, t / 1.5, Math.max(0, (seconds - t) / 2.5));
    const l = Math.tanh(L[i] * fade * 1.4);
    const r = Math.tanh(R[i] * fade * 1.4);
    buf.writeInt16LE(Math.round(l * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32000), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
