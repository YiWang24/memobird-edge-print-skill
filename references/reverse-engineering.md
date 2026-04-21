# Memobird Reverse Engineering Notes

This reference explains the method used to recover the Memobird Web printing flow without hardcoding a stale packet capture.

## High-Level Flow

The web app centers on:

- Page: `https://w.memobird.cn/cn/w/mailList.html`
- API endpoint: `https://w.memobird.cn/cn/ashx/DBInterface.ashx`
- Main client script: `Scripts/Ajax/mailListAjax.js`

The stable text-note sequence is:

1. Read Edge login state from the local `logininfo` cookie.
2. Call `GetLanderInfo`.
3. Call `LoginWeb`.
4. Read the current note targets and bound devices from those responses.
5. Send `PrintPaper`.

The stable image-print sequence is different:

1. Resolve the current bound device and its wrapped `smartGuid`.
2. Read the printer's numeric `smartType`.
3. Upload the image file to `https://pdf.memobird.cn/print/imageFromFile`.
4. Include `printType`, `paperType`, and `serverType`.

Optional supporting calls:

- `GetFriends`
- `GetSmartCoreByUserID`
- `ViewNoteAndGetSmartCore`
- `GetSmartCoreInfo`

## Why One-Off Packet Replay Is Not Enough

Two `PrintPaper` fields look like stable IDs at first glance:

- `toUserId`
- `guidList`

They are not stable raw IDs. They are wrapped strings that decode into a JSON object containing:

- `parameter`
- `sysDate`

That means the values are time-scoped. A captured token is useful as evidence that the field exists, but it should not be treated as a long-term constant.

## Source-First Field Mapping

In `mailListAjax.js`, the `printPaper()` function constructs the request roughly like this:

- `fromUserName` from `#userName`
- `toUserId` from `#notes .active[data-userId]`
- `toUserName` from the active note item name
- `guidList` from active printer DOM nodes and their `data-smartGuid`
- `printContent` from `ue.getContent()`, then URL-encoded
- `t` from the current timestamp

That immediately shows the important point: the print request is assembled from live page state, not from a compile-time secret.

For image printing, the relevant frontend code is the `#picPrint` click handler in `mailListAjax.js`. It constructs a `FormData` payload with:

- `file`
- `smartGuid`
- `type`
- `printType`
- `paperType`
- `serverType`

and posts it to:

- `https://pdf.memobird.cn/print/imageFromFile`

This is not the same flow as `PrintPaper`.

## Where The Wrapped Values Come From

The live wrapped values arrive from normal API responses:

- `GetLanderInfo` returns the logged-in wrapped `userId`
- `LoginWeb` returns note targets and bound `smartCores`
- `GetFriends` returns wrapped `userId` values for friends
- `GetSmartCoreByUserID` returns wrapped `smartGuid` values

The result is that the correct implementation strategy is:

- fetch fresh values from the current session
- choose the target note and printer
- call `PrintPaper`

Do not store captured wrapped values in the repository.

For image printing, you still need the wrapped `smartGuid`, but you also need the printer's numeric `smartType`. That `smartType` is exposed in the same live device data used by the web UI.

## Browser Confirmation Procedure

Use the browser to confirm behavior:

1. Open Memobird Web in Microsoft Edge.
2. Open DevTools.
3. Switch to Network.
4. Filter to `Fetch/XHR`.
5. Reload the page and optionally send a test print.
6. Inspect the `DBInterface.ashx` requests.

When validating a field:

- confirm the field exists in the request
- trace it back to frontend code or a prior response
- avoid assuming the captured literal value is reusable

## Runtime Strategy Used In The Script

The public script uses the local browser session instead of a copied capture:

1. Read the Edge `Cookies` database.
2. Load `Microsoft Edge Safe Storage` from the macOS keychain.
3. Decrypt the `logininfo` cookie.
4. Send authenticated calls to Memobird Web endpoints.
5. Resolve fresh wrapped IDs on each run.

This makes the script portable for any user who is already logged in locally.

For image printing, the script does not send `PrintPaper`. Instead it uploads the selected local image file directly to `pdf.memobird.cn/print/imageFromFile` with the resolved `smartGuid` and `smartType`.

## Redaction Rules

When documenting or publishing:

- redact wrapped `userId` values
- redact wrapped `smartGuid` values
- redact cookies
- avoid committing real printer names if they are personal
- avoid committing captured note contents

Examples in public docs should use generic placeholders, not live output copied from the terminal.

## Recommended Validation Sequence

Use this sequence in practice:

```bash
node scripts/memobird-print.mjs --list
node scripts/memobird-print.mjs --dry-run --text "hello"
node scripts/memobird-print.mjs --image ./photo.png --dry-run
node scripts/memobird-print.mjs --text "hello"
```

Use `--show-ids` only for explicit debugging tasks.
