#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_SKILL_NAME = 'memobird-edge-print-skill';

main();

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const destination = resolveDestination(options);
  if (!destination) {
    throw new Error('Could not resolve destination. Use --target codex|claude|generic or pass --dest.');
  }

  if (fs.existsSync(destination)) {
    if (!options.force) {
      throw new Error(`Destination already exists: ${destination}. Use --force to replace it.`);
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  copySkillPackage(destination);

  console.log(`Installed ${DEFAULT_SKILL_NAME} to ${destination}`);
  if (options.target === 'codex') {
    console.log('Restart Codex to pick up the new skill if it is already running.');
  } else if (options.target === 'claude') {
    console.log('Restart Claude Code if it is already running.');
  }
}

function parseArgs(argv) {
  const options = {
    help: false,
    force: false,
    target: '',
    dest: '',
    name: DEFAULT_SKILL_NAME,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--target':
        options.target = requireValue(argv, ++i, arg);
        break;
      case '--dest':
        options.dest = requireValue(argv, ++i, arg);
        break;
      case '--name':
        options.name = requireValue(argv, ++i, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function resolveDestination(options) {
  if (options.dest) {
    return path.resolve(options.dest);
  }

  const home = os.homedir();
  const skillName = options.name || DEFAULT_SKILL_NAME;
  switch (normalizeKey(options.target)) {
    case 'codex': {
      const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');
      return path.join(codexHome, 'skills', skillName);
    }
    case 'claude':
    case 'claudecode':
      return path.join(home, '.claude', 'commands', skillName);
    case 'generic':
      return '';
    default:
      return '';
  }
}

function copySkillPackage(destination) {
  fs.cpSync(PACKAGE_ROOT, destination, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(PACKAGE_ROOT, source);
      if (!relative) {
        return true;
      }

      const topLevel = relative.split(path.sep)[0];
      if (['.git', 'node_modules'].includes(topLevel)) {
        return false;
      }

      if (relative === '.env.local' || relative === '.DS_Store') {
        return false;
      }

      return true;
    },
  });
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function printHelp() {
  console.log(`memobird-edge-print-install

Install the packaged skill files into a local agent/runtime directory.

Usage:
  memobird-edge-print-install --target codex
  memobird-edge-print-install --target claude
  memobird-edge-print-install --dest ~/.custom-agent/skills/memobird-edge-print-skill
  memobird-edge-print-install --target codex --force

Options:
  --target   Install target: codex | claude | generic
  --dest     Explicit destination directory
  --name     Override the installed directory name
  --force    Replace an existing install
  -h, --help Show this help
`);
}
