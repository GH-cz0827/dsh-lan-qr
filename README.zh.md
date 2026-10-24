# dsh-lan-qr · 扫码局域网连接

[English](README.md) | 中文

给 DeepSeek Harness（dsh）Desktop 的**窗口菜单行**加一个**配对二维码按钮**。
点一下弹出小卡片，把当前局域网地址渲染成可扫描的二维码，手机扫码即可连接，
不用手输 IP。

和 [dsh-refresh-button](https://github.com/GH-cz0827/dsh-refresh-button)
天然配套：二维码按钮排在「编辑」控件右侧、与刷新按钮同一行；没装那个包也能独立工作。

## 行为

- 菜单行一个 24px 图标按钮，深色主题下自动反色；
- 点开是锚定在按钮下方的小卡片（**不用遮罩**——Electron 的最小化/关闭按钮画在 DOM 之外，
  任何压暗都会露出缺口）；
- 卡片里是宿主渲染的 240px SVG 二维码 + 可直接选中的地址文本 + 「复制链接」；
- `Esc`、点卡片外部、点「关闭」都能收起。

地址来源：

1. `$DSH_LAN_QR_STATE_FILE`，或 `~/.dsh/desktop-lan-url.txt` 的最后一行非空内容
   —— 桌面宿主每次启动写入的配对地址（含中继/隧道域名）；
2. 没有该文件时，用本机 IPv4 网卡 + 浏览器当前使用的端口推断，作为 `candidates`
   在卡片里列出，全新环境也能看到有用信息。

## 安装

```bash
dsh plugin install dsh-lan-qr
# 或直接从 GitHub
dsh plugin install github:GH-cz0827/dsh-lan-qr
```

应用内走 **插件 → 添加**（填仓库地址），或 dshmarket / 插件管理器。
本地目录安装用 `plugin_manager install_bundle`（target 指向包目录），装完重启一次 dsh。

## 宿主路由

| 路由 | 用途 |
|---|---|
| `GET /lan-qr/state` | `{ url, svg, hasUrl, source, stateFile, candidates, package, version }` |
| `GET /lan-qr/state.json` | 同上 |
| `GET /lan-qr/icon.svg` | 按钮图标（`$DSH_LAN_QR_ICON` 可覆盖） |
| `GET /lan-qr/icon` | 同上，无扩展名 |

全部只读，并带 `Cache-Control: no-store`。

## 配置

| 环境变量 | 作用 |
|---|---|
| `DSH_LAN_QR_STATE_FILE` | 从另一个文件读取配对地址 |
| `DSH_LAN_QR_ICON` | 自备图标绝对路径（SVG/PNG/WebP） |
| `DSH_LAN_QR_LOG` | 日志路径，默认 `<tmp>/dsh-lan-qr.log` |

## 结构

```
dsh-lan-qr/
├── package.json              # dsh.bundle.patch + dsh.client(platform: web)
├── cordis.patch.yml          # 插入 `lan-qr` 这一行
├── lib/index.js              # 宿主半：/lan-qr/state + 二维码 SVG + 图标
├── lib/client.js             # 浏览器半：按钮 + 卡片
├── assets/qrcode.js          # vendored qrcode-generator 1.4.4（MIT）
├── assets/icon.svg           # 自绘图标（MIT）
├── locale/{en,zh}.json       # meta.title / meta.description
├── THIRD-PARTY-NOTICES.md
└── tools/build-index.mjs     # 生成 index.json（市场 format 1 索引）
```

## 安全说明

二维码只编码一个地址，不含任何 token。能访问该局域网地址的人本来就能打开界面，
请用自带的鉴权与网络边界保护宿主；本插件除上面几个只读路由外不新增暴露面。

## 发布清单

1. `GH-cz0827` 已写入 `package.json`、`README.md`、`README.zh.md`；
2. `npm publish`；
3. 打 tag 发布：`.github/workflows/release.yml` 打包 tarball 并挂到 Release
   （dshmarket 首选的预构建安装路径）；
4. `node tools/build-index.mjs --repo https://github.com/GH-cz0827/dsh-lan-qr --category remote`
   生成并提交 `index.json`，在 dsh 的 **插件 → 发现 → 索引源** 里加上它；
5. 可选：向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR。

## 许可

MIT。`assets/qrcode.js` 为 MIT（Kazuhiko Arase），见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
