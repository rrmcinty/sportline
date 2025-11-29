# sportline

NCAAM betting CLI with parlay EV ranking.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Daily data update (run this each day to get new games and scores)
npm run ingest

# Fetch today's games (date defaults to today)
node dist/index.js games

# Show odds for a specific game (date defaults to today)
node dist/index.js odds --event 401827111

# Generate parlay recommendations (date defaults to today)
node dist/index.js recommend --stake 10 --min-legs 2 --max-legs 4 --top 10
```

## Daily Workflow

**Every day before using the app:**
```bash
npm run ingest        # Updates both CFB and NCAAM
# OR
npm run ingest:cfb    # CFB only
npm run ingest:ncaam  # NCAAM only
```

This command:
- Finds the latest date in your database for each sport
- Fetches all games from that date through today
- Updates scores for completed games
- Adds newly scheduled games
- Updates odds for all games

**After accumulating ~100+ new games, retrain models:**
```bash
sportline model train --sport cfb --season 2025 --markets moneyline,spread,total
sportline model train --sport ncaam --season 2025 --markets moneyline,spread,total
```

## Example Output

### Fetch Games
```bash
$ node dist/index.js games -d 20251129

📅 2 game(s) on 20251129:

Event ID: 401827111
  Bethune-Cookman Wildcats @ Indiana Hoosiers
  Venue: Simon Skjodt Assembly Hall
  Date: 11/29/2025, 12:00:00 PM

Event ID: 401826886
  Norfolk State Spartans @ Arizona Wildcats
  Venue: McKale Memorial Center
  Date: 11/29/2025, 4:00:00 PM
```

### Import Odds
```bash
$ node dist/index.js odds -e 401827111 -d 20251129

🎯 Bethune-Cookman Wildcats @ Indiana Hoosiers

Provider: ESPN BET

Moneylines:
  IU ML -100000 → 99.9%
  BCU ML +4000 → 2.4%

Spreads:
  IU +29.5 (-115) → 53.5%
  BCU -29.5 (-105) → 51.2%

Totals:
  Over 148.5 (-110) → 52.4%
  Under 148.5 (-110) → 52.4%
```

### Generate Recommendations
```bash
$ node dist/index.js recommend -d 20251129 --stake 10 --min-legs 2 --max-legs 3 -n 5

🔍 Finding parlays for 20251129...

Found 8 total betting opportunities
Generating parlays (2-3 legs)...

✅ Found 20 positive EV parlay(s)

Top 5 recommendations:

1. Parlay (3 legs)
   Stake: $10.00
   Probability: 14.05%
   Payout: $71.16
   Profit: $61.16
   EV: $0.00
   ROI: 0.0%
   Legs:
     - BCU -29.5 (-105)
     - Over 148.5 (-110)
     - Over 146.5 (-110)
```

## Commands

### `data daily`
Daily incremental data update - fetches new games and updates scores from latest DB date to today.

**Usage:**
```bash
sportline data daily                    # Both CFB and NCAAM
sportline data daily --sports cfb       # CFB only  
sportline data daily --sports ncaam     # NCAAM only
sportline data daily --sports cfb,ncaam # Both (explicit)
```

**What it does:**
- Queries DB for latest game date per sport
- Fetches all games from that date through today
- Updates scores for games that have completed
- Adds new games as they're scheduled
- Updates odds for all games

**Recommended:** Run this once per day before generating recommendations.

### `data ingest`
Full historical data ingestion for a sport/season (first-time setup).

**Options:**
- `--sport <sport>` - Sport: cfb or ncaam (default: ncaam)
- `--season <year>` - Season year (required)
- `--from <date>` - Start date YYYY-MM-DD (optional)
- `--to <date>` - End date YYYY-MM-DD (optional)

### `games`
Fetch games for a specific date (defaults to today if omitted).

**Options:**
- `-d, --date <YYYYMMDD>` - Date in YYYYMMDD format (optional)
- `--sport <sport>` - Sport: cfb or ncaam (default: ncaam)

### `odds`
Import and display odds for a specific event (date defaults to today).

**Options:**
- `-e, --event <eventId>` - ESPN event ID (required)
- `-d, --date <YYYYMMDD>` - Date in YYYYMMDD format (optional)

### `recommend`
Generate and rank parlay recommendations by expected value (date defaults to today).

**Options:**
- `-d, --date <YYYYMMDD>` - Date in YYYYMMDD format (optional)
- `-s, --stake <amount>` - Stake amount per parlay (default: 10)
- `--min-legs <number>` - Minimum legs per parlay (default: 2)
- `--max-legs <number>` - Maximum legs per parlay (default: 4)
- `-n, --top <number>` - Number of top parlays to show (default: 10)

## Architecture

See [PLAN.md](./PLAN.md) for decisions and roadmap.  
See [STATUS.md](./STATUS.md) for step-by-step progress.

## Development

```bash
npm run build   # Compile TypeScript
npm run dev     # Watch mode
npm test        # Run tests
```

## Data Sources

- **ESPN Core API** for NCAAM events, competitions, and odds
- Providers: ESPN BET, DraftKings

## License

MIT
