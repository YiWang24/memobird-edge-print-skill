#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const API_URL = 'https://w.memobird.cn/cn/ashx/DBInterface.ashx';
const REFERER = 'https://w.memobird.cn/cn/w/mailList.html';
const DEFAULT_PROFILE = 'Default';
const DEFAULT_WIDTH = 32;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (process.platform !== 'darwin') {
    throw new Error('This script currently supports macOS only because it reads the local Edge cookie store.');
  }

  const session = createMemobirdSession(options.profile);
  const lander = await session.getJson('GetLanderInfo');
  assertApiSuccess(lander, 'GetLanderInfo');

  const login = await session.getJson('LoginWeb');
  assertApiSuccess(login, 'LoginWeb');

  const notes = Array.isArray(login.notes) ? login.notes : [];
  const smartCores = Array.isArray(login.smartCores) && login.smartCores.length > 0
    ? login.smartCores
    : await loadFallbackSmartCores(session);

  if (options.list) {
    printSessionSummary(lander, notes, smartCores, options.showIds);
    return;
  }

  const rawText = readInputText(options);
  if (!rawText) {
    throw new Error('No print text provided. Use --text, --file, positional text, or pipe stdin.');
  }

  const targetNote = selectTargetNote(notes, login, lander, options.recipient);
  const targetPrinter = selectTargetPrinter(smartCores, options.device);
  const html = formatPlainTextForMemobird(rawText, {
    width: options.width,
    wrap: options.wrap,
  });

  const payload = new URLSearchParams({
    DataType: 'PrintPaper',
    fromUserName: lander.userName || login.userName || '',
    toUserId: targetNote.userId,
    toUserName: targetNote.userName,
    guidList: targetPrinter.smartGuid,
    printContent: encodeURIComponent(html),
    t: String(Date.now()),
  });

  if (options.dryRun) {
    const preview = {
      fromUserName: lander.userName || login.userName || '',
      toUserName: targetNote.userName,
      toUserId: maybeRedact(targetNote.userId, options.showIds),
      smartName: targetPrinter.smartName,
      guidList: maybeRedact(targetPrinter.smartGuid, options.showIds),
      width: options.width,
      wrap: options.wrap,
      html,
      formBody: options.showIds ? payload.toString() : redactFormBody(payload.toString()),
    };
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const result = await session.postForm(payload);
  assertApiSuccess(result, 'PrintPaper');

  console.log(`Printed to "${targetPrinter.smartName}" as ${lander.userName} -> ${targetNote.userName}`);
  console.log(`Server message: ${result.msg || 'OK'}`);
  if (options.debug) {
    console.log(JSON.stringify(result, null, 2));
  }
}

function parseArgs(argv) {
  const options = {
    profile: DEFAULT_PROFILE,
    width: DEFAULT_WIDTH,
    wrap: true,
    dryRun: false,
    debug: false,
    list: false,
    help: false,
    showIds: false,
    text: '',
    file: '',
    device: '',
    recipient: '',
    positional: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--no-wrap':
        options.wrap = false;
        break;
      case '--show-ids':
        options.showIds = true;
        break;
      case '--text':
      case '-t':
        options.text = requireValue(argv, ++i, arg);
        break;
      case '--file':
      case '-f':
        options.file = requireValue(argv, ++i, arg);
        break;
      case '--device':
      case '-d':
        options.device = requireValue(argv, ++i, arg);
        break;
      case '--recipient':
      case '-r':
        options.recipient = requireValue(argv, ++i, arg);
        break;
      case '--profile':
      case '-p':
        options.profile = requireValue(argv, ++i, arg);
        break;
      case '--width':
      case '-w':
        options.width = parseWidth(requireValue(argv, ++i, arg));
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        options.positional.push(arg);
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`memobird-print.mjs

Usage:
  node scripts/memobird-print.mjs --list
  node scripts/memobird-print.mjs --dry-run --text "hello"
  node scripts/memobird-print.mjs --device "My Memobird" --text "line one\\nline two"
  echo "print from stdin" | node scripts/memobird-print.mjs

Options:
  -t, --text        Text to print
  -f, --file        Read text from a file
  -d, --device      Printer name to target, default is the first bound printer
  -r, --recipient   Note target name, default is self ("我")
  -p, --profile     Edge profile name, default is "Default"
  -w, --width       Wrap width in display cells, default is 32
      --no-wrap     Disable automatic wrapping
      --dry-run     Show resolved request payload without printing
      --list        Show logged-in user, notes, and printers
      --show-ids    Reveal raw wrapped IDs instead of redacted output
      --debug       Print raw API response after PrintPaper
  -h, --help        Show this help
`);
}

function requireValue(argv, index, flagName) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flagName}`);
  }
  return value;
}

function parseWidth(value) {
  const width = Number.parseInt(value, 10);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid width: ${value}`);
  }
  return width;
}

function readInputText(options) {
  if (options.text) {
    return options.text;
  }

  if (options.file) {
    const filePath = path.resolve(options.file);
    return fs.readFileSync(filePath, 'utf8');
  }

  if (options.positional.length > 0) {
    return options.positional.join(' ');
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, 'utf8');
  }

  return '';
}

function createMemobirdSession(profileName) {
  const loginInfo = readEdgeCookie({
    profileName,
    domain: 'w.memobird.cn',
    name: 'logininfo',
  });

  if (!loginInfo) {
    throw new Error('Could not read the Edge logininfo cookie. Log in at https://w.memobird.cn/cn/w/mailList.html first.');
  }

  async function request(url, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('cookie', `logininfo=${loginInfo}`);
    headers.set('referer', REFERER);
    headers.set('x-requested-with', 'XMLHttpRequest');

    const response = await fetch(url, {
      ...init,
      headers,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    return body;
  }

  return {
    async getJson(dataType, extra = {}) {
      const params = new URLSearchParams({
        DataType: dataType,
        ...extra,
        t: String(Date.now()),
      });
      const body = await request(`${API_URL}?${params.toString()}`);
      return parseJson(body, dataType);
    },
    async postForm(formData) {
      const body = await request(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: formData.toString(),
      });
      return parseJson(body, 'PrintPaper');
    },
  };
}

async function loadFallbackSmartCores(session) {
  const fallback = await session.getJson('GetSmartCoreByUserID', { UserId: '' });
  assertApiSuccess(fallback, 'GetSmartCoreByUserID');
  return Array.isArray(fallback.smartCores) ? fallback.smartCores : [];
}

function selectTargetNote(notes, login, lander, requestedRecipient) {
  const normalized = normalizeKey(requestedRecipient);
  const selfUserId = login.userId || lander.userId || '';

  if (normalized) {
    if (['self', 'me', '我'].includes(normalized)) {
      const selfNote = notes.find((note) => note.userId === selfUserId || note.userName === '我');
      if (selfNote) {
        return selfNote;
      }
    }

    const explicit = notes.find((note) =>
      normalizeKey(note.userName) === normalized ||
      normalizeKey(note.userGgNumber) === normalized,
    );
    if (explicit) {
      return explicit;
    }

    throw new Error(`Recipient not found in current note list: ${requestedRecipient}`);
  }

  const selfNote = notes.find((note) => note.userId === selfUserId || note.userName === '我');
  if (selfNote) {
    return selfNote;
  }

  if (selfUserId) {
    return {
      userId: selfUserId,
      userName: '我',
      userGgNumber: lander.userGgNumber || '',
    };
  }

  if (notes.length > 0) {
    return notes[0];
  }

  throw new Error('No available note target found.');
}

function selectTargetPrinter(smartCores, requestedDevice) {
  if (!Array.isArray(smartCores) || smartCores.length === 0) {
    throw new Error('No bound Memobird printer found for this account.');
  }

  if (!requestedDevice) {
    return smartCores[0];
  }

  const normalized = normalizeKey(requestedDevice);
  const printer = smartCores.find((item) =>
    normalizeKey(item.smartName) === normalized ||
    normalizeKey(item.smartGuid) === normalized,
  );

  if (!printer) {
    throw new Error(`Printer not found: ${requestedDevice}`);
  }

  return printer;
}

function printSessionSummary(lander, notes, smartCores, showIds) {
  const lines = [
    `Logged in as: ${lander.userName} (${lander.userGgNumber})`,
    '',
    'Notes:',
  ];

  if (notes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const note of notes) {
      lines.push(
        `  - ${note.userName} | gg=${note.userGgNumber || '-'} | userId=${maybeRedact(note.userId, showIds)}`,
      );
    }
  }

  lines.push('', 'Printers:');
  if (smartCores.length === 0) {
    lines.push('  (none)');
  } else {
    for (const printer of smartCores) {
      lines.push(
        `  - ${printer.smartName} | type=${printer.smartType} | smartGuid=${maybeRedact(printer.smartGuid, showIds)}`,
      );
    }
  }

  console.log(lines.join('\n'));
}

function readEdgeCookie({ profileName, domain, name }) {
  const cookieDb = path.join(
    process.env.HOME || '',
    'Library',
    'Application Support',
    'Microsoft Edge',
    profileName,
    'Cookies',
  );

  if (!fs.existsSync(cookieDb)) {
    throw new Error(`Edge cookie database not found: ${cookieDb}`);
  }

  const sql = `select host_key, name, value, hex(encrypted_value) from cookies where host_key = '${escapeSql(domain)}' and name = '${escapeSql(name)}' limit 1;`;

  const output = execFileSync('sqlite3', ['-separator', '\u001f', cookieDb, sql], {
    encoding: 'utf8',
  }).trim();

  if (!output) {
    return '';
  }

  const [hostKey, cookieName, plainValue, encryptedHex] = output.split('\u001f');
  if (!hostKey || cookieName !== name) {
    return '';
  }

  if (plainValue) {
    return plainValue;
  }

  return decryptChromiumCookie(encryptedHex);
}

function decryptChromiumCookie(encryptedHex) {
  if (!encryptedHex) {
    return '';
  }

  const encrypted = Buffer.from(encryptedHex, 'hex');
  const prefix = encrypted.subarray(0, 3).toString('utf8');
  if (prefix !== 'v10') {
    return encrypted.toString('utf8');
  }

  const safeStorageKey = execFileSync('security', ['find-generic-password', '-w', '-s', 'Microsoft Edge Safe Storage'], {
    encoding: 'utf8',
  }).trim();

  const key = crypto.pbkdf2Sync(Buffer.from(safeStorageKey, 'utf8'), 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, ' ');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final(),
  ]);

  return stripChromiumCookiePrefix(decrypted).toString('utf8');
}

function stripChromiumCookiePrefix(buffer) {
  if (buffer.length <= 32) {
    return buffer;
  }

  const fullText = buffer.toString('utf8');
  const stripped = buffer.subarray(32);
  const strippedText = stripped.toString('utf8');

  const fullLooksReadable = isReadableCookieText(fullText);
  const strippedLooksReadable = isReadableCookieText(strippedText);

  if (!fullLooksReadable && strippedLooksReadable) {
    return stripped;
  }

  if (strippedLooksReadable && strippedText.startsWith('{')) {
    return stripped;
  }

  return buffer;
}

function isReadableCookieText(value) {
  if (!value || value.includes('\u0000')) {
    return false;
  }

  let readable = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 126) ||
      code > 159
    ) {
      readable += 1;
    }
  }

  return readable / value.length > 0.85;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON: ${text}`);
  }
}

function assertApiSuccess(payload, label) {
  if (!payload || String(payload.code) !== '1') {
    throw new Error(`${label} failed: ${payload?.msg || JSON.stringify(payload)}`);
  }
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function formatPlainTextForMemobird(input, { width, wrap }) {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
  const sourceLines = normalized.split('\n');
  const outputLines = [];

  for (const line of sourceLines) {
    if (!wrap || line === '') {
      outputLines.push(line);
      continue;
    }

    outputLines.push(...wrapByDisplayWidth(line, width));
  }

  return outputLines.map((line) => {
    if (line === '') {
      return '<p><br/></p>';
    }
    return `<p>${escapeHtml(line)}<br/></p>`;
  }).join('');
}

function wrapByDisplayWidth(line, width) {
  const wrapped = [];
  let current = '';
  let currentWidth = 0;

  const tokens = tokenizeForWrap(line);
  for (const token of tokens) {
    const tokenWidth = displayWidth(token);

    if (tokenWidth > width) {
      if (current) {
        wrapped.push(current);
        current = '';
        currentWidth = 0;
      }

      let chunk = '';
      let chunkWidth = 0;
      for (const char of Array.from(token)) {
        const charWidth = displayWidth(char);
        if (chunk && chunkWidth + charWidth > width) {
          wrapped.push(chunk);
          chunk = '';
          chunkWidth = 0;
        }
        chunk += char;
        chunkWidth += charWidth;
      }
      if (chunk) {
        current = chunk;
        currentWidth = chunkWidth;
      }
      continue;
    }

    if (currentWidth + tokenWidth > width) {
      if (current) {
        wrapped.push(current.trimEnd());
      }
      current = token.trimStart();
      currentWidth = displayWidth(current);
    } else {
      current += token;
      currentWidth += tokenWidth;
    }
  }

  if (current || wrapped.length === 0) {
    wrapped.push(current.trimEnd());
  }

  return wrapped;
}

function tokenizeForWrap(line) {
  return line.match(/[ \t]+|[A-Za-z0-9_.,!?;:'"()\/\[\]{}<>+=-]+|./gu) || [];
}

function displayWidth(text) {
  let width = 0;
  for (const char of Array.from(text)) {
    width += charDisplayWidth(char);
  }
  return width;
}

function charDisplayWidth(char) {
  const code = char.codePointAt(0) || 0;

  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }

  return 1;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function maybeRedact(value, showIds) {
  return showIds ? value : redactToken(value);
}

function redactToken(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  if (text.length <= 12) {
    return `${text.slice(0, 4)}***${text.slice(-2)}`;
  }
  return `${text.slice(0, 8)}***${text.slice(-6)}`;
}

function redactFormBody(formBody) {
  const params = new URLSearchParams(formBody);
  for (const key of ['toUserId', 'guidList']) {
    const value = params.get(key);
    if (value) {
      params.set(key, redactToken(value));
    }
  }
  return params.toString();
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
