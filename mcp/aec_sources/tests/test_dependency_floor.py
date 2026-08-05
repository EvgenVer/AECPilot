"""Version floors this workspace inherits from the Hermes core's own pins.

Our MCP servers deliberately declare a RANGE (``mcp>=1,<2``) rather than the
core's exact pin: they speak a protocol to it over stdio, not an ABI, and
matching their release cadence would buy nothing. The one thing a range must
not do is drift BELOW a version that was pinned for a security fix — which is
exactly what happened upstream: 0.20.0 raised ``starlette`` to 1.3.1 because
1.0.1 was the fix for CVE-2026-48710 (Host-header authentication bypass in
Starlette, reaching FastAPI and the MCP HTTP transport).

``starlette`` arrives here transitively through ``mcp``. This test is the floor
under that transitive edge, in the workspace environment; the core's own venv
is pinned by the core (task 1.7.9).
"""

from importlib.metadata import version


def _parts(raw: str) -> tuple[int, ...]:
    return tuple(int(piece) for piece in raw.split("-")[0].split(".")[:3] if piece.isdigit())


def test_starlette_is_at_or_above_the_cve_fix():
    assert _parts(version("starlette")) >= (1, 0, 1), (
        "starlette below 1.0.1 carries CVE-2026-48710; the Hermes core pins 1.3.1"
    )


def test_mcp_major_matches_the_core():
    # A major bump in the protocol library is the one skew that can actually
    # break the stdio handshake with the core's client.
    assert _parts(version("mcp"))[0] == 1
