# Sportline

Sports betting CLI + data pipeline.

This repo supports:

- Ingesting game/odds/stat data into local JSON (`data/<sport>/<season>/...`)
- Importing those JSON files into a local SQLite DB (`data/sportline.db`)
- Training models + running analysis/backtests
- Generating recommendations via the CLI

Supported sports (as currently wired): `ncaam`, `nba`, `nfl`, `cfb`, `nhl`.

## Prerequisites

- Node.js 20+
- `sqlite3` CLI installed (used by some `npm run db:*` helpers)

## Install

```bash
npm ci
```

## Build + run the CLI

```bash
# `build` runs `check` (format:check + lint + tsc) and emits `dist/`
npm run build

# Run the CLI from dist
node dist/cli/index.js --help
```

If you want a global `sportline` command, you can link it after building:

```bash
npm link
sportline --help
```

## Data workflow

### 1) Ingest raw data to JSON

These commands write JSON into `data/<sport>/...`.

```bash
# all sports
npm run ingest:sports:json

# single sport
npm run ingest:ncaam:json
npm run ingest:nba:json
npm run ingest:nfl:json
npm run ingest:cfb:json
npm run ingest:nhl:json
```

### 2) Initialize the SQLite database

```bash
npm run db:init
```

This creates/updates `data/sportline.db` using `src/db/schema.sql`.

### 3) Import JSON into the SQLite database

```bash
# import one sport (optionally with season)
npm run import:ncaam:db -- [season]
npm run import:nba:db -- [season]
npm run import:nfl:db -- [season]
npm run import:cfb:db -- [season]
npm run import:nhl:db -- [season]

# bulk helpers (imports any seasons found on disk)
npm run import:ncaam:full
npm run import:nba:full
npm run import:nfl:full
npm run import:cfb:full
npm run import:nhl:full
```

## Training + analysis

After you’ve ingested/imported enough history:

```bash
npm run build
node dist/cli/index.js train --help
```

Examples:

```bash
# update odds / data (command options live under --help)
npm run update:odds

# generic CLI entrypoint
node dist/cli/index.js recommend --help
```

Other CLI commands live under `src/cli/commands/*` (backtest, analyze, recommend, update, etc.).

## Development

```bash
npm run dev         # tsc --watch
npm test            # vitest
npm run check       # format:check + lint + tsc
```

## CI

CI runs:

```bash
npm ci
npm run check
npm test
```

## Documentation

See `docs/README.md`.

## Notes

- `coverage/` is gitignored.
- Some third-party ML libraries don’t ship TypeScript types; this repo uses a small local shim in `src/types/` where needed.

## License

MIT
