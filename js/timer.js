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

/** Create / resume the AudioContext; call from a user gesture (tap on "Inizia"). */
export function unlockAudio() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no sound, visual cue only */ }
}

/** Two short 880 Hz beeps; silent when audio is locked or unavailable. */
export function beep() {
  try {
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume()?.then(play, () => {}); else play();
  } catch { /* ignore */ }
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
    requestLock();
    check();                          // recompute from the end timestamp after backgrounding
  });
}
