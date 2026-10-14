"""The address of the client behind a trusted reverse proxy or tunnel."""

import ipaddress
from collections.abc import Mapping


def _parse(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def _trusted(peer: str, trusted: tuple[str, ...]) -> bool:
    try:
        address = ipaddress.ip_address(peer)
    except ValueError:
        return False
    for entry in trusted:
        try:
            if address in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


def client_ip(peer: str | None, headers: Mapping[str, str], trusted: tuple[str, ...]) -> str:
    """
    The peer address, or the forwarded client address when the peer is a trusted proxy.
    Forwarding headers from anyone else are ignored, so a client cannot choose its own address.
    """
    if peer is None:
        return "unknown"
    if not _trusted(peer, trusted):
        return peer
    forwarded = _parse(headers.get("cf-connecting-ip"))
    if forwarded is None:
        first = (headers.get("x-forwarded-for") or "").split(",")[0]
        forwarded = _parse(first)
    return forwarded or peer
