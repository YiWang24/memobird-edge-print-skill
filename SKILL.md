---
name: Memobird Edge Print
description: This skill should be used when the user asks to "抓包咕咕机", "reverse engineer Memobird Web", "send a Memobird print from Edge", "复用 Edge 登录态打印纸条", "排查 PrintPaper 接口", "自动打印咕咕机纸条", or "summarize the Memobird request flow".
version: 0.1.0
---

# Memobird Edge Print

Use this skill to reverse engineer Memobird Web printing safely and to send paper notes by reusing the local Microsoft Edge login session on macOS.

The core rule is simple: do not hardcode a packet capture and do not commit live identifiers. Memobird wraps `userId` and `smartGuid` values in short-lived encoded strings, so a one-off capture is useful for learning the protocol but is not a stable implementation strategy.

## Goals

Accomplish four things:

1. Identify the live request flow behind Memobird Web printing.
2. Explain where each `PrintPaper` field comes from.
3. Recompute fresh values from the current session instead of replaying stale captured data.
4. Keep cookies, wrapped identifiers, personal names, and device names out of published artifacts unless the user explicitly asks for them.

## When To Use

Use this skill when the task involves any of the following:

- Reverse engineering Memobird Web or `DBInterface.ashx`
- Tracing `PrintPaper`, `LoginWeb`, `GetLanderInfo`, `GetFriends`, or `GetSmartCoreByUserID`
- Printing a paper note by reusing the local Edge session
- Summarizing how to capture or reproduce the Memobird request flow
- Building or reviewing a script that prints through Memobird
- Creating sanitized public docs or repositories about Memobird printing automation

## Required Setup

Before running the workflow, verify:

- macOS is the current OS
- Microsoft Edge is installed
- The user is already logged into `https://w.memobird.cn/cn/w/mailList.html` in Edge
- `node`, `sqlite3`, and the macOS `security` CLI are available

If those conditions are not met, stop and explain the missing prerequisite.

## Preferred Workflow

Follow this order. Skip a step only when a later step already proves the same fact more directly.

### 1. Start With Source, Not Blind Replay

Open `references/reverse-engineering.md` and use the source-first method:

- Read the page script references from `mailList.html`
- Open `Scripts/Ajax/mailListAjax.js`
- Search for `PrintPaper`
- Map each request field to the DOM or prior API response that produced it

This avoids cargo-culting a stale packet capture.

### 2. Confirm With Network Evidence

Use the local browser only to confirm behavior, not to define the final implementation:

- Open Memobird Web in Edge
- Open DevTools
- Filter Network to `Fetch/XHR`
- Trigger page load, note selection, or a print action
- Inspect `DBInterface.ashx` requests

Treat the browser capture as evidence for the flow, not as a source of permanent constants.

### 3. Resolve Fresh Values Programmatically

Use `scripts/memobird-print.mjs` to recompute the live values at runtime:

- Read the Edge `logininfo` cookie from the local cookie store
- Decrypt it through the macOS Keychain-backed Edge safe storage key
- Call `GetLanderInfo`
- Call `LoginWeb`
- Use the current `userId`, note target, and `smartGuid` from those fresh responses
- Send `PrintPaper`

This is the stable path. Do not persist raw `toUserId` or `guidList` values in the repository.

### 4. Use Dry Runs Before Real Printing

Run the script in this order:

- `node scripts/memobird-print.mjs --list`
- `node scripts/memobird-print.mjs --dry-run --text "test"`
- `node scripts/memobird-print.mjs --text "real content"`

Prefer `--dry-run` before every new environment or large change.

### 5. Reveal Raw IDs Only When Explicitly Needed

The script redacts wrapped IDs by default. Use `--show-ids` only when the user explicitly needs the raw values for debugging or a manual replay.

Do not paste raw IDs into:

- README examples
- issues
- commit messages
- skill docs
- public conversations

## Safety Rules

Apply these rules throughout the task:

- Never commit decrypted cookies.
- Never commit terminal output from `--show-ids`.
- Never publish the user’s personal printer names, note contents, usernames, or phone numbers unless the user explicitly asks.
- Never claim a captured `toUserId` or `guidList` is permanent.
- Prefer sanitized examples such as `My Memobird` or `Friend A`.
- Before publishing, run a repository-wide search for personal names, printer names, phone numbers, emails, and previously captured tokens.

## Repository Work

When preparing a public repository:

1. Keep the repo self-contained with `SKILL.md`, `scripts/`, and `references/`.
2. Write README examples with generic device names and sample text.
3. Configure the repo-local git author email to a GitHub `noreply` address if the user asked not to leak personal email.
4. Search the repo for obvious secrets and personal data before committing.
5. Prefer one initial clean commit instead of a history that contains then removes sensitive content.

## Script Usage

The main helper is:

- `scripts/memobird-print.mjs`

Use it to:

- list available note targets and printers
- preview a request without printing
- print text through the current Edge login session

If the task needs deeper protocol analysis, open:

- `references/reverse-engineering.md`

## Expected Output

For a reverse engineering task, produce:

- the request sequence
- the field origin for `PrintPaper`
- the reason captured IDs should not be hardcoded
- the recommended runtime strategy

For an automation task, produce:

- a working script invocation
- a dry-run example
- any environment limitations

For a publication task, produce:

- a sanitized repository
- a concise README
- no committed personal identifiers

