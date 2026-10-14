# Character movement continuity

The browser receives irregular entity snapshots. Rendering at 60 FPS does not
make those snapshots continuous. Two problems were found in the old path:

- Its fixed 100 ms reserve ran dry during a 10 Hz stream with ordinary arrival
  jitter, producing holds followed by catch-up steps.
- The observer camera smoothed the newest network position independently of the
  displayed avatar. These two clocks could move the character within the frame.

`EntityPositionTimeline` now reserves 150–250 ms, bounded by recent arrival gaps.
Its playback clock changes speed gradually and never reverses. It interpolates
only received positions, stops at the last sample, and blends a small restart
from the visible root. Initial placement, explicit instant updates and large
discontinuities still snap. Passenger handling and deletion cleanup are retained.
This is visual latency, not a delay in game controls or an estimate of future
movement. A prolonged stream outage can still stop the displayed character.

Third-person/dungeon follow uses the displayed entity root after entity tweens
advance, before scene-origin rebasing, culling and drawing. It does not follow a
head bone or apply a second positional smoother. Chunk streaming and gameplay
facts keep their authoritative positions. Camera director composition and
first-person look remain separate. Per-frame follow does not refresh panels or
re-stream chunks.

Verification (2026-10-14): the same isolated 10 Hz / alternating 35 ms jitter
replay, at 4 blocks/s and 5 ms samples, produced 161 held intervals with the old
bundle and zero with the new one (1,059 samples); maximum step fell from 0.104 to
0.031 blocks. No reverse step occurred. A 20 s live dungeon sample had 1,201
frames, median interval 16.5 ms and p95 22.2 ms, with zero camera/root positional
error. Only 92 frames had a movement flag; this short walk plus idle is not proof
of smoothness across all terrain, network stalls, devices or camera modes.

Coverage includes jitter, stationary repeats, long idle restart, stale samples,
teleports, passenger/deletion hooks, floating origins, frame ordering and the
compiled client integration. Both default and Qiandengji builds are checked.
No game restart or movement command is needed to deploy or test these assets.
