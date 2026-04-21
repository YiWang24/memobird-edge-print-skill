# Memobird Edge Print Skill

Public skill and helper scripts for:

- reverse engineering the Memobird Web `PrintPaper` flow
- printing notes through a live browser session when available
- printing notes from manually supplied environment variables across macOS, Linux, and Windows

## Documentation

- [English Documentation](./README.en.md)
- [中文文档](./README.zh-CN.md)

## Repository Layout

- [`SKILL.md`](./SKILL.md): agent-facing skill instructions
- [`README.en.md`](./README.en.md): human-facing English guide
- [`README.zh-CN.md`](./README.zh-CN.md): human-facing Chinese guide
- [`references/reverse-engineering.md`](./references/reverse-engineering.md): reverse engineering notes
- [`scripts/memobird-print.mjs`](./scripts/memobird-print.mjs): main helper script
- [`.env.example`](./.env.example): cross-platform env template

## Recommended Entry Points

- For humans: start with [README.en.md](./README.en.md) or [README.zh-CN.md](./README.zh-CN.md)
- For agents: start with [SKILL.md](./SKILL.md)

## Quick Summary

- Human workflow:
  copy [`.env.example`](./.env.example) to `.env.local`, fill in the values, then run `node scripts/memobird-print.mjs --env-file .env.local --dry-run --text "hello"`.
- Agent workflow:
  inspect the Memobird frontend flow, resolve fresh values from the current environment when possible, and only fall back to human-provided env values when necessary.

<details>
<summary>Agent / Reverse Engineering Notes</summary>

The detailed agent-oriented reverse engineering workflow is intentionally kept out of the main human README flow.

Start here:

- [`SKILL.md`](./SKILL.md)
- [`references/reverse-engineering.md`](./references/reverse-engineering.md)

When the environment supports it, the agent can:

- inspect frontend source
- confirm request flow through browser capture
- resolve fresh wrapped IDs dynamically
- emit a ready-to-use local env block with `--emit-env`

</details>
