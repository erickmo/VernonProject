// Peer-vote / superpower scale — single source for both frontends (@ = shared).
// Votes and Performance scores both live on 1–4. Change here and the buttons,
// progress bars and range hints across /m and /w follow. Backend has its own
// mirror of these bounds in api/superpowers.py (cast_vote / _perf_scores).
export const VOTE_MIN = 1
export const VOTE_MAX = 4
export const VOTE_OPTIONS = [1, 2, 3, 4] as const

// A 1–4 score → 0–100% bar width (clamped). weighted/avg/perf all use this.
export const scorePct = (x: number) =>
  Math.max(0, Math.min(100, ((x - VOTE_MIN) / (VOTE_MAX - VOTE_MIN)) * 100))
