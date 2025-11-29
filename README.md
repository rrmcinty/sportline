# sportline

NCAAM betting CLI with parlay EV ranking.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Fetch today's games (date defaults to today)
node dist/index.js games

# Show odds for a specific game (date defaults to today)
node dist/index.js odds --event 401827111

# Generate parlay recommendations (date defaults to today)
node dist/index.js recommend --stake 10 --min-legs 2 --max-legs 4 --top 10
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

### `games`
Fetch games for a specific date (defaults to today if omitted).

**Options:**
- `-d, --date <YYYYMMDD>` - Date in YYYYMMDD format (optional)

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
