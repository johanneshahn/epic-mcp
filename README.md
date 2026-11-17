# epic-mcp

An MCP (Model Context Protocol) server for **Epic Cash**. It exposes an Epic node and wallet as
structured tools for LLM clients (OpenCode, Claude Desktop, …).

- **Hybrid integration:** node via JSON-RPC v2 (`/v2/foreign`, `/v2/owner`), wallet via the
  `epic-wallet` CLI. The `epic client` subcommands are deliberately not exposed as tools because
  they require a TTY and do not work reliably over stdio.
- **Read-only by default:** all state-changing tools are blocked until you explicitly set
  `EPIC_MCP_READ_ONLY=false`. Read tools run immediately; write/destructive tools carry the
  matching annotations.
- **Network from config:** `chain_type` in `epic-server.toml` determines mainnet, floonet or
  usernet. When no config is supplied, mainnet is assumed (Epic's own default).
- **No secret leaks:** the API secret, wallet password and recovery phrase are never returned to
  the client. Tools that reveal (`recover`) or generate (`init`) seeds are intentionally absent.

## Requirements

- Node.js ≥ 20
- `epic-wallet` on `PATH` (or an absolute path via `EPIC_MCP_WALLET_BIN`)
- A running, reachable node HTTP API; for floonet, for example `epic --floonet`.
  The `epic` node binary is **not** spawned by this server.
- An initialized wallet

## Install & Build

```sh
cd epic-mcp
npm install
npm run build
npm test
```

## Configuration

All settings are supplied through environment variables. A template is available in
`.env.example` (a `.env` file is **not** loaded automatically – set variables in the client or
shell).

| Variable | Default | Meaning |
|---|---|---|
| `EPIC_MCP_NODE_BIN` | `epic` | Currently unused – node access is HTTP-only; reserved for a possible CLI fallback |
| `EPIC_MCP_NODE_URL` | from config, otherwise `3413` | Node API endpoint (highest priority) |
| `EPIC_MCP_NODE_CONFIG` | – | Path to an `epic-server.toml`. Supplies `api_http_addr` (node URL) and `chain_type` (network). Works outside `~/.epic` as well. |
| `EPIC_MCP_API_SECRET` | from `~/.epic/<chain-home>/.api_secret` | Basic auth secret |
| `EPIC_MCP_WALLET_BIN` | `epic-wallet` | Wallet binary; bare name resolved via `PATH`, or an absolute path |
| `EPIC_MCP_WALLET_PASSWORD` | – | Wallet password for unattended calls |
| `EPIC_MCP_WALLET_ACCOUNT` | `default` | Account |
| `EPIC_MCP_WALLET_NODE_URL` | – | `-r` for the wallet |
| `EPIC_MCP_WALLET_DIR` / `EPIC_MCP_WALLET_CURRENT_DIR` | – | `-t` / `-c` |
| `EPIC_MCP_READ_ONLY` | `true` | Blocks all state-changing tools (node and wallet); set to `false` to allow them |
| `EPIC_MCP_MAX_SEND_AMOUNT` | – | Optional maximum per `wallet_send`/`wallet_pay`, in EPIC |
| `EPIC_MCP_CLI_TIMEOUT_MS` | `60000` | Timeout per CLI call |
| `EPIC_MCP_HTTP_TIMEOUT_MS` | `20000` | Timeout per HTTP call |
| `EPIC_MCP_MAX_OUTPUT_CHARS` | `60000` | Output limit per tool response |

> **Important:** `epic-wallet` accepts its password only as a `-p` argument or interactively.
> For unattended automation it must therefore be provided as an environment variable. `-p` is
> visible in the process list: run the server as a dedicated OS user and protect the
> configuration with `chmod 600`. Alternatively, start the wallet in `owner_api` mode and switch
> a future version of this server over to it.

### Binary discovery

- **Node:** no `epic` binary is executed. The server talks JSON-RPC v2 to the HTTP endpoint
  resolved from `EPIC_MCP_NODE_URL`, then `api_http_addr` in `EPIC_MCP_NODE_CONFIG`, then
  `127.0.0.1:3413`. `EPIC_MCP_NODE_BIN` exists in the config schema but has no effect today.
- **Wallet:** `EPIC_MCP_WALLET_BIN` defaults to the bare name `epic-wallet` and is passed to
  Node's `execFile` with an argument array (no shell). A bare name is looked up in the `PATH`
  **of the MCP server process**, which inherits the environment of the client that launched it
  (e.g. the OpenCode background service). If the client was started from a GUI and its `PATH`
  misses the wallet's install directory, set `EPIC_MCP_WALLET_BIN` to an absolute path instead.
- If the binary cannot be found or executed, tools return
  `Binary "…" was not found or is not executable. Check EPIC_MCP_NODE_BIN / EPIC_MCP_WALLET_BIN or your PATH.`
  (that message mentions both variables for historical reasons; only `EPIC_MCP_WALLET_BIN` can
  affect binary lookup today).

## Client setup

### OpenCode V2

In `~/.config/opencode/opencode.jsonc` (global) or `opencode.jsonc` in the project:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "epic": {
        "type": "local",
        "command": ["node", "/Users/johanneshahn/repos/epic-mcp/dist/index.js"],
        "environment": {
          "EPIC_MCP_NODE_CONFIG": "/Users/johanneshahn/.epic/main/epic-server.toml",
          "EPIC_MCP_WALLET_PASSWORD": "{env:EPIC_MCP_WALLET_PASSWORD}"
        },
        "codemode": false
      }
    }
  }
}
```

Then check with `opencode mcp list`. Tools are named `epic_wallet_get_info`, etc. Prompts are
available as `/epic:epic-health-check`, etc.

Note that `{env:NAME}` is resolved when OpenCode's background service starts. Restart the service
after changing exported variables. The example sets `"codemode": false` so tools are exposed
directly (`epic_node_get_tip`) instead of through Code Mode scripts. Remove it to use Code Mode.

The server starts in **read-only** mode. To enable writes, add `"EPIC_MCP_READ_ONLY": "false"` to
the `environment` block above (or set it in the shell before starting the client). The config
guard applies to every write tool, including node tools such as `node_ban_peer`.

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "epic": {
      "command": "node",
      "args": ["/Users/johanneshahn/repos/epic-mcp/dist/index.js"],
      "env": {
        "EPIC_MCP_NODE_CONFIG": "/path/to/epic-server.toml",
        "EPIC_MCP_WALLET_PASSWORD": "…"
      }
    }
  }
}
```

## Tool overview

### Node

| Tool | Purpose | Mode |
|---|---|---|
| `node_get_status` | Node status / sync | read |
| `node_get_tip`, `node_get_version` | Tip and version | read |
| `node_get_block`, `node_get_blocks`, `node_get_header` | Chain data | read |
| `node_get_kernel`, `node_get_last_kernels` | Kernel lookup | read |
| `node_get_outputs`, `node_get_unspent_outputs` | Outputs | read |
| `node_get_pool` | Pool/stempool and unconfirmed transactions | read |
| `node_get_peers` | Peers / onion addresses | read |
| `node_validate_chain`, `node_get_block_template` | Validation / mining | read |
| `node_ban_peer`, `node_unban_peer` | Peer management | write |
| `node_push_transaction`, `node_submit_block` | Submit TX / block | write |
| `node_compact_chain` | Database compaction | destructive |

### Wallet

| Tool | Purpose | Mode |
|---|---|---|
| `wallet_get_info`, `wallet_get_address` | Balance / addresses | read |
| `wallet_list_accounts`, `wallet_create_account` | Accounts | read / write |
| `wallet_list_outputs`, `wallet_list_transactions` | Outputs / history | read |
| `wallet_export_proof`, `wallet_verify_proof`, `wallet_export_tx` | Proofs / accounting | read |
| `wallet_send`, `wallet_receive`, `wallet_finalize` | Transaction flow | write |
| `wallet_invoice`, `wallet_issue_invoice`, `wallet_pay` | Invoice flow | write |
| `wallet_post`, `wallet_repost`, `wallet_cancel` | Transaction management | write |
| `wallet_scan` | Repair outputs against the node | write |
| `wallet_import_tx` | Import transactions | write |
| `wallet_change_password` | Change password | destructive |

### Bundles, resources, prompts

- `epic_health_check` – status, version, tip, pool, peers (and optionally wallet) in one call
- `epic_wallet_report` – balance, recent transactions and outputs as a report
- Resources: `epic://node/status`, `epic://wallet/summary`, `epic://config`
- Prompts: `/epic:epic-health-check`, `/epic:epic-wallet-report`, `/epic:epic-send-assistant`

## Security model

1. **Tool output is untrusted data.** Emoji strings, slates, transaction messages and block
   contents can contain prompt-injection-style text. Never interpret them as instructions. The
   server instructions point this out to the client.
2. **Secrets stay local.** `redact()` removes the API secret, password and lines containing
   seed/recovery/passphrase terms from every tool response.
3. **Read-only is the safe default.** State-changing tools return an error until
   `EPIC_MCP_READ_ONLY=false` is set explicitly. An LLM can spend money with `wallet_send`, so
   enabling writes should be a deliberate decision; consider `EPIC_MCP_MAX_SEND_AMOUNT` or client
   permissions as additional limits.
4. **No shell.** All CLI calls use `execFile` with argument arrays.
5. **Timeouts and output limits** prevent hanging processes and context overflow.

## Floonet quick test

```sh
# 1. Start node and wallet on floonet (separate terminals)
epic --floonet
epic-wallet --floonet -p "<password>" -r http://127.0.0.1:13413 info

# 2. Test the MCP server directly (stdio: JSON-RPC only on stdout)
EPIC_MCP_NODE_CONFIG=/path/to/epic-server.toml EPIC_MCP_WALLET_PASSWORD='<password>' npm run dev
```

`npm run dev` waits for JSON-RPC on stdin (debug logs go to stderr). For a quick smoke test
without a client, `npm run check` (type check) and `npm test` are sufficient.

## Development

```sh
npm run check   # TypeScript
npm test        # Unit tests
npm run build   # dist/
```

Layout:

```text
src/
├── index.ts            # McpServer + StdioServerTransport
├── config.ts           # Environment config, secret handling
├── adapters/
│   ├── cli.ts          # execFile wrapper
│   ├── node.ts         # JSON-RPC v2 + REST
│   └── wallet.ts       # epic-wallet CLI
├── tools/
│   ├── shared.ts       # Tool registration + annotations
│   ├── node.ts
│   ├── wallet.ts
│   └── composite.ts
├── resources.ts
└── prompts.ts
```
