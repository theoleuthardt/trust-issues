from trust_issues_backend.ratelimit import SlidingWindowLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_the_limit_then_refuses() -> None:
    limiter = SlidingWindowLimiter(max_events=3, window_seconds=60, clock=Clock())

    assert [limiter.hit("a") for _ in range(4)] == [None, None, None, 60]


def test_allows_again_when_the_window_has_passed() -> None:
    clock = Clock()
    limiter = SlidingWindowLimiter(max_events=2, window_seconds=60, clock=clock)
    limiter.hit("a")
    limiter.hit("a")

    clock.now += 61

    assert limiter.hit("a") is None


def test_reports_how_long_until_the_oldest_event_expires() -> None:
    clock = Clock()
    limiter = SlidingWindowLimiter(max_events=2, window_seconds=60, clock=clock)
    limiter.hit("a")
    clock.now += 20
    limiter.hit("a")
    clock.now += 10

    assert limiter.hit("a") == 30


def test_keys_are_independent() -> None:
    limiter = SlidingWindowLimiter(max_events=1, window_seconds=60, clock=Clock())

    assert limiter.hit("a") is None
    assert limiter.hit("b") is None
    assert limiter.hit("a") is not None


def test_does_not_count_refused_attempts_as_new_events() -> None:
    clock = Clock()
    limiter = SlidingWindowLimiter(max_events=1, window_seconds=60, clock=clock)
    limiter.hit("a")
    for _ in range(5):
        limiter.hit("a")

    clock.now += 61

    assert limiter.hit("a") is None


def test_forgets_idle_keys() -> None:
    clock = Clock()
    limiter = SlidingWindowLimiter(max_events=1, window_seconds=60, clock=clock)
    for key in ("a", "b", "c"):
        limiter.hit(key)

    clock.now += 61
    limiter.hit("d")

    assert limiter.tracked_keys() == 1
