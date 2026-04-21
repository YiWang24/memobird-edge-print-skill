# Memobird Edge Print Skill

Public Codex skill and helper script for reverse engineering Memobird Web printing and sending paper notes by reusing the local Microsoft Edge login session on macOS.

## What This Repo Contains

- `SKILL.md` for agent-facing workflow and trigger rules
- `references/reverse-engineering.md` for the packet capture and protocol summary
- `scripts/memobird-print.mjs` for listing targets, dry-running requests, and printing text

## Design Goals

- Do not hardcode a stale packet capture
- Do not commit live cookies or wrapped IDs
- Recompute fresh Memobird request values from the current Edge session
- Keep public docs and examples sanitized

## Requirements

- macOS
- Microsoft Edge
- Logged into `https://w.memobird.cn/cn/w/mailList.html`
- `node`, `sqlite3`, and `security`

## Skill Installation

Clone the repository into a local skills directory or symlink it into the agent’s skill path. The repo itself is the skill root because `SKILL.md` is at the top level.

Example:

```bash
git clone https://github.com/OWNER/memobird-edge-print-skill.git
```

## Script Usage

List the current note targets and printers:

```bash
node scripts/memobird-print.mjs --list
```

Preview a print request without printing:

```bash
node scripts/memobird-print.mjs \
  --dry-run \
  --device "My Memobird" \
  --text $'Title\nSecond line'
```

Print a note:

```bash
node scripts/memobird-print.mjs \
  --device "My Memobird" \
  --text $'Hello from Edge session reuse'
```

Show raw wrapped IDs only when required for debugging:

```bash
node scripts/memobird-print.mjs --list --show-ids
```

## Safety

- Default output redacts wrapped IDs.
- The script does not write cookies to disk.
- README examples use generic names only.
- Publish only after scanning the repo for personal names, emails, device names, and captured tokens.

## Limitations

- Current implementation supports macOS only.
- Current implementation expects the user to already be logged into Memobird Web in Microsoft Edge.

