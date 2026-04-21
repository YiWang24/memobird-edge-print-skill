#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const API_URL = 'https://w.memobird.cn/cn/ashx/DBInterface.ashx';
const IMAGE_API_URL = 'https://pdf.memobird.cn/print/imageFromFile';
const REFERER = 'https://w.memobird.cn/cn/w/mailList.html';
const DEFAULT_PROFILE = 'Default';
const DEFAULT_WIDTH = 32;
const DEFAULT_IMAGE_SERVER_TYPE = '2';
const DEFAULT_IMAGE_PRINT_TYPE = '2';
const DEFAULT_PAPER_TYPE = '2';

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.envFile) {
    loadEnvFile(options.envFile);
  }

  const envConfig = readEnvConfig();

  if (options.help) {
    printHelp();
    return;
  }

  validateOptionCombination(options);

  if (options.emitEnv && !options.showIds) {
    throw new Error('--emit-env requires --show-ids because it outputs real environment variable values.');
  }

  const contentMode = options.image ? 'image' : 'text';
  const manualTextContextComplete = hasCompleteManualTextContext(envConfig);
  const manualImageContextComplete = hasCompleteManualImageContext(envConfig, options);
  const manualContextComplete = contentMode === 'image' ? manualImageContextComplete : manualTextContextComplete;
  const hasManualEnvExportContext = Boolean(
    envConfig.loginInfo &&
    manualTextContextComplete &&
    envConfig.printerType,
  );
  const needsLiveResolution = options.list || (options.emitEnv && !hasManualEnvExportContext) || !manualContextComplete;
  const needsSession = needsLiveResolution || (contentMode === 'text' && !options.dryRun);

  const session = needsSession
    ? createMemobirdSession({
      profileName: options.profile,
      loginInfo: envConfig.loginInfo,
    })
    : null;

  let lander = {};
  let login = {};
  let notes = [];
  let smartCores = [];

  if (needsLiveResolution) {
    lander = await session.getJson('GetLanderInfo');
    assertApiSuccess(lander, 'GetLanderInfo');

    login = await session.getJson('LoginWeb');
    assertApiSuccess(login, 'LoginWeb');

    notes = Array.isArray(login.notes) ? login.notes : [];
    smartCores = Array.isArray(login.smartCores) && login.smartCores.length > 0
      ? login.smartCores
      : await loadFallbackSmartCores(session);
  }

  if (options.list && !options.emitEnv) {
    printSessionSummary(lander, notes, smartCores, {
      showIds: options.showIds,
      sessionSource: session.source,
      envConfig,
    });
    return;
  }

  if (options.emitEnv) {
    const exportEnvConfig = needsLiveResolution
      ? {
        ...envConfig,
        toUserId: '',
        printerGuid: '',
        printerType: '',
      }
      : envConfig;
    const fromUserName = envConfig.fromUserName || lander.userName || login.userName || '';
    const targetNote = resolveTargetNote({
      envConfig: exportEnvConfig,
      notes,
      login,
      lander,
      requestedRecipient: options.recipient || envConfig.toUserName,
    });
    const targetPrinter = resolveTargetPrinter({
      envConfig: exportEnvConfig,
      smartCores,
      requestedDevice: options.device || envConfig.printerName,
      requestedPrinterType: options.printerType,
      requireType: true,
    });
    const resolvedLoginInfo = envConfig.loginInfo || session?.loginInfo || '';
    if (!resolvedLoginInfo) {
      throw new Error('Cannot emit environment variables without a real MEMOBIRD_LOGININFO value.');
    }

    console.log(renderEnvFile({
      loginInfo: resolvedLoginInfo,
      fromUserName,
      targetNote,
      targetPrinter,
      source: session?.source || 'manual-env',
    }));
    return;
  }

  const targetPrinter = resolveTargetPrinter({
    envConfig,
    smartCores,
    requestedDevice: options.device,
    requestedPrinterType: options.printerType,
    requireType: contentMode === 'image',
  });

  if (contentMode === 'image') {
    const imagePath = readImagePath(options.image);
    const imagePrintType = normalizeImagePrintType(options.imagePrintType);
    const paperType = normalizePaperType(options.paperType);
    const imageInfo = getImageFileInfo(imagePath);

    if (options.dryRun) {
      const preview = {
        mode: 'image',
        endpoint: IMAGE_API_URL,
        sessionSource: session?.source || 'manual-env:no-session',
        manualOverrideFields: listActiveEnvOverrideFields(envConfig),
        smartName: targetPrinter.smartName,
        smartGuid: maybeRedact(targetPrinter.smartGuid, options.showIds),
        smartType: targetPrinter.smartType,
        imagePath,
        imageFileName: imageInfo.fileName,
        imageSizeBytes: imageInfo.sizeBytes,
        mimeType: imageInfo.mimeType,
        printType: imagePrintType,
        paperType,
        serverType: DEFAULT_IMAGE_SERVER_TYPE,
      };
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const result = await printImageFile({
      imagePath,
      targetPrinter,
      imagePrintType,
      paperType,
      serverType: DEFAULT_IMAGE_SERVER_TYPE,
    });
    assertImagePrintSuccess(result, 'imageFromFile');

    console.log(`Printed image to "${targetPrinter.smartName}" (${imageInfo.fileName})`);
    console.log(`Server message: ${result.msg || '发送成功'}`);
    if (options.debug) {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  const rawText = readInputText(options);
  if (!rawText) {
    throw new Error('No print text provided. Use --text, --file, positional text, or pipe stdin.');
  }

  const fromUserName = envConfig.fromUserName || lander.userName || login.userName || '';
  const targetNote = resolveTargetNote({
    envConfig,
    notes,
    login,
    lander,
    requestedRecipient: options.recipient,
  });
  const html = formatPlainTextForMemobird(rawText, {
    width: options.width,
    wrap: options.wrap,
  });

  const payload = new URLSearchParams({
    DataType: 'PrintPaper',
    fromUserName,
    toUserId: targetNote.userId,
    toUserName: targetNote.userName,
    guidList: targetPrinter.smartGuid,
    printContent: encodeURIComponent(html),
    t: String(Date.now()),
  });

  if (options.dryRun) {
    const preview = {
      mode: 'text',
      sessionSource: session?.source || 'manual-env:no-session',
      manualOverrideFields: listActiveEnvOverrideFields(envConfig),
      fromUserName,
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

  if (!session) {
    throw new Error('Printing requires a valid session. Set MEMOBIRD_LOGININFO or use logged-in Edge on macOS first.');
  }

  const result = await session.postForm(payload);
  assertApiSuccess(result, 'PrintPaper');

  console.log(`Printed to "${targetPrinter.smartName}" as ${fromUserName} -> ${targetNote.userName}`);
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
    emitEnv: false,
    envFile: '',
    text: '',
    file: '',
    image: '',
    device: '',
    recipient: '',
    printerType: '',
    imagePrintType: DEFAULT_IMAGE_PRINT_TYPE,
    paperType: DEFAULT_PAPER_TYPE,
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
      case '--emit-env':
        options.emitEnv = true;
        break;
      case '--env-file':
        options.envFile = requireValue(argv, ++i, arg);
        break;
      case '--text':
      case '-t':
        options.text = requireValue(argv, ++i, arg);
        break;
      case '--file':
      case '-f':
        options.file = requireValue(argv, ++i, arg);
        break;
      case '--image':
      case '-i':
        options.image = requireValue(argv, ++i, arg);
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
      case '--printer-type':
        options.printerType = requireValue(argv, ++i, arg);
        break;
      case '--image-print-type':
        options.imagePrintType = requireValue(argv, ++i, arg);
        break;
      case '--paper-type':
        options.paperType = requireValue(argv, ++i, arg);
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
  node scripts/memobird-print.mjs --env-file .env.local --dry-run --text "hello"
  node scripts/memobird-print.mjs --env-file .env.local --image ./photo.png --dry-run
  node scripts/memobird-print.mjs --env-file .env.local --image ./photo.png --paper-type roll
  node scripts/memobird-print.mjs --device "My Memobird" --text "line one\\nline two"
  MEMOBIRD_LOGININFO='...' node scripts/memobird-print.mjs --list
  node scripts/memobird-print.mjs --show-ids --emit-env
  echo "print from stdin" | node scripts/memobird-print.mjs

Options:
  -t, --text        Text to print
  -f, --file        Read text from a file
  -i, --image       Image file to print through the image-print service
  -d, --device      Printer name to target, default is the first bound printer
  -r, --recipient   Note target name, default is self ("我")
  -p, --profile     Edge profile name, default is "Default"
  -w, --width       Wrap width in display cells, default is 32
      --paper-type  Image paper type: roll|folded|2|1, default is roll (2)
      --image-print-type  Image mode: text|rich|2|1, default is text (2)
      --printer-type Numeric printer smartType for image mode when not auto-resolving
      --no-wrap     Disable automatic wrapping
      --dry-run     Show resolved request payload without printing
      --list        Show logged-in user, notes, and printers
      --emit-env    Print a .env-style block with the resolved real values
      --env-file    Load variables from a .env-style file before running
      --show-ids    Reveal raw wrapped IDs instead of redacted output
      --debug       Print raw API response after PrintPaper
  -h, --help        Show this help

Environment Variables:
  MEMOBIRD_LOGININFO       Use this cookie value instead of reading Edge locally
  MEMOBIRD_FROM_USER_NAME  Override fromUserName in PrintPaper
  MEMOBIRD_TO_USER_ID      Override toUserId in PrintPaper
  MEMOBIRD_TO_USER_NAME    Override toUserName in PrintPaper
  MEMOBIRD_PRINTER_GUID    Override guidList in PrintPaper
  MEMOBIRD_GUID_LIST       Alias for MEMOBIRD_PRINTER_GUID
  MEMOBIRD_PRINTER_TYPE    Override printer smartType, used by image printing
  MEMOBIRD_PRINTER_NAME    Optional display name for the overridden printer
`);
}

function validateOptionCombination(options) {
  if (options.image && (options.text || options.file || options.positional.length > 0)) {
    throw new Error('Use --image by itself. Do not combine it with --text, --file, or positional text.');
  }
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

function readEnvConfig() {
  return {
    loginInfo: readEnvValue('MEMOBIRD_LOGININFO'),
    fromUserName: readEnvValue('MEMOBIRD_FROM_USER_NAME'),
    toUserId: readEnvValue('MEMOBIRD_TO_USER_ID'),
    toUserName: readEnvValue('MEMOBIRD_TO_USER_NAME'),
    printerGuid: readEnvValue('MEMOBIRD_PRINTER_GUID') || readEnvValue('MEMOBIRD_GUID_LIST'),
    printerType: readEnvValue('MEMOBIRD_PRINTER_TYPE'),
    printerName: readEnvValue('MEMOBIRD_PRINTER_NAME'),
  };
}

function readEnvValue(name) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
}

function loadEnvFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (!key) {
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replaceAll('\\n', '\n')
          .replaceAll('\\r', '\r')
          .replaceAll('\\t', '\t')
          .replaceAll('\\"', '"')
          .replaceAll('\\\\', '\\');
      } else {
        value = value.replaceAll("\\'", "'");
      }
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function hasCompleteManualTextContext(envConfig) {
  return Boolean(
    envConfig.fromUserName &&
    envConfig.toUserId &&
    envConfig.toUserName &&
    envConfig.printerGuid,
  );
}

function hasCompleteManualImageContext(envConfig, options) {
  return Boolean(
    envConfig.printerGuid &&
    (options.printerType || envConfig.printerType),
  );
}

function createMemobirdSession({ profileName, loginInfo }) {
  const resolvedLoginInfo = loginInfo || readEdgeLoginInfoFromProfile(profileName);

  if (!resolvedLoginInfo) {
    throw new Error(
      'Could not resolve logininfo. Either set MEMOBIRD_LOGININFO or log in at https://w.memobird.cn/cn/w/mailList.html in Microsoft Edge on macOS first.',
    );
  }

  async function request(url, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('cookie', `logininfo=${resolvedLoginInfo}`);
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
    source: loginInfo ? 'env:MEMOBIRD_LOGININFO' : `edge:${profileName}`,
    loginInfo: resolvedLoginInfo,
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

function readEdgeLoginInfoFromProfile(profileName) {
  if (process.platform !== 'darwin') {
    return '';
  }

  return readEdgeCookie({
    profileName,
    domain: 'w.memobird.cn',
    name: 'logininfo',
  });
}

async function loadFallbackSmartCores(session) {
  const fallback = await session.getJson('GetSmartCoreByUserID', { UserId: '' });
  assertApiSuccess(fallback, 'GetSmartCoreByUserID');
  return Array.isArray(fallback.smartCores) ? fallback.smartCores : [];
}

function resolveTargetNote({ envConfig, notes, login, lander, requestedRecipient }) {
  if (envConfig.toUserId) {
    return {
      userId: envConfig.toUserId,
      userName: envConfig.toUserName || requestedRecipient || inferUserNameFromNotes(notes, envConfig.toUserId) || 'Manual recipient',
      userGgNumber: '',
    };
  }

  return selectTargetNote(notes, login, lander, requestedRecipient);
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

function inferUserNameFromNotes(notes, userId) {
  const note = Array.isArray(notes) ? notes.find((item) => item.userId === userId) : null;
  return note?.userName || '';
}

function resolveTargetPrinter({ envConfig, smartCores, requestedDevice, requestedPrinterType, requireType = false }) {
  if (envConfig.printerGuid) {
    const smartType = requestedPrinterType || envConfig.printerType || inferPrinterTypeFromSmartCores(smartCores, envConfig.printerGuid) || '';
    if (requireType && !smartType) {
      throw new Error('Image printing requires printer type. Set MEMOBIRD_PRINTER_TYPE, use --printer-type, or let the script resolve the printer from a live session.');
    }
    return {
      smartGuid: envConfig.printerGuid,
      smartName: envConfig.printerName || requestedDevice || inferPrinterNameFromSmartCores(smartCores, envConfig.printerGuid) || 'Manual printer',
      smartType,
    };
  }

  const printer = selectTargetPrinter(smartCores, requestedDevice);
  if (requireType && !printer.smartType) {
    throw new Error('Selected printer does not expose a usable smartType for image printing.');
  }
  return printer;
}

function inferPrinterNameFromSmartCores(smartCores, smartGuid) {
  const printer = Array.isArray(smartCores) ? smartCores.find((item) => item.smartGuid === smartGuid) : null;
  return printer?.smartName || '';
}

function inferPrinterTypeFromSmartCores(smartCores, smartGuid) {
  const printer = Array.isArray(smartCores) ? smartCores.find((item) => item.smartGuid === smartGuid) : null;
  return printer?.smartType ? String(printer.smartType) : '';
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

function printSessionSummary(lander, notes, smartCores, { showIds, sessionSource, envConfig }) {
  const lines = [
    `Session source: ${sessionSource}`,
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

  const overrideFields = listActiveEnvOverrideFields(envConfig);
  if (overrideFields.length > 0) {
    lines.push('', `Manual env overrides active: ${overrideFields.join(', ')}`);
  }

  console.log(lines.join('\n'));
}

function listActiveEnvOverrideFields(envConfig) {
  const fields = [];
  if (envConfig.fromUserName) fields.push('MEMOBIRD_FROM_USER_NAME');
  if (envConfig.toUserId) fields.push('MEMOBIRD_TO_USER_ID');
  if (envConfig.toUserName) fields.push('MEMOBIRD_TO_USER_NAME');
  if (envConfig.printerGuid) fields.push('MEMOBIRD_PRINTER_GUID');
  if (envConfig.printerType) fields.push('MEMOBIRD_PRINTER_TYPE');
  if (envConfig.printerName) fields.push('MEMOBIRD_PRINTER_NAME');
  return fields;
}

function renderEnvFile({ loginInfo, fromUserName, targetNote, targetPrinter, source }) {
  const lines = [
    `# Generated locally from ${source}`,
    '# Keep this file private. Do not commit it.',
    `MEMOBIRD_LOGININFO=${quoteEnvValue(loginInfo)}`,
    `MEMOBIRD_FROM_USER_NAME=${quoteEnvValue(fromUserName)}`,
    `MEMOBIRD_TO_USER_ID=${quoteEnvValue(targetNote.userId)}`,
    `MEMOBIRD_TO_USER_NAME=${quoteEnvValue(targetNote.userName)}`,
    `MEMOBIRD_PRINTER_GUID=${quoteEnvValue(targetPrinter.smartGuid)}`,
    `MEMOBIRD_PRINTER_TYPE=${quoteEnvValue(targetPrinter.smartType)}`,
    `MEMOBIRD_PRINTER_NAME=${quoteEnvValue(targetPrinter.smartName)}`,
  ];
  return lines.join('\n');
}

function readImagePath(imagePath) {
  const resolvedPath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image file not found: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Image path is not a file: ${resolvedPath}`);
  }

  return resolvedPath;
}

function getImageFileInfo(imagePath) {
  const stat = fs.statSync(imagePath);
  return {
    fileName: path.basename(imagePath),
    sizeBytes: stat.size,
    mimeType: detectImageMimeType(imagePath),
  };
}

function detectImageMimeType(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.bmp':
      return 'image/bmp';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function normalizeImagePrintType(value) {
  const normalized = normalizeKey(value);
  switch (normalized) {
    case '1':
    case 'rich':
    case 'graphic':
    case 'mixed':
    case '图文':
      return { id: '1', label: 'rich' };
    case '2':
    case 'text':
    case 'plain':
    case '文本':
    case '':
      return { id: '2', label: 'text' };
    default:
      throw new Error(`Invalid image print type: ${value}. Use text|rich|2|1.`);
  }
}

function normalizePaperType(value) {
  const normalized = normalizeKey(value);
  switch (normalized) {
    case '1':
    case 'folded':
    case 'fold':
    case 'stack':
    case '折叠':
    case 'folded-paper':
      return { id: '1', label: 'folded' };
    case '2':
    case 'roll':
    case 'rolled':
    case '卷纸':
    case '':
      return { id: '2', label: 'roll' };
    default:
      throw new Error(`Invalid paper type: ${value}. Use roll|folded|2|1.`);
  }
}

async function printImageFile({ imagePath, targetPrinter, imagePrintType, paperType, serverType }) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageInfo = getImageFileInfo(imagePath);
  const formData = new FormData();

  formData.append('file', new Blob([imageBuffer], { type: imageInfo.mimeType }), imageInfo.fileName);
  formData.append('smartGuid', targetPrinter.smartGuid);
  formData.append('type', String(targetPrinter.smartType));
  formData.append('printType', imagePrintType.id);
  formData.append('paperType', paperType.id);
  formData.append('serverType', String(serverType));

  const response = await fetch(IMAGE_API_URL, {
    method: 'POST',
    body: formData,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return parseJson(body, 'imageFromFile');
}

function assertImagePrintSuccess(payload, label) {
  if (payload && (String(payload.code) === '1' || (typeof payload.data === 'string' && payload.data.trim() !== ''))) {
    return;
  }

  throw new Error(`${label} failed: ${payload?.msg || JSON.stringify(payload)}`);
}

function quoteEnvValue(value) {
  return JSON.stringify(String(value || ''));
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
