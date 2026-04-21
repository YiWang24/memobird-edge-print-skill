# Memobird Edge Print Skill

[中文](#中文说明) | [English](#english)

---

## 中文说明

### 项目简介

这是一个公开的 Codex skill 仓库，用来做两件事：

1. 总结 Memobird 网页版打印纸条的抓包和逆向方法。
2. 提供一个可直接运行的脚本，通过复用本机 Microsoft Edge 已登录的会话，自动获取最新的 `userId` / `smartGuid` 包装值并发送 `PrintPaper` 请求。

这个仓库的重点不是“保存一次抓包结果并回放”，而是“解释请求链路，并在运行时重新取到当前有效的参数”。

### 为什么要这样做

Memobird 网页接口里的关键字段，例如：

- `toUserId`
- `guidList`

看起来像固定 ID，但实际是带时间信息的包装值。一次抓包拿到的值只能说明请求结构，不能作为长期稳定的实现方案。

因此，本仓库采用的策略是：

- 用抓包确认真实请求流程
- 用前端源码确认字段来源
- 用当前 Edge 登录态动态请求最新值
- 避免把真实 cookie、用户名、设备名、手机号、包装后的 ID 提交进仓库

### 仓库内容

- `SKILL.md`
  供 agent 使用的技能入口，说明什么时候触发这个 skill、怎么安全抓包、怎么用脚本发起打印。
- `references/reverse-engineering.md`
  详细记录抓包方法、接口链路、字段来源，以及为什么不能直接写死一次抓包结果。
- `scripts/memobird-print.mjs`
  可执行脚本。支持列出目标、预览请求、直接打印、按中英文宽度自动换行。

### 工作原理

脚本的核心流程如下：

1. 从本机 Edge Cookie 数据库中读取 `logininfo`
2. 通过 macOS Keychain 中的 `Microsoft Edge Safe Storage` 解密 cookie
3. 请求 `GetLanderInfo`
4. 请求 `LoginWeb`
5. 从返回数据中获取当前有效的 note 目标和 printer 目标
6. 组装 `PrintPaper` 请求并发送

也就是说，真正用到的参数不是保存在仓库里的，而是每次运行时重新从当前会话计算得到。

### 适用场景

适合以下任务：

- “帮我抓包咕咕机网页接口”
- “帮我总结 Memobird Web 的打印请求”
- “复用 Edge 登录态直接打印纸条”
- “解释 `PrintPaper` 的参数从哪里来”
- “做一个不泄露个人信息的 Memobird 自动打印 repo / skill”

### 环境要求

- macOS
- Microsoft Edge
- 已在 Edge 中登录 `https://w.memobird.cn/cn/w/mailList.html`
- 本机可用：
  - `node`
  - `sqlite3`
  - `security`

当前版本只支持 macOS，因为脚本依赖本地 Edge cookie 存储格式和 macOS keychain 解密方式。

### 安装方式

#### 1. 克隆仓库

```bash
git clone https://github.com/YiWang24/memobird-edge-print-skill.git
cd memobird-edge-print-skill
```

#### 2. 作为 skill 使用

如果你的 agent 支持通过 `SKILL.md` 直接加载 skill，把这个仓库放到对应的 skill 目录下，或者做一个软链接即可。

示例：

```bash
ln -s /absolute/path/to/memobird-edge-print-skill /your/skills/path/memobird-edge-print-skill
```

这个仓库顶层就有 `SKILL.md`，所以仓库根目录本身就是 skill 根目录。

### 抓包 / 逆向方法摘要

推荐顺序如下：

#### 1. 先看源码，再看抓包

打开：

- `mailList.html`
- `Scripts/Ajax/mailListAjax.js`

在前端源码里搜索：

- `PrintPaper`
- `GetLanderInfo`
- `LoginWeb`
- `GetFriends`
- `GetSmartCoreByUserID`

这样能先确认每个字段是从哪里来的，而不是只盯着 Network 面板里的某一次请求。

#### 2. 用浏览器抓包验证行为

在 Edge 中：

1. 打开 `https://w.memobird.cn/cn/w/mailList.html`
2. 打开 DevTools
3. 切到 `Network`
4. 过滤 `Fetch/XHR`
5. 触发页面刷新、选择好友、选择设备、或者发送一张测试纸条
6. 观察 `DBInterface.ashx` 请求

#### 3. 核对关键字段来源

`PrintPaper` 的主要字段来源为：

- `fromUserName`
  来自当前登录用户信息
- `toUserId`
  来自当前选中的纸条对象
- `toUserName`
  来自当前选中的纸条对象显示名称
- `guidList`
  来自当前选中的打印设备
- `printContent`
  来自编辑器 HTML 内容，并再做一次 URL 编码
- `t`
  时间戳

#### 4. 不要把抓包值写死

抓包出来的 `toUserId` / `guidList` 是运行时包装值，不应该当成永久密钥保存在代码里。稳定做法是每次运行时重新向页面已有接口取最新值。

### 脚本使用

#### 查看当前 note 目标和打印机

```bash
node scripts/memobird-print.mjs --list
```

默认会把包装后的 ID 打码。

#### 预览请求但不实际打印

```bash
node scripts/memobird-print.mjs \
  --dry-run \
  --device "My Memobird" \
  --text $'标题\n第二行'
```

#### 直接打印

```bash
node scripts/memobird-print.mjs \
  --device "My Memobird" \
  --text $'Hello\nPrinted from Edge session reuse'
```

#### 从文件读取文本

```bash
node scripts/memobird-print.mjs \
  --device "My Memobird" \
  --file ./note.txt
```

#### 从标准输入读取文本

```bash
printf '第一行\n第二行\n' | node scripts/memobird-print.mjs
```

#### 指定 recipient

```bash
node scripts/memobird-print.mjs \
  --recipient "我" \
  --text "打印给自己"
```

#### 调试时显示真实包装 ID

```bash
node scripts/memobird-print.mjs --list --show-ids
```

只有在明确需要调试时才建议使用 `--show-ids`。

### 主要参数

- `--list`
  列出当前 note 目标和打印设备
- `--dry-run`
  只生成请求预览，不实际打印
- `--text`
  直接传入文本内容
- `--file`
  从文件读取打印内容
- `--device`
  指定打印机名称
- `--recipient`
  指定纸条对象
- `--width`
  自动换行时的显示宽度，默认 `32`
- `--no-wrap`
  关闭自动换行
- `--show-ids`
  显示真实包装 ID，不再打码
- `--debug`
  打印接口原始返回

### 自动排版说明

脚本默认会做基础自动换行：

- 中文按宽度 `2` 计算
- ASCII 按宽度 `1` 计算
- 默认宽度为 `32`
- 每一行会被转成 Memobird 网页端实际发送的 HTML 片段

这不是对网页编辑器的完整复刻，而是一个适合纯文本纸条的稳定默认策略。

### 隐私与安全设计

这个仓库专门做了几层防泄露处理：

- README 示例全部使用泛化名称，不使用真实账号和设备名
- 脚本默认会把包装后的 `userId` / `smartGuid` 打码
- `--dry-run` 默认也会打码表单中的敏感字段
- 脚本不会把 cookie 写入文件
- 仓库不包含任何真实抓包结果、真实 cookie、真实包装 ID

如果你要把这个仓库再公开传播，建议发布前至少再做一次全文检索，搜索：

- 用户名
- 设备名
- 邮箱
- 手机号
- `eyJ`
- `logininfo`

### 限制

- 目前仅支持 macOS
- 目前仅支持 Microsoft Edge
- 前提是用户已经在 Edge 中登录 Memobird Web
- 这个脚本适合文本纸条，不是完整的网页编辑器克隆

### 排错建议

#### `Could not read the Edge logininfo cookie`

通常说明：

- Edge 没登录 Memobird
- 用的不是默认 profile
- 当前系统权限或本机 cookie 库路径异常

可尝试：

- 先在 Edge 正常打开并登录 `mailList.html`
- 用 `--profile` 指定非默认 profile

#### 打印失败但能列出设备

通常优先检查：

- 当前账号是否确实绑定目标设备
- 设备是否在线
- recipient / device 是否选对

#### 需要确认字段来源

先看：

- `SKILL.md`
- `references/reverse-engineering.md`

再配合浏览器抓包和前端源码一起核对，不要只看某一条请求。

---

## English

### Overview

This repository is a public Codex skill for two related tasks:

1. Document the reverse engineering process behind Memobird Web printing.
2. Provide a working helper script that reuses the local Microsoft Edge login session to fetch fresh wrapped IDs and send `PrintPaper`.

The main idea is not “capture once and replay forever.” The correct strategy is to understand the request flow, then resolve fresh runtime values from the current session whenever the script runs.

### Why This Exists

Important Memobird request fields such as:

- `toUserId`
- `guidList`

may look like stable IDs, but in practice they are wrapped runtime values that include time-scoped data. A packet capture is useful for learning the protocol, but it is not a good long-term implementation strategy.

This repository therefore focuses on:

- confirming the real request flow through browser capture
- tracing field origins through frontend source
- resolving fresh values from the current Edge session
- keeping cookies, wrapped IDs, personal names, and device names out of the published repository

### Repository Contents

- `SKILL.md`
  Agent-facing instructions describing when to trigger the skill, how to inspect the Memobird flow safely, and how to use the helper script.
- `references/reverse-engineering.md`
  Detailed notes about the reverse engineering workflow, request chain, field origins, and privacy rules.
- `scripts/memobird-print.mjs`
  Executable helper script for listing targets, previewing requests, and printing text notes.

### How It Works

The script follows this runtime flow:

1. Read `logininfo` from the local Edge cookie database
2. Decrypt it using `Microsoft Edge Safe Storage` from the macOS keychain
3. Call `GetLanderInfo`
4. Call `LoginWeb`
5. Resolve the current note target and printer target from those live responses
6. Send `PrintPaper`

In other words, the repository does not store live wrapped IDs. It recomputes them at runtime from the local logged-in session.

### Use Cases

Use this repository when the task is something like:

- “reverse engineer Memobird Web printing”
- “capture the Memobird request flow”
- “print a note by reusing Edge login state”
- “explain where the `PrintPaper` fields come from”
- “publish a sanitized Memobird automation skill or repository”

### Requirements

- macOS
- Microsoft Edge
- Logged into `https://w.memobird.cn/cn/w/mailList.html` in Edge
- The following tools available locally:
  - `node`
  - `sqlite3`
  - `security`

The current implementation is macOS-only because it depends on the local Edge cookie layout and macOS keychain decryption.

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/YiWang24/memobird-edge-print-skill.git
cd memobird-edge-print-skill
```

#### 2. Use it as a skill

If your agent system supports skill loading through a top-level `SKILL.md`, place this repository inside your skill directory or create a symlink to it.

Example:

```bash
ln -s /absolute/path/to/memobird-edge-print-skill /your/skills/path/memobird-edge-print-skill
```

The repository root is the skill root because `SKILL.md` is at the top level.

### Reverse Engineering Summary

Recommended order:

#### 1. Read source before trusting a packet capture

Inspect:

- `mailList.html`
- `Scripts/Ajax/mailListAjax.js`

Search for:

- `PrintPaper`
- `GetLanderInfo`
- `LoginWeb`
- `GetFriends`
- `GetSmartCoreByUserID`

This makes it easier to understand where each request field originates before looking at one specific Network entry.

#### 2. Use browser capture to confirm behavior

In Edge:

1. Open `https://w.memobird.cn/cn/w/mailList.html`
2. Open DevTools
3. Switch to `Network`
4. Filter to `Fetch/XHR`
5. Refresh the page or send a test note
6. Inspect `DBInterface.ashx` traffic

#### 3. Verify field origins

The main `PrintPaper` fields come from:

- `fromUserName`
  from the current logged-in account
- `toUserId`
  from the currently selected note target
- `toUserName`
  from the selected note target label
- `guidList`
  from the selected printer
- `printContent`
  from the editor HTML, then URL-encoded again
- `t`
  current timestamp

#### 4. Do not hardcode captured wrapped values

Captured `toUserId` and `guidList` values are runtime wrappers, not permanent secrets to commit into source code. The stable strategy is to fetch fresh values on each run.

### Script Usage

#### List available note targets and printers

```bash
node scripts/memobird-print.mjs --list
```

Wrapped IDs are redacted by default.

#### Preview a request without printing

```bash
node scripts/memobird-print.mjs \
  --dry-run \
  --device "My Memobird" \
  --text $'Title\nSecond line'
```

#### Print a note

```bash
node scripts/memobird-print.mjs \
  --device "My Memobird" \
  --text $'Hello\nPrinted from Edge session reuse'
```

#### Read note text from a file

```bash
node scripts/memobird-print.mjs \
  --device "My Memobird" \
  --file ./note.txt
```

#### Read note text from stdin

```bash
printf 'line one\nline two\n' | node scripts/memobird-print.mjs
```

#### Select a specific recipient

```bash
node scripts/memobird-print.mjs \
  --recipient "我" \
  --text "print to self"
```

#### Reveal raw wrapped IDs for debugging

```bash
node scripts/memobird-print.mjs --list --show-ids
```

Use `--show-ids` only when raw debugging output is explicitly needed.

### Main Options

- `--list`
  show current note targets and printers
- `--dry-run`
  preview the resolved request without printing
- `--text`
  pass note text inline
- `--file`
  load note text from a file
- `--device`
  choose the printer by name
- `--recipient`
  choose the note target
- `--width`
  display width used for wrapping, default `32`
- `--no-wrap`
  disable automatic wrapping
- `--show-ids`
  reveal raw wrapped IDs instead of redacting them
- `--debug`
  print the raw API response

### Layout Behavior

The script applies basic text layout rules by default:

- Chinese characters count as width `2`
- ASCII characters count as width `1`
- default line width is `32`
- each line is converted into the same kind of HTML fragment the Memobird web editor sends

This is meant to be a stable default for plain text notes, not a full clone of the original web editor.

### Privacy and Safety

This repository is intentionally designed to reduce accidental data leakage:

- README examples use generic names only
- wrapped `userId` and `smartGuid` values are redacted by default
- `--dry-run` also redacts sensitive request fields unless `--show-ids` is used
- the script does not write cookies to disk
- no live packet capture, cookie, or wrapped ID is committed to the repository

If you republish or adapt this repository, run a final search for:

- names
- device names
- emails
- phone numbers
- `eyJ`
- `logininfo`

### Limitations

- macOS only
- Microsoft Edge only
- requires the user to already be logged into Memobird Web
- optimized for text note printing, not for full WYSIWYG editor parity

### Troubleshooting

#### `Could not read the Edge logininfo cookie`

This usually means one of the following:

- Edge is not logged into Memobird
- a non-default Edge profile is being used
- the local cookie database path or permissions are different

Try:

- logging into `mailList.html` in Edge first
- passing a different profile through `--profile`

#### Printing fails even though printers are listed

Check:

- whether the account is actually bound to the selected device
- whether the device is online
- whether the intended recipient and device were selected correctly

#### Need to trace field origins again

Start with:

- `SKILL.md`
- `references/reverse-engineering.md`

Then confirm with browser DevTools and frontend source together. Do not rely on a single captured request in isolation.
