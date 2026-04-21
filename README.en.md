# Memobird Edge Print Skill

Human-facing documentation for using this repository on macOS, Linux, and Windows.

## Overview

This project supports two different workflows:

1. Human workflow:
   manually collect the required Memobird values, place them into an env file, and run the script in a cross-platform way.
2. Agent workflow:
   let an agent inspect the Memobird Web flow, resolve fresh values dynamically, and optionally generate a local env block for later reuse.

If the goal is portability, the human env-based workflow is the primary one.

## Platform Support

| Mode | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Manual env + `--dry-run` | Yes | Yes | Yes |
| Manual env + real print | Yes | Yes | Yes |
| Automatic local Edge session reuse | Yes | No | No |

Notes:

- Cross-platform use works when you already have the required env values.
- Automatic browser-session reuse is currently implemented for Microsoft Edge on macOS only.

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

### 3. Preview without printing

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "Hello from Memobird"
```

### 4. Print for real

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --text "Final content"
```

## Required Variables

The cross-platform env workflow uses these variables:

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
- `MEMOBIRD_PRINTER_NAME`
  optional local display name

The smallest practical setup for real printing is:

- `MEMOBIRD_LOGININFO`
- `MEMOBIRD_FROM_USER_NAME`
- `MEMOBIRD_TO_USER_ID`
- `MEMOBIRD_TO_USER_NAME`
- `MEMOBIRD_PRINTER_GUID`

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

### `MEMOBIRD_TO_USER_ID`, `MEMOBIRD_TO_USER_NAME`, `MEMOBIRD_PRINTER_GUID`

Two common options:

#### Option A: Copy from a `PrintPaper` request

1. Send a test note from the Memobird web page
2. Open DevTools `Network`
3. Find the `PrintPaper` request
4. Copy:
   - `toUserId`
   - `toUserName`
   - `guidList`

#### Option B: Let the script resolve and export them locally

When the environment supports automatic session reuse:

```bash
node scripts/memobird-print.mjs --list --show-ids
node scripts/memobird-print.mjs --list --show-ids --emit-env
```

The second command emits a `.env`-style block that can be pasted into `.env.local`.

## `.env` File Workflow

This repository uses a plain `.env`-style file so the same setup pattern works across shells and platforms.

For multi-line note content across shells, prefer `--file note.txt` instead of shell-specific newline syntax.

### Example `.env.local`

```dotenv
MEMOBIRD_LOGININFO="your-logininfo-cookie"
MEMOBIRD_FROM_USER_NAME="Your Name"
MEMOBIRD_TO_USER_ID="your-wrapped-toUserId"
MEMOBIRD_TO_USER_NAME="Self"
MEMOBIRD_PRINTER_GUID="your-wrapped-guidList"
MEMOBIRD_PRINTER_NAME="My Memobird"
```

### Use it

```bash
node scripts/memobird-print.mjs --env-file .env.local --dry-run --text "hello"
node scripts/memobird-print.mjs --env-file .env.local --text "real print"
```

## Script Features

The main helper is [`scripts/memobird-print.mjs`](./scripts/memobird-print.mjs).

### Common commands

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
node scripts/memobird-print.mjs --list --show-ids --emit-env
```

Preview through env file:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --dry-run \
  --text "hello"
```

Print through env file:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --text "hello"
```

Read text from a file:

```bash
node scripts/memobird-print.mjs \
  --env-file .env.local \
  --file ./note.txt
```

### Important options

- `--env-file`
  load a `.env`-style file before execution
- `--dry-run`
  build and preview the request without sending it
- `--list`
  resolve and display available note targets and printers
- `--emit-env`
  print a `.env`-style block using real resolved values
- `--show-ids`
  reveal raw wrapped IDs instead of redacting them
- `--width`
  wrapping width for text layout, default `32`
- `--no-wrap`
  disable automatic wrapping

## Automatic Session Mode

If the environment supports it, the script can reuse the local Edge login session automatically.

Current supported automatic mode:

- macOS
- Microsoft Edge
- logged into Memobird Web locally

That mode is useful for:

- reverse engineering
- discovering current wrapped IDs
- generating `.env.local` content locally with `--emit-env`

## Privacy and Security

- The repository does not ship with live cookies or live wrapped IDs.
- The script redacts wrapped IDs by default.
- `--emit-env` requires `--show-ids` because it outputs real values.
- `.env.local` should stay local and should not be committed.
- The main README flow is human-oriented; agent/reverse-engineering notes are collapsed below.

## Troubleshooting

### `Could not resolve logininfo`

Possible causes:

- no `MEMOBIRD_LOGININFO` was provided
- automatic local Edge session reuse is not available in the current environment
- Edge is not logged into Memobird Web

### Printing fails but `--dry-run` works

Check:

- whether `MEMOBIRD_LOGININFO` is still valid
- whether the wrapped `toUserId` and `MEMOBIRD_PRINTER_GUID` still match the current account state
- whether the selected printer is online

### Need a fresh env file

If automatic mode is available:

```bash
node scripts/memobird-print.mjs --list --show-ids --emit-env > .env.local
```

Then keep `.env.local` private.

<details>
<summary>Agent / Reverse Engineering Notes</summary>

This section is intentionally collapsed because the main README path is for humans.

Agent-oriented entry points:

- [`SKILL.md`](./SKILL.md)
- [`references/reverse-engineering.md`](./references/reverse-engineering.md)

Recommended agent flow:

1. read frontend source first
2. confirm behavior with DevTools network capture
3. resolve fresh values dynamically instead of hardcoding a capture
4. generate a local env block when the environment supports it

</details>
