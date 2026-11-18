// Rest timer (end timestamp, so it survives backgrounding), beep and Screen Wake Lock.
// No storage. Browser globals are only touched inside functions.
const listeners = new Set();
let until = 0;            // end timestamp (ms); 0 = no rest started
let running = false;
let tick = 0;
let ctx = null;
let lock = null;
let wantLock = false;
let locking = false;
let wantSeq = 0;                      // bumped by every keepAwake() call

export function restState() {
  const remaining = running ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0;
  return { until, remaining, running };
}

/** fn({ type: 'tick' | 'done' | 'stop', remaining, running }); returns an unsubscribe function. */
export function onRest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(type) {
  const s = restState();
  for (const fn of listeners) fn({ type, remaining: s.remaining, running: s.running });
}

function check() {
  if (!running) return;
  if (Date.now() >= until) {
    running = false;
    clearInterval(tick);
    tick = 0;
    emit('done');
  } else {
    emit('tick');
  }
}

export function startRest(sec) {
  until = Date.now() + sec * 1000;
  running = true;
  clearInterval(tick);
  tick = setInterval(check, 1000);
  emit('tick');
}

/** Shift the end by delta seconds (-15 / +15); ignored when no rest is running. */
export function adjustRest(delta) {
  if (!running) return;
  until += delta * 1000;
  check();
}

export function skipRest() {
  clearInterval(tick);
  tick = 0;
  running = false;
  until = 0;
  emit('stop');
}

// ---- Sound ------------------------------------------------------------

/** iOS / Safari audio session of the page: 'ambient' (beeps mixed with other apps' music; muted in silent mode),
 *  'playback' (also in silent mode, but other apps' music pauses), 'auto' (the default). No-op elsewhere.
 *  A context created under another session plays distorted on iPad (the hardware sample rate changes), so it is
 *  closed here and the next unlockAudio() creates a new one. */
export function setAudioSession(type) {
  try {
    if (!navigator.audioSession || navigator.audioSession.type === type) return;
    navigator.audioSession.type = type;
    releaseAudio();
  } catch { /* unsupported type: keep the current one */ }
}

/** Close the AudioContext: the page stops holding the audio session (music of other apps is left alone). */
export function releaseAudio() {
  cancelTones();
  const c = ctx;
  ctx = null;
  c?.close().catch(() => {});
}

/** Create / resume the AudioContext; call from a user gesture (tap on "Inizia"). iOS only lets a context play after
 *  a sound was started inside a gesture, so a silent buffer is played here too. */
export function unlockAudio() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state !== 'running') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* no sound, visual cue only */ }
}

/** Two short 880 Hz beeps; silent when audio is locked or unavailable. */
export function beep() {
  try {
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume()?.then(play, () => {}); else play();
  } catch { /* ignore */ }
}

/** One tone (Hz, seconds) for the timed workout; silent when audio is locked or unavailable. */
export function tone(freq = 880, dur = 0.15, vol = 0.25) {
  try {
    if (!ctx) return;
    const go = () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    };
    if (ctx.state !== 'running') ctx.resume()?.then(go, () => {}); else go();
  } catch { /* ignore */ }
}

// Tones scheduled ahead on the audio clock: exact to the millisecond, unlike page timers (which iOS delays).
const scheduled = new Set();          // { osc, at }

/** Audio-clock time being heard right now: the output timestamp moved to this instant, so a tone `d` seconds ahead
 *  is heard `d` seconds from now even when the clock started late or the output lags (iPad); currentTime otherwise.
 *  An estimate more than 0.5 s from currentTime (output latency is far less) means a bad timestamp: currentTime. */
function heardNow() {
  const now = ctx.currentTime;
  const ts = ctx.state === 'running' ? ctx.getOutputTimestamp?.() : null;
  if (!ts?.performanceTime) return now;
  const heard = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  return Number.isFinite(heard) && Math.abs(heard - now) <= 0.5 ? heard : now;
}

/** Tone at `delaySec` from now on the audio clock; silent when audio is locked or unavailable. A pure sine (the sound
 *  of the first versions), peak `vol` kept at or below 1 (no clipping); a 5 ms attack and an exponential release keep
 *  it free of clicks. */
export function scheduleTone(delaySec, freq = 880, dur = 0.15, vol = 0.95) {
  try {
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const at = Math.max(ctx.currentTime, heardNow() + Math.max(0, delaySec));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(Math.min(1, vol), at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur);
    const item = { osc, at };
    scheduled.add(item);
    osc.onended = () => scheduled.delete(item);
  } catch { /* ignore */ }
}

// ---- Voice ----------------------------------------------------------------

/** Italian voice of the device: a local one first (works offline, starts at once). */
function italianVoice() {
  const all = globalThis.speechSynthesis?.getVoices?.() ?? [];
  const it = all.filter((v) => /^it/i.test(v.lang));
  return it.find((v) => v.localService) ?? it[0] ?? null;
}

/** Say `text` aloud (what was being said is cut); silent where speech synthesis is missing. */
export function say(text, volume = 1) {
  try {
    const s = globalThis.speechSynthesis;
    if (!s || typeof SpeechSynthesisUtterance === 'undefined') return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    const v = italianVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.volume = volume;
    s.speak(u);
  } catch { /* no voice */ }
}

/** iOS speaks only after a first utterance inside a user gesture: a silent one (call it from the tap on ▶). */
export const unlockVoice = () => say(' ', 0);

/** Stop speaking. */
export function hush() {
  try { globalThis.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

/** Cancel the scheduled tones that have not started yet (one already sounding finishes). */
export function cancelTones() {
  const now = ctx ? ctx.currentTime : 0;
  for (const item of scheduled) {
    if (item.at <= now) continue;
    try { item.osc.stop(); } catch { /* already stopped */ }
    scheduled.delete(item);
  }
}

function play() {
  try {
    for (const at of [0, 0.25]) {
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  } catch { /* ignore */ }
}

// ---- Wake lock ----------------------------------------------------------

async function requestLock() {
  const seq = wantSeq;
  let own = false;                    // only the call that set locking may clear it
  try {
    if (!wantLock || lock || locking || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    locking = own = true;
    const l = await navigator.wakeLock.request('screen');
    if (!wantLock) {                  // keepAwake(false) arrived meanwhile
      l.release().catch(() => {});
    } else {
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    }
  } catch { /* refused or unavailable: ignore */ } finally { if (own) locking = false; }
  // keepAwake() was called during the await and no lock is held: request once more (no retry loop on refusal)
  if (wantLock && !lock && seq !== wantSeq) requestLock();
}

/** Keep the screen on while on; re-requested when the app returns to the foreground. */
export function keepAwake(on) {
  wantLock = on;
  wantSeq++;
  if (on) {
    requestLock();
  } else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    requestLock();                    // audio is resumed only when a beep is due (resuming here would stop the music)
    check();                          // recompute from the end timestamp after backgrounding
  });
}
