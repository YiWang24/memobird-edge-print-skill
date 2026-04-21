# Memobird Edge Print Skill

面向人类使用者的文档，适用于 macOS、Linux 和 Windows。

## 项目概览

这个仓库支持两条不同的使用路径：

1. 人类路径：
   自己获取 Memobird 所需变量，写入 env 文件，然后跨平台运行脚本。
2. Agent 路径：
   让 agent 自己分析 Memobird Web 请求流程，动态取值，并在环境支持时自动生成本地 env 片段。

如果目标是跨平台和可控性，优先使用人类的 env 路径。

## 平台支持

| 模式 | macOS | Linux | Windows |
| --- | --- | --- | --- |
| 手动 env + `--dry-run` | 支持 | 支持 | 支持 |
| 手动 env + 真实打印 | 支持 | 支持 | 支持 |
| 自动复用本机 Edge 登录态 | 支持 | 暂不支持 | 暂不支持 |

说明：

- 只要你已经拿到了所需 env 变量，脚本就可以跨平台工作。
- 自动读取浏览器登录态目前仅针对 macOS + Microsoft Edge。

## 快速开始

### 1. 复制 env 模板

macOS / Linux：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

Windows CMD：

```bat
copy .env.example .env.local
```

### 2. 填入自己的变量

编辑 `.env.local`，把占位值替换成你自己的真实值。

### 3. 先做预览，不实际打印

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "Hello from Memobird"
```

### 4. 再正式打印

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --text "正式打印内容"
```

## 需要哪些变量

跨平台 env 路径主要使用这些变量：

- `MEMOBIRD_LOGININFO`
  登录 cookie
- `MEMOBIRD_FROM_USER_NAME`
  `PrintPaper` 里的 `fromUserName`
- `MEMOBIRD_TO_USER_ID`
  包装后的 `toUserId`
- `MEMOBIRD_TO_USER_NAME`
  目标显示名
- `MEMOBIRD_PRINTER_GUID`
  包装后的 `guidList`
- `MEMOBIRD_PRINTER_NAME`
  可选，仅用于本地显示

真实打印时，最常见的最小集合是：

- `MEMOBIRD_LOGININFO`
- `MEMOBIRD_FROM_USER_NAME`
- `MEMOBIRD_TO_USER_ID`
- `MEMOBIRD_TO_USER_NAME`
- `MEMOBIRD_PRINTER_GUID`

## 人类如何手动获取这些变量

### 获取 `MEMOBIRD_LOGININFO`

在 Microsoft Edge 中：

1. 打开 `https://w.memobird.cn/cn/w/mailList.html`
2. 打开 DevTools
3. 进入 `Application`
4. 找到 `Cookies`
5. 选择 `https://w.memobird.cn`
6. 找到 `logininfo`
7. 复制它的值

这个值必须保密，不要提交到仓库。

### 获取 `MEMOBIRD_TO_USER_ID`、`MEMOBIRD_TO_USER_NAME`、`MEMOBIRD_PRINTER_GUID`

常见有两种方式：

#### 方式 A：从 `PrintPaper` 请求里直接复制

1. 在 Memobird 网页发一条测试纸条
2. 打开 DevTools 的 `Network`
3. 找到 `PrintPaper`
4. 复制：
   - `toUserId`
   - `toUserName`
   - `guidList`

#### 方式 B：让脚本在本地自动解析后导出

如果当前环境支持自动模式：

```bash
node scripts/memobird-print.mjs --list --show-ids
node scripts/memobird-print.mjs --list --show-ids --emit-env
```

第二条命令会输出一个 `.env` 风格的变量块，可以直接复制到 `.env.local`。

## `.env` 文件方式

为了适配不同系统和不同 shell，本仓库统一使用普通 `.env` 文件格式。

如果你要跨 shell 传多行文本，优先使用 `--file note.txt`，不要依赖 shell 自己的换行语法。

### `.env.local` 示例

```dotenv
MEMOBIRD_LOGININFO="your-logininfo-cookie"
MEMOBIRD_FROM_USER_NAME="Your Name"
MEMOBIRD_TO_USER_ID="your-wrapped-toUserId"
MEMOBIRD_TO_USER_NAME="我"
MEMOBIRD_PRINTER_GUID="your-wrapped-guidList"
MEMOBIRD_PRINTER_NAME="My Memobird"
```

### 使用方式

```bash
node scripts/memobird-print.mjs --env-file .env.local --dry-run --text "hello"
node scripts/memobird-print.mjs --env-file .env.local --text "real print"
```

## 脚本能力

主脚本是 [`scripts/memobird-print.mjs`](./scripts/memobird-print.mjs)。

### 常用命令

查看当前 note 目标和打印机：

```bash
node scripts/memobird-print.mjs --list
```

显示真实包装 ID：

```bash
node scripts/memobird-print.mjs --list --show-ids
```

导出可直接粘贴的 env 变量块：

```bash
node scripts/memobird-print.mjs --list --show-ids --emit-env
```

通过 env 文件做预览：

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "hello"
```

通过 env 文件真实打印：

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --text "hello"
```

从文件读取纸条内容：

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --file ./note.txt
```

### 重要参数

- `--env-file`
  执行前加载 `.env` 风格文件
- `--dry-run`
  只预览请求，不实际发送
- `--list`
  动态解析并列出当前可用 note 目标和打印机
- `--emit-env`
  输出一个可直接写入 `.env.local` 的变量块
- `--show-ids`
  显示真实包装 ID，不再打码
- `--width`
  自动换行宽度，默认 `32`
- `--no-wrap`
  关闭自动换行

## 自动模式

如果环境支持，脚本可以自动复用本机 Edge 登录态。

当前支持的自动模式：

- macOS
- Microsoft Edge
- 本机已登录 Memobird Web

这个模式适合：

- 逆向分析
- 获取当前有效包装 ID
- 用 `--emit-env` 生成本地 `.env.local`

## 隐私与安全

- 仓库本身不包含真实 cookie 或真实包装 ID
- 脚本默认会打码包装 ID
- `--emit-env` 必须和 `--show-ids` 一起使用，因为它会输出真实值
- `.env.local` 只应该保存在本地，不要提交
- README 主路径面向人类，agent 的抓包相关说明折叠在文末

## 排错建议

### `Could not resolve logininfo`

可能原因：

- 没有提供 `MEMOBIRD_LOGININFO`
- 当前环境不支持自动读取本机 Edge 会话
- Edge 没有登录 Memobird Web

### `--dry-run` 正常，但真实打印失败

优先检查：

- `MEMOBIRD_LOGININFO` 是否仍然有效
- `MEMOBIRD_TO_USER_ID` 和 `MEMOBIRD_PRINTER_GUID` 是否仍然对应当前账号状态
- 打印机是否在线

### 想重新生成 env 文件

如果自动模式可用：

```bash
node scripts/memobird-print.mjs --list --show-ids --emit-env > .env.local
```

然后把 `.env.local` 留在本地私有环境中。

<details>
<summary>Agent / 抓包与逆向说明</summary>

这一节默认折叠，因为主 README 路径是给人类使用者看的。

Agent 入口：

- [`SKILL.md`](./SKILL.md)
- [`references/reverse-engineering.md`](./references/reverse-engineering.md)

推荐 agent 流程：

1. 先读前端源码
2. 再用浏览器抓包确认行为
3. 动态解析 fresh wrapped IDs，而不是把抓包值写死
4. 环境支持时，用 `--emit-env` 生成本地 env 配置

</details>
