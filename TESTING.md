# Dataset Replay verification

Use an existing supported Node.js runtime. There are no dependencies to install.

~~~sh
node tests/core.mjs
node tests/smoke.mjs
node tests/edges.mjs
~~~

The 58 checks cover core CSV policy behavior, the stdio protocol and simulated report interactions, and known boundary cases. The standalone suite was rerun from the released source on Linux with Node 24.22.3. The same runtime code and fixtures passed on Windows with Node 24.22.1.

## Reproduce the three synthetic checks

~~~sh
node server.mjs --demo broken
node server.mjs --demo clean
node server.mjs --receipt < examples/short-export.json
~~~

The broken case flags candidate line 3 (blank price), line 4 (duplicate key, first seen on line 3), and line 5 (zero below the price floor). The clean reorder passes with zero findings. The short export fails minimum row and key coverage at the dataset level (1 of 4 keys retained), without assigning invented line numbers. Input values are fictional.

## Cursor

On Windows in Cursor 3.30.14, the local plugin registered its skill, two MCP tools, and a resource. Calling the broken and clean synthetic demos in Cursor produced separate native report frames with the expected results. This is a tested example, not an endorsement or a guarantee for other operating systems, accounts, Cursor versions, or MCP hosts.

The server supports handshake-based MCP revisions 2024-11-05, 2025-03-26, 2025-06-18, and 2025-11-25. The interactive report requires negotiated MCP Apps capability; text receipts are available without it. The newer stateless server discovery lifecycle is not implemented.
