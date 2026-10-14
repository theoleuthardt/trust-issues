"""A small in-process sliding window limiter."""

import time
from collections import deque
from collections.abc import Callable


class SlidingWindowLimiter:
    """
    Allows `max_events` per key within `window_seconds`. `hit` records an event and returns
    None when it is allowed, or the number of seconds until it would be (refused attempts are
    not recorded). State lives in this process; with several backend processes the limit is
    per process.
    """

    def __init__(
        self,
        max_events: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max_events
        self._window = window_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}

    def hit(self, key: str) -> int | None:
        now = self._clock()
        self._forget_idle(now)
        events = self._events.setdefault(key, deque())
        while events and events[0] <= now - self._window:
            events.popleft()
        if len(events) >= self._max:
            return max(1, int(events[0] + self._window - now + 0.999))
        events.append(now)
        return None

    def tracked_keys(self) -> int:
        return len(self._events)

    def _forget_idle(self, now: float) -> None:
        idle = [
            key
            for key, events in self._events.items()
            if not events or events[-1] <= now - self._window
        ]
        for key in idle:
            del self._events[key]
