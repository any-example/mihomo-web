# mihomo-web

English | [中文](README_CN.md)

A browser control panel for mihomo — view proxies, rules, connections and logs, edit runtime config, one binary to run.

## Features

- **Download and run** — Single executable, no Node.js or other runtime needed
- **Proxy management** — View proxy groups and nodes, one-click latency test, switch nodes
- **Rule viewer** — Browse rule list, manage rule providers, batch update
- **Connection monitor** — Live view of active connections, filter by type, sort, one-click close
- **Real-time logs** — WebSocket streaming, filter by level, keyword search
- **Config editing** — Change ports, mode, TUN, SNI sniffing and other runtime settings in-browser
- **Multi-backend switch** — Save multiple mihomo instances, test connectivity, one-click switch
- **Dark mode** — Follow system / manual toggle, persisted in browser
- **Read-only mode** — View only, no modifications — suitable for display or restricted environments

## Build

```bash
go build -o mihomo-web ./cmd/mihomo-web
```

With version info injected:

```bash
go build -ldflags "-s -w \
  -X main._version=$(git describe --tags --always) \
  -X main._commit=$(git rev-parse --short HEAD) \
  -X main._date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -o mihomo-web ./cmd/mihomo-web
```

## Usage

```bash
# Minimal start, configure backend in browser
./mihomo-web

# Specify mihomo address and secret
./mihomo-web --mihomo-url http://127.0.0.1:9090 --secret your-secret

# Enable panel access authentication
./mihomo-web --ui-secret my-token

# Read-only mode
./mihomo-web --read-only

# Custom listen address
./mihomo-web --listen 0.0.0.0:8080

# Show version
./mihomo-web --version
```

### CLI Flags

| Flag | Env Variable | Default | Description |
|---|---|---|---|
| `--listen` | `MIHOMO_WEB_LISTEN` | `127.0.0.1:8080` | HTTP listen address |
| `--mihomo-url` | `MIHOMO_URL` | empty | mihomo external-controller URL |
| `--secret` | `MIHOMO_SECRET` | empty | mihomo external-controller secret |
| `--ui-secret` | `MIHOMO_WEB_SECRET` | empty | Panel access token; empty disables auth |
| `--read-only` | `MIHOMO_WEB_READ_ONLY` | false | Disable write operations |
| `--version` | — | — | Print version info |

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | — | Redirects to `/proxies` |
| `/home` | Overview | Upload/download totals, active connections, live speed & memory charts |
| `/proxies` | Proxies | Proxy groups/providers dual-tab, node search, single/group latency test |
| `/rules` | Rules | Rule providers/list dual-tab, search, batch update |
| `/connections` | Connections | Active/closed dual-tab, type filter, sort, column config, pause refresh |
| `/logs` | Logs | Real-time log stream, level filter, keyword search, pause |
| `/config` | Config | General/TUN/Admin/Panel four-section config form |
| `/backends` | Backends | Multi-backend CRUD, connectivity test, activate switch |
| `/about` | About | Version info, core version, run mode |
| `/login` | Login | Shown when `--ui-secret` is set |

## Architecture

```
┌─────────────┐      ┌──────────────────────────┐
│   Browser   │─────▶│  mihomo external-controller │
│             │      │  (REST + WebSocket)        │
│             │      └──────────────────────────┘
│             │
│             │      ┌──────────────────────────┐
│             │─────▶│  mihomo-web (Go)          │
│             │      │  - Serves pages & assets   │
│             │      │  - Does NOT proxy mihomo   │
└─────────────┘      └──────────────────────────┘
```

Browser connects to mihomo API directly; mihomo-web only serves HTML/CSS/JS.

## Project Structure

```
cmd/mihomo-web/main.go       Entry point, CLI flags & build info
internal/server/
  server.go                   HTTP server, route registration
  auth.go                     UI token authentication
  pages.go                    Template rendering, client config injection
  server_test.go              Tests
internal/web/
  embed.go                    go:embed declarations
  templates/
    layout.gohtml             Shared layout, navbar, theme toggle
    pages.gohtml              Page templates
  static/
    style.css                 Design system & component styles
    app.js                    All frontend logic
```

## Testing

```bash
go test ./...
```

## Dependencies

- Go 1.23+ (standard library only)
- A running mihomo core with `external-controller` enabled

## License

GPL-3.0
