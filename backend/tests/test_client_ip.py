from trust_issues_backend.client_ip import client_ip


def test_uses_the_peer_when_no_proxy_is_trusted() -> None:
    assert client_ip("203.0.113.9", {"cf-connecting-ip": "198.51.100.7"}, ()) == "203.0.113.9"


def test_uses_the_forwarded_address_from_a_trusted_proxy() -> None:
    headers = {"cf-connecting-ip": "198.51.100.7"}

    assert client_ip("10.0.0.5", headers, ("10.0.0.0/8",)) == "198.51.100.7"


def test_falls_back_to_the_first_forwarded_for_hop() -> None:
    headers = {"x-forwarded-for": "198.51.100.7, 10.0.0.5"}

    assert client_ip("10.0.0.5", headers, ("10.0.0.5",)) == "198.51.100.7"


def test_ignores_forwarding_headers_from_an_untrusted_peer() -> None:
    headers = {"cf-connecting-ip": "198.51.100.7"}

    assert client_ip("192.0.2.50", headers, ("10.0.0.0/8",)) == "192.0.2.50"


def test_ignores_a_forwarded_value_that_is_not_an_ip_address() -> None:
    headers = {"cf-connecting-ip": "not-an-ip"}

    assert client_ip("10.0.0.5", headers, ("10.0.0.0/8",)) == "10.0.0.5"


def test_handles_a_missing_peer() -> None:
    assert client_ip(None, {}, ()) == "unknown"
