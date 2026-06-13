# mihomo-web

[English](README.md) | 中文

mihomo 的浏览器控制面板——查看代理、规则、连接、日志，修改运行配置，一个文件跑起来。

## 特性

- **下载即用** — 单个可执行文件，不需要 Node.js 或其他运行时
- **代理管理** — 查看代理组和节点，一键测速，切换节点
- **规则查看** — 浏览规则列表，管理规则提供商，批量更新
- **连接监控** — 实时查看活动连接，按类型筛选、排序，一键断开
- **实时日志** — WebSocket 推送，按级别过滤，关键词搜索
- **配置修改** — 端口、模式、TUN、SNI 嗅探等运行时配置在线改
- **多后端切换** — 保存多个 mihomo 实例，测试连通性后一键切换
- **暗色模式** — 跟随系统 / 手动切换，浏览器本地记忆
- **只读模式** — 只看不改，适合展示或受限环境

## 构建

```bash
go build -o mihomo-web ./cmd/mihomo-web
```

版本信息注入：

```bash
go build -ldflags "-s -w \
  -X main._version=$(git describe --tags --always) \
  -X main._commit=$(git rev-parse --short HEAD) \
  -X main._date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -o mihomo-web ./cmd/mihomo-web
```

## 用法

```bash
# 最简启动，浏览器配置后端
./mihomo-web

# 指定 mihomo 地址和密钥
./mihomo-web --mihomo-url http://127.0.0.1:9090 --secret your-secret

# 启用面板访问认证
./mihomo-web --ui-secret my-token

# 只读模式
./mihomo-web --read-only

# 自定义监听地址
./mihomo-web --listen 0.0.0.0:8080

# 查看版本
./mihomo-web --version
```

### 命令行参数

| 参数 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `--listen` | `MIHOMO_WEB_LISTEN` | `127.0.0.1:8080` | HTTP 监听地址 |
| `--mihomo-url` | `MIHOMO_URL` | 空 | mihomo external-controller URL |
| `--secret` | `MIHOMO_SECRET` | 空 | mihomo external-controller secret |
| `--ui-secret` | `MIHOMO_WEB_SECRET` | 空 | 面板访问 Token，留空禁用认证 |
| `--read-only` | `MIHOMO_WEB_READ_ONLY` | false | 禁用写操作 |
| `--version` | — | — | 打印版本信息 |

## 页面

| 路由 | 页面 | 功能 |
|---|---|---|
| `/` | — | 重定向至 `/proxies` |
| `/home` | 概览 | 上传/下载总量、活动连接、实时速率与内存图表 |
| `/proxies` | 代理 | 代理组/提供商双标签、节点搜索、单节点/组延迟测试 |
| `/rules` | 规则 | 规则提供商/规则列表双标签、搜索、批量更新 |
| `/connections` | 连接 | 活动/已断开双标签、类型筛选、排序、列配置、暂停刷新 |
| `/logs` | 日志 | 实时日志流、级别过滤、关键词搜索、暂停 |
| `/config` | 配置 | 常规/TUN/管理/面板四段式配置表单 |
| `/backends` | 后端 | 多后端 CRUD、连接测试、激活切换 |
| `/about` | 关于 | 版本信息、核心版本、运行模式 |
| `/login` | 登录 | `--ui-secret` 非空时显示 |

## 架构

```
┌─────────────┐      ┌──────────────────────────┐
│   Browser   │─────▶│  mihomo external-controller │
│             │      │  (REST + WebSocket)        │
│             │      └──────────────────────────┘
│             │
│             │      ┌──────────────────────────┐
│             │─────▶│  mihomo-web (Go)          │
│             │      │  - 提供页面和静态资源       │
│             │      │  - 不代理 mihomo API       │
└─────────────┘      └──────────────────────────┘
```

浏览器直接连接 mihomo API；mihomo-web 仅服务 HTML/CSS/JS。

## 项目结构

```
cmd/mihomo-web/main.go       入口，CLI 参数与构建信息
internal/server/
  server.go                   HTTP 服务、路由注册
  auth.go                     UI Token 认证
  pages.go                    模板渲染、客户端配置注入
  server_test.go              测试
internal/web/
  embed.go                    go:embed 声明
  templates/
    layout.gohtml             共享布局、导航栏、主题切换
    pages.gohtml              各页面模板
  static/
    style.css                 设计系统与组件样式
    app.js                    全部前端逻辑
```

## 测试

```bash
go test ./...
```

## 依赖

- Go 1.23+
- 运行中的 mihomo 核心（开启 `external-controller`）

## License

GPL-3.0
