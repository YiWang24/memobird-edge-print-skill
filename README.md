# Memobird Edge Print Skill

Reverse-engineer Memobird Web printing and send real prints from local automation.

This repository packages one reusable skill, one working CLI, and the notes needed to reproduce the Memobird web flow without hardcoding stale packet captures.

It supports:

- text-note printing through Memobird Web `PrintPaper`
- single-image printing through `https://pdf.memobird.cn/print/imageFromFile`
- cross-platform `.env`-based usage on macOS, Linux, and Windows
- automatic Microsoft Edge session reuse on macOS when the environment supports it

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## Installation

### CLI usage

Run without installing:

```bash
npx memobird-edge-print-skill --help
```

Install globally:

```bash
npm install -g memobird-edge-print-skill
```

After a global install, both commands work:

```bash
memobird-edge-print-skill --help
memobird-print --help
```

### Install as a Codex skill with `npx`

```bash
npx -p memobird-edge-print-skill memobird-edge-print-install --target codex
```

Force-reinstall:

```bash
npx -p memobird-edge-print-skill memobird-edge-print-install --target codex --force
```

### Install as a Claude Code command bundle with `npx`

```bash
npx -p memobird-edge-print-skill memobird-edge-print-install --target claude
```

Force-reinstall:

```bash
npx -p memobird-edge-print-skill memobird-edge-print-install --target claude --force
```

### Install into a custom skill directory with `npx`

```bash
npx -p memobird-edge-print-skill memobird-edge-print-install \
  --dest "$HOME/.my-agent/skills/memobird-edge-print-skill"
```

### One-line `git clone` install for Codex

```bash
git clone https://github.com/YiWang24/memobird-edge-print-skill.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/memobird-edge-print-skill"
```

### One-line `git clone` install for Claude Code

```bash
git clone https://github.com/YiWang24/memobird-edge-print-skill.git \
  "$HOME/.claude/commands/memobird-edge-print-skill"
```

### One-line sparse checkout install

If you want only this skill directory and not the whole git history:

```bash
git clone --depth=1 --filter=blob:none --sparse \
  https://github.com/YiWang24/memobird-edge-print-skill.git \
  /tmp/memobird-edge-print-skill && \
  git -C /tmp/memobird-edge-print-skill sparse-checkout set . && \
  mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills" && \
  cp -R /tmp/memobird-edge-print-skill \
    "${CODEX_HOME:-$HOME/.codex}/skills/memobird-edge-print-skill"
```

## Quick Start

### 1. Copy the env template

macOS / Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Windows CMD:

```bat
copy .env.example .env.local
```

### 2. Fill in your own values

Edit `.env.local` and replace the placeholders.

### 3. Preview a text print

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "Hello from Memobird"
```

### 4. Send a real text print

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --text "Final content"
```

### 5. Preview an image print

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --image ./photo.png \
  --dry-run
```

### 6. Send a real image print

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --image ./photo.png
```

## What This Repo Contains

- [`SKILL.md`](./SKILL.md)
  agent-facing instructions for reverse engineering, safe env generation, and print execution
- [`scripts/memobird-print.mjs`](./scripts/memobird-print.mjs)
  the main helper CLI for text printing, image printing, env export, and dry runs
- [`references/reverse-engineering.md`](./references/reverse-engineering.md)
  source-first reverse engineering notes for `PrintPaper` and the image-print endpoints
- [`.env.example`](./.env.example)
  a cross-platform env template for manual setup
- [`README.zh-CN.md`](./README.zh-CN.md)
  Chinese-language operator documentation

## Capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Text printing | Ready | Uses `PrintPaper` on `DBInterface.ashx` |
| Single-image printing | Ready | Uses `https://pdf.memobird.cn/print/imageFromFile` |
| Cross-platform manual env workflow | Ready | Works on macOS, Linux, and Windows |
| Automatic Edge session reuse | Ready on macOS | Implemented for Microsoft Edge on macOS |
| Document-to-image multi-page printing | Not implemented in CLI | The web app also uses `https://pdf.memobird.cn/print/images`; not wrapped yet |

## Platform Support

| Mode | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Manual env + `--dry-run` | Yes | Yes | Yes |
| Manual env + real text print | Yes | Yes | Yes |
| Manual env + real image print | Yes | Yes | Yes |
| Automatic local Edge session reuse | Yes | No | No |

## Required Variables

The `.env` workflow uses these variables:

- `MEMOBIRD_LOGININFO`
  login cookie value
- `MEMOBIRD_FROM_USER_NAME`
  `fromUserName` for `PrintPaper`
- `MEMOBIRD_TO_USER_ID`
  wrapped `toUserId`
- `MEMOBIRD_TO_USER_NAME`
  human-readable target name
- `MEMOBIRD_PRINTER_GUID`
  wrapped `guidList`
- `MEMOBIRD_PRINTER_TYPE`
  numeric `smartType`, required for image printing when the printer is not resolved live
- `MEMOBIRD_PRINTER_NAME`
  optional local display name

The smallest practical setup for real text printing is:

- `MEMOBIRD_LOGININFO`
- `MEMOBIRD_FROM_USER_NAME`
- `MEMOBIRD_TO_USER_ID`
- `MEMOBIRD_TO_USER_NAME`
- `MEMOBIRD_PRINTER_GUID`

The smallest practical setup for image printing without live session reuse is:

- `MEMOBIRD_PRINTER_GUID`
- `MEMOBIRD_PRINTER_TYPE`

Example `.env.local`:

```dotenv
MEMOBIRD_LOGININFO="your-logininfo-cookie"
MEMOBIRD_FROM_USER_NAME="Your Name"
MEMOBIRD_TO_USER_ID="your-wrapped-toUserId"
MEMOBIRD_TO_USER_NAME="Self"
MEMOBIRD_PRINTER_GUID="your-wrapped-guidList"
MEMOBIRD_PRINTER_TYPE="206"
MEMOBIRD_PRINTER_NAME="My Memobird"
```

## How To Get The Variables Manually

### `MEMOBIRD_LOGININFO`

In Microsoft Edge:

1. Open `https://w.memobird.cn/cn/w/mailList.html`
2. Open DevTools
3. Go to `Application`
4. Open `Cookies`
5. Select `https://w.memobird.cn`
6. Find `logininfo`
7. Copy the cookie value

Keep this value private.

### `MEMOBIRD_TO_USER_ID`, `MEMOBIRD_TO_USER_NAME`, `MEMOBIRD_PRINTER_GUID`, `MEMOBIRD_PRINTER_TYPE`

Two common options:

#### Option A: Copy from live requests

For text printing:

1. Send a test note from the Memobird web page
2. Open DevTools `Network`
3. Find the `PrintPaper` request
4. Copy `toUserId`, `toUserName`, and `guidList`

For image printing:

1. Upload a test image on the Memobird web page
2. Trigger image printing
3. Inspect the request to `https://pdf.memobird.cn/print/imageFromFile`
4. Copy `smartGuid` and the numeric printer `type`

#### Option B: Let the script resolve them locally

When automatic session reuse is available:

```bash
node scripts/memobird-print.mjs --list --show-ids
node scripts/memobird-print.mjs --show-ids --emit-env
```

The second command prints a ready-to-paste env block. To refresh `.env.local` safely:

```bash
node scripts/memobird-print.mjs --show-ids --emit-env > .env.local.new
mv .env.local.new .env.local
```

## Common Commands

List current note targets and printers:

```bash
node scripts/memobird-print.mjs --list
```

List with real wrapped IDs:

```bash
node scripts/memobird-print.mjs --list --show-ids
```

Emit a ready-to-paste env block:

```bash
node scripts/memobird-print.mjs --show-ids --emit-env
```

Preview text printing:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "hello"
```

Print text from a file:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --file ./note.txt
```

Preview image printing:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --image ./photo.png \
  --dry-run
```

Print an image:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --image ./photo.png \
  --paper-type roll \
  --image-print-type text
```

## CLI Options

- `--env-file`
  load a `.env`-style file before execution
- `--dry-run`
  preview the resolved request without sending it
- `--list`
  resolve and display current note targets and printers
- `--emit-env`
  print a `.env`-style block using live resolved values
- `--show-ids`
  reveal raw wrapped identifiers instead of redacting them
- `--text`
  send a text note
- `--file`
  read text note content from a file
- `--image`
  send a local image file through the image-print service
- `--printer-type`
  supply the numeric printer `smartType` when image mode is used without live device resolution
- `--paper-type`
  select `roll` or `folded` for image mode
- `--image-print-type`
  select `text` or `rich` for image mode
- `--width`
  wrapping width for text layout, default `32`
- `--no-wrap`
  disable automatic text wrapping

## How It Works

### Text printing

Text-note printing follows the Memobird Web flow:

1. Resolve `logininfo`
2. Call `GetLanderInfo`
3. Call `LoginWeb`
4. Resolve the current note target and printer
5. Send `PrintPaper`

### Image printing

Image printing does not use `PrintPaper`.

The web app uploads a multipart form directly to:

- `https://pdf.memobird.cn/print/imageFromFile`

The relevant fields are:

- `file`
- `smartGuid`
- `type`
- `printType`
- `paperType`
- `serverType`

This is why image mode needs the printer `smartType` in addition to `smartGuid`.

For deeper protocol notes, see [`references/reverse-engineering.md`](./references/reverse-engineering.md).

## Automatic Session Reuse

When the environment supports it, the CLI can reuse the local Microsoft Edge session automatically.

Current supported automatic mode:

- macOS
- Microsoft Edge
- logged into Memobird Web locally

This mode is useful for:

- reverse engineering
- discovering current wrapped IDs
- generating a fresh local env block with `--emit-env`

## Privacy and Security

- The repository does not ship with live cookies or live wrapped IDs.
- The CLI redacts wrapped IDs by default.
- `--emit-env` requires `--show-ids` because it outputs real values.
- `.env.local` should stay local and should not be committed.
- Image printing uploads the selected local image file to `pdf.memobird.cn`.
- Public docs in this repo use generic examples instead of real device names or live identifiers.

## Troubleshooting

### `Could not resolve logininfo`

Possible causes:

- no `MEMOBIRD_LOGININFO` was provided
- automatic local Edge session reuse is not available in the current environment
- Edge is not logged into Memobird Web

### Printing fails but `--dry-run` works

Check:

- whether `MEMOBIRD_LOGININFO` is still valid
- whether the wrapped IDs still match the current account state
- whether the selected printer is online
- whether `MEMOBIRD_PRINTER_TYPE` matches the real printer for image mode

### Need a fresh env file

If automatic mode is available:

```bash
node scripts/memobird-print.mjs --show-ids --emit-env > .env.local.new
mv .env.local.new .env.local
```

Then keep `.env.local` private.

<details>
<summary>Agent / Reverse Engineering Notes</summary>

This README is optimized for human operators. Agent-oriented entry points are:

- [`SKILL.md`](./SKILL.md)
- [`references/reverse-engineering.md`](./references/reverse-engineering.md)

Recommended agent flow:

1. inspect frontend source first
2. confirm behavior with DevTools network capture
3. distinguish text printing from image printing before implementing anything
4. resolve fresh values dynamically instead of hardcoding a packet capture
5. generate a local env block only when needed

</details>
