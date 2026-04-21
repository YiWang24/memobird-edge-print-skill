# Memobird Edge Print Skill

[中文](#中文说明) | [English](#english)

---

## 中文说明

### 项目简介

这是一个公开的 Codex skill 仓库，用来做两件事：

1. 总结 Memobird 网页版打印纸条的抓包和逆向方法。
2. 提供一个可直接运行的脚本，既支持复用本机 Microsoft Edge 已登录的会话自动取值，也支持人类手动准备环境变量并发送 `PrintPaper` 请求。

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
  可执行脚本。支持列出目标、预览请求、直接打印、按中英文宽度自动换行，以及通过环境变量覆盖关键请求参数。
- `env.example.sh`
  给人类使用的环境变量模板。复制后填入自己的值即可。

### 工作原理

脚本的核心流程如下：

1. 从本机 Edge Cookie 数据库中读取 `logininfo`
2. 通过 macOS Keychain 中的 `Microsoft Edge Safe Storage` 解密 cookie
3. 请求 `GetLanderInfo`
4. 请求 `LoginWeb`
5. 从返回数据中获取当前有效的 note 目标和 printer 目标
6. 组装 `PrintPaper` 请求并发送

也就是说，真正用到的参数不是保存在仓库里的，而是每次运行时重新从当前会话计算得到。

### 两种使用方式

这个仓库明确支持两条路径：

#### 1. 给 agent 的动态路径

适合：

- agent 自己去读 `SKILL.md`
- agent 自己抓包、读前端源码、推断参数来源
- agent 在本机直接复用 Edge 登录态自动取值

这一条路径的重点是：

- 不写死抓包值
- 动态请求 `GetLanderInfo` / `LoginWeb`
- 从当前会话拿到最新的 `toUserId` / `guidList`

#### 2. 给人类的手动环境变量路径

适合：

- 不想让脚本自己去读本机 Edge cookie
- 想自己从 DevTools 里复制变量
- 想把需要的变量放到 `env.local.sh` 或 CI 环境变量里
- 想在非 macOS 环境下运行脚本

这一条路径的重点是：

- 人自己拿到 `logininfo`
- 人自己拿到 `toUserId` / `toUserName` / `guidList`
- 通过环境变量传给脚本

### 适用场景

适合以下任务：

- “帮我抓包咕咕机网页接口”
- “帮我总结 Memobird Web 的打印请求”
- “复用 Edge 登录态直接打印纸条”
- “解释 `PrintPaper` 的参数从哪里来”
- “做一个不泄露个人信息的 Memobird 自动打印 repo / skill”

### 环境要求

#### 自动模式

- macOS
- Microsoft Edge
- 已在 Edge 中登录 `https://w.memobird.cn/cn/w/mailList.html`
- 本机可用：
  - `node`
  - `sqlite3`
  - `security`

#### 环境变量模式

- 任意支持 `node` 的环境
- 如果只是 `--dry-run` 预览，可以只提供完整的打印字段
- 如果要真实发送打印请求，需要有效的 `MEMOBIRD_LOGININFO`
- 如果要完全手动控制请求字段，还需要：
  - `MEMOBIRD_TO_USER_ID`
  - `MEMOBIRD_TO_USER_NAME`
  - `MEMOBIRD_PRINTER_GUID`
  - `MEMOBIRD_FROM_USER_NAME`

也就是说：

- 自动读取 Edge 登录态这件事目前只支持 macOS
- 但如果你自己准备好环境变量，脚本不强依赖 macOS
- 完整环境变量 + `--dry-run` 可以在不带登录态的情况下做本地预览

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

#### 3. 作为人类手动 env 工具使用

复制模板：

```bash
cp env.example.sh env.local.sh
```

填写自己的变量后加载：

```bash
source env.local.sh
```

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

### 给人类读的手动环境变量方式

这一节是给“自己操作、自己填变量”的用户看的，不是给 agent 的逆向说明。

#### 需要哪些变量

最常见的是这几个：

- `MEMOBIRD_LOGININFO`
  用于带上登录态
- `MEMOBIRD_FROM_USER_NAME`
  打印请求里的 `fromUserName`
- `MEMOBIRD_TO_USER_ID`
  打印请求里的 `toUserId`
- `MEMOBIRD_TO_USER_NAME`
  打印请求里的 `toUserName`
- `MEMOBIRD_PRINTER_GUID`
  打印请求里的 `guidList`
- `MEMOBIRD_PRINTER_NAME`
  可选，只用于本地输出显示

#### 怎么获取 `MEMOBIRD_LOGININFO`

在 Edge 里：

1. 打开 `https://w.memobird.cn/cn/w/mailList.html`
2. 打开 DevTools
3. 进入 `Application`
4. 找到 `Cookies`
5. 选择 `https://w.memobird.cn`
6. 找到 `logininfo`
7. 复制它的值

这个值不要提交到仓库，也不要发到公开 issue 里。

#### 怎么获取 `MEMOBIRD_TO_USER_ID` / `MEMOBIRD_TO_USER_NAME` / `MEMOBIRD_PRINTER_GUID`

有两种方式：

##### 方式 A：直接从浏览器抓包里拿

1. 在 Memobird 网页里发一条测试纸条
2. 在 `Network` 面板里找到 `PrintPaper`
3. 看请求表单里的：
   - `toUserId`
   - `toUserName`
   - `guidList`

##### 方式 B：先让脚本列出来

如果你在 macOS 上，并且脚本能读取当前 Edge 登录态，可以执行：

```bash
node scripts/memobird-print.mjs --list --show-ids
```

这样可以拿到当前 note 和 printer 的真实包装值。注意：这个输出只应该留在本地终端里，不要复制进公开文档。

#### 怎么填环境变量

先复制模板：

```bash
cp env.example.sh env.local.sh
```

然后编辑成自己的值，例如：

```bash
export MEMOBIRD_LOGININFO='your-logininfo-cookie'
export MEMOBIRD_FROM_USER_NAME='Your Name'
export MEMOBIRD_TO_USER_ID='your-wrapped-toUserId'
export MEMOBIRD_TO_USER_NAME='我'
export MEMOBIRD_PRINTER_GUID='your-wrapped-guidList'
export MEMOBIRD_PRINTER_NAME='My Memobird'
```

加载变量：

```bash
source env.local.sh
```

#### 手动 env 方式的推荐执行顺序

```bash
source env.local.sh
node scripts/memobird-print.mjs --dry-run --text $'测试标题\n第二行'
node scripts/memobird-print.mjs --text $'正式打印内容'
```

如果你只是想检查拼出来的请求体，不想真的发出去，那么 `env.local.sh` 里可以先不放 `MEMOBIRD_LOGININFO`，只跑 `--dry-run`。

#### 环境变量和自动模式的优先级

脚本的优先级是：

1. 如果设置了 `MEMOBIRD_LOGININFO`，优先使用它，不再从本机 Edge 读取 cookie
2. 如果设置了 `MEMOBIRD_TO_USER_ID`，优先直接用它，不再依赖当前 note 选择
3. 如果设置了 `MEMOBIRD_PRINTER_GUID`，优先直接用它，不再依赖当前设备选择

所以这套 env 方式适合：

- 手动控制具体请求参数
- 在非 macOS 环境运行
- 把参数交给 CI 或别的自动化系统

### 脚本使用

#### 查看当前 note 目标和打印机

```bash
node scripts/memobird-print.mjs --list
```

默认会把包装后的 ID 打码。

#### 用环境变量列出当前会话信息

```bash
MEMOBIRD_LOGININFO='your-logininfo-cookie' \
node scripts/memobird-print.mjs --list
```

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

#### 纯环境变量方式直接打印

```bash
source env.local.sh
node scripts/memobird-print.mjs --text $'通过环境变量直接打印'
```

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

### 环境变量

- `MEMOBIRD_LOGININFO`
  直接提供登录 cookie，跳过本机 Edge 读取
- `MEMOBIRD_FROM_USER_NAME`
  覆盖 `fromUserName`
- `MEMOBIRD_TO_USER_ID`
  覆盖 `toUserId`
- `MEMOBIRD_TO_USER_NAME`
  覆盖 `toUserName`
- `MEMOBIRD_PRINTER_GUID`
  覆盖 `guidList`
- `MEMOBIRD_GUID_LIST`
  `MEMOBIRD_PRINTER_GUID` 的别名
- `MEMOBIRD_PRINTER_NAME`
  可选，仅用于本地输出显示

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

- 自动读取 Edge 登录态目前仅支持 macOS
- 自动读取浏览器 cookie 的路径目前仅针对 Microsoft Edge
- 如果使用手动环境变量方式，可以不依赖 macOS，但仍然需要有效的 `MEMOBIRD_LOGININFO`
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
2. Provide a working helper script that supports both live Edge session reuse and human-managed environment variables for sending `PrintPaper`.

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
  Executable helper script for listing targets, previewing requests, printing text notes, and overriding request fields through environment variables.
- `env.example.sh`
  A shell template for humans who want to manage the required variables manually.

### How It Works

The script follows this runtime flow:

1. Read `logininfo` from the local Edge cookie database
2. Decrypt it using `Microsoft Edge Safe Storage` from the macOS keychain
3. Call `GetLanderInfo`
4. Call `LoginWeb`
5. Resolve the current note target and printer target from those live responses
6. Send `PrintPaper`

In other words, the repository does not store live wrapped IDs. It recomputes them at runtime from the local logged-in session.

### Two Usage Paths

This repository intentionally supports two different paths:

#### 1. Agent-oriented dynamic path

Use this path when an agent can:

- read `SKILL.md`
- inspect frontend source
- use browser capture as evidence
- reuse the local Edge session and resolve fresh runtime values automatically

This is the preferred path for reverse engineering and local automation.

#### 2. Human-oriented environment variable path

Use this path when a human wants to:

- copy values manually from DevTools
- prepare a local `env.local.sh`
- pass wrapped IDs explicitly
- run the script outside the original macOS + Edge environment

This is the preferred path for README-driven usage and manual control.

### Use Cases

Use this repository when the task is something like:

- “reverse engineer Memobird Web printing”
- “capture the Memobird request flow”
- “print a note by reusing Edge login state”
- “explain where the `PrintPaper` fields come from”
- “publish a sanitized Memobird automation skill or repository”

### Requirements

#### Automatic session mode

- macOS
- Microsoft Edge
- Logged into `https://w.memobird.cn/cn/w/mailList.html` in Edge
- The following tools available locally:
  - `node`
  - `sqlite3`
  - `security`

#### Environment variable mode

- any environment with `node`
- for `--dry-run` previews only, a complete manual print context is enough
- for real printing, a valid `MEMOBIRD_LOGININFO` is required
- and, for full manual control:
  - `MEMOBIRD_FROM_USER_NAME`
  - `MEMOBIRD_TO_USER_ID`
  - `MEMOBIRD_TO_USER_NAME`
  - `MEMOBIRD_PRINTER_GUID`

So the actual limitation is:

- automatic Edge cookie reuse is macOS-specific
- manual environment-variable mode is not macOS-specific as long as valid values are provided
- a complete manual env setup can be used for local dry-run previews even without a live login cookie

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

#### 3. Use it as a manual env-driven tool

Copy the template:

```bash
cp env.example.sh env.local.sh
```

Then load your variables:

```bash
source env.local.sh
```

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

### Human-Oriented Environment Variable Workflow

This section is written for humans who want to collect variables themselves and inject them manually.

#### Required variables

The common set is:

- `MEMOBIRD_LOGININFO`
- `MEMOBIRD_FROM_USER_NAME`
- `MEMOBIRD_TO_USER_ID`
- `MEMOBIRD_TO_USER_NAME`
- `MEMOBIRD_PRINTER_GUID`
- `MEMOBIRD_PRINTER_NAME` optional, for display only

#### How to get `MEMOBIRD_LOGININFO`

In Edge:

1. Open `https://w.memobird.cn/cn/w/mailList.html`
2. Open DevTools
3. Go to `Application`
4. Open `Cookies`
5. Select `https://w.memobird.cn`
6. Find `logininfo`
7. Copy its value

Do not commit or publish this cookie.

#### How to get `MEMOBIRD_TO_USER_ID`, `MEMOBIRD_TO_USER_NAME`, and `MEMOBIRD_PRINTER_GUID`

Two common options:

##### Option A: copy them from a captured request

1. Send a test note in Memobird Web
2. Find the `PrintPaper` request in DevTools Network
3. Copy:
   - `toUserId`
   - `toUserName`
   - `guidList`

##### Option B: let the script print them locally

On macOS, if the script can already read the current Edge session:

```bash
node scripts/memobird-print.mjs --list --show-ids
```

That output should stay local. Do not paste it into public documentation.

#### How to set the variables

Copy the template:

```bash
cp env.example.sh env.local.sh
```

Then fill it with your own values, for example:

```bash
export MEMOBIRD_LOGININFO='your-logininfo-cookie'
export MEMOBIRD_FROM_USER_NAME='Your Name'
export MEMOBIRD_TO_USER_ID='your-wrapped-toUserId'
export MEMOBIRD_TO_USER_NAME='Self'
export MEMOBIRD_PRINTER_GUID='your-wrapped-guidList'
export MEMOBIRD_PRINTER_NAME='My Memobird'
```

Load it:

```bash
source env.local.sh
```

#### Recommended execution order for manual env mode

```bash
source env.local.sh
node scripts/memobird-print.mjs --dry-run --text $'Title\nSecond line'
node scripts/memobird-print.mjs --text $'Final printed content'
```

If the goal is only to inspect the generated request body locally, `MEMOBIRD_LOGININFO` can be omitted for `--dry-run`.

#### Precedence rules

The script resolves values in this order:

1. `MEMOBIRD_LOGININFO` overrides local Edge cookie lookup
2. `MEMOBIRD_TO_USER_ID` overrides note selection
3. `MEMOBIRD_PRINTER_GUID` overrides printer selection

That makes env mode a good fit for CI, remote shells, or explicit manual control.

### Script Usage

#### List available note targets and printers

```bash
node scripts/memobird-print.mjs --list
```

Wrapped IDs are redacted by default.

#### List current session information through environment variables

```bash
MEMOBIRD_LOGININFO='your-logininfo-cookie' \
node scripts/memobird-print.mjs --list
```

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

#### Print directly through environment variables

```bash
source env.local.sh
node scripts/memobird-print.mjs --text $'Printed through env variables'
```

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

### Environment Variables

- `MEMOBIRD_LOGININFO`
  provide the login cookie directly and skip local Edge cookie lookup
- `MEMOBIRD_FROM_USER_NAME`
  override `fromUserName`
- `MEMOBIRD_TO_USER_ID`
  override `toUserId`
- `MEMOBIRD_TO_USER_NAME`
  override `toUserName`
- `MEMOBIRD_PRINTER_GUID`
  override `guidList`
- `MEMOBIRD_GUID_LIST`
  alias for `MEMOBIRD_PRINTER_GUID`
- `MEMOBIRD_PRINTER_NAME`
  optional display label for the overridden printer

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

- automatic Edge session reuse is currently macOS-only
- automatic browser cookie lookup is currently implemented for Microsoft Edge
- manual env mode does not require macOS, but still requires a valid `MEMOBIRD_LOGININFO`
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
