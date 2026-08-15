# Google Takeout import

## Export from Google

1. Open [takeout.google.com](https://takeout.google.com/)
2. Select **Location History** / Timeline only
3. Download and unzip until you have JSON with `visit` / `activity`, `semanticSegments`, or Timeline Edits
4. `Timeline/Settings.json` alone is not enough

You can repeat this for each Google account and import each file as a separate source. The map shows the merged view unless you filter by source.

## Supported files

- Classic JSON array of visit/activity records
- `semanticSegments` Timeline.json
- Timeline Edits export
- Zip containing those JSON files (no nested zip, size/entry caps apply)
- Legacy `Records.json` when present in the zip

## Limits

UI uploads follow the plan quota (default 80MB). One active import job per tenant. Replacing a source updates only that Google account’s rows.

## Demo

Demo accounts cannot import.
