"""In-process client↔server harness for these tests.

`mcp.shared.memory.create_connected_server_and_client_session` was removed in
mcp 2.0 — only the raw stream pair (`create_client_server_memory_streams`)
survived. This is the same thing rebuilt on top of it, with one simplification:
it takes our `MCPServer` and reaches for the low-level server itself, so no test
has to name a private attribute any more (it was `_mcp_server` in 1.x and is
`_lowlevel_server` in 2.0 — a rename that would otherwise have to be applied in
every test file). Task 3.B0б.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import anyio
from mcp.server import MCPServer
from mcp.shared.memory import create_client_server_memory_streams

from mcp import ClientSession


@asynccontextmanager
async def connected_session(server: MCPServer) -> AsyncGenerator[ClientSession, None]:
    """Yields a client session talking to ``server`` over in-memory streams."""
    lowlevel = server._lowlevel_server

    async with create_client_server_memory_streams() as (client_streams, server_streams):
        client_read, client_write = client_streams
        server_read, server_write = server_streams

        async with anyio.create_task_group() as task_group:
            task_group.start_soon(
                lambda: lowlevel.run(
                    server_read,
                    server_write,
                    lowlevel.create_initialization_options(),
                    raise_exceptions=True,
                )
            )

            async with ClientSession(read_stream=client_read, write_stream=client_write) as client:
                await client.initialize()
                yield client

            task_group.cancel_scope.cancel()
