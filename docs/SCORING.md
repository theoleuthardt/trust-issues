# Scoring

The leaderboard ranks players by **score**. A score rewards finishing a level quickly and
dying rarely. It is computed on the server from the verified replay; the client never
reports one.

## Formula

```
timeScore = min(2000, floor(1000 * parFrames / frames))
score     = max(0, timeScore - 25 * deaths)
```

| Constant         | Value | Meaning                                                  |
| ---------------- | ----- | -------------------------------------------------------- |
| `PAR_TIME_SCORE` | 1000  | Time score of a run that takes exactly the par time      |
| `MAX_TIME_SCORE` | 2000  | Cap, reached by finishing in half the par time or faster |
| `DEATH_PENALTY`  | 25    | Points taken off per death                               |

`parFrames` is the par time of the level in frames (60 per second). It equals the frame
count of the level's recorded reference solution, so the reference solution scores exactly 1000. `frames` and `deaths` are the numbers the verifier derived from the replay; `frames`
counts all stages and all lives.

## Examples

For a level with a par time of 600 frames (10 seconds):

| Run               | Time score | Deaths | Score |
| ----------------- | ---------- | ------ | ----- |
| 10.0 s, no deaths | 1000       | 0      | 1000  |
| 8.0 s, no deaths  | 1250       | 0      | 1250  |
| 5.0 s or faster   | 2000       | 0      | 2000  |
| 20.0 s, no deaths | 500        | 0      | 500   |
| 10.0 s, 4 deaths  | 1000       | 4      | 900   |
| 60.0 s, 30 deaths | 166        | 30     | 0     |

## Ranking

Per level, ordered by:

1. score, highest first
2. frames, fewest first
3. submission time, earliest first
4. run id, lowest first, so the order is total even for two runs stored in the same instant

The order and the comparisons built on it (`ranking.py`) are used by the top list, by the
paged list and by the around-me view, so a rank is the same everywhere. Hidden runs
(see [MODERATION.md](MODERATION.md)) take no place in it.

A player keeps the best of their runs by the same ordering. The overall ranking across
levels (a sum of level scores) is a planned feature of the leaderboards epic.

## Where it lives

- `packages/sim/src/score.ts`: the pure function, with tests for the properties above
- `verifier/src/verify.ts`: returns the score together with frames and deaths
- `backend/src/trust_issues_backend/routes/runs.py`: stores the best run per user and level
  and ranks by it
- The frontend computes the same function with the shared package to show the score on the
  finish screen immediately; the leaderboard shows the server's number.

## Changing the formula

Stored scores come from the formula at submission time. Changing a constant or `parFrames`
changes what a replay is worth, so it needs a decision, a note in the release and ideally a
re-score of the stored best runs (the replays are kept for that purpose).
