# Daily Workflow Guide

## Quick Daily Routine

**Every day before checking bets:**

```bash
npm run ingest
```

That's it! This single command:
1. ✅ Checks the latest date in your database for CFB and NCAAM
2. ✅ Fetches all games from that date through today
3. ✅ Updates scores for completed games  
4. ✅ Adds newly scheduled games
5. ✅ Refreshes odds for all games

## Then Use Your Predictions

```bash
# Get recommendations for today
sportline recommend --sport cfb --min-legs 1 --stake 10

# Or check specific games
sportline games --sport ncaam
sportline odds --event 401827111 --sport ncaam
```

## Model Retraining Schedule

Models improve as more data accumulates. Retrain periodically:

### CFB (College Football)
- **Now:** 1,662 games ✅ Models are production-ready
- **Weekly during season:** Retrain every 1-2 weeks to capture recent trends
- **End of season:** Final retrain with full dataset

### NCAAM (Men's Basketball)  
- **Now:** 78 games (season just started) ⚠️ Models work but limited accuracy
- **December:** ~200 games - retrain all models
- **January:** ~400 games - retrain all models  
- **February:** ~600+ games - retrain all models
- **Before March Madness:** Final retrain with full regular season

## Retraining Commands

```bash
# Retrain all CFB models
sportline model train --sport cfb --season 2025 --markets moneyline,spread,total --calibrate none

# Retrain all NCAAM models
sportline model train --sport ncaam --season 2025 --markets moneyline,spread,total --calibrate none
```

**Time estimate:** ~30-60 seconds per sport to retrain all three markets

## Automation (Optional)

### Set up a daily cron job (macOS/Linux):

```bash
# Edit crontab
crontab -e

# Add this line (runs every day at 6 AM):
0 6 * * * cd /path/to/sportline && npm run ingest >> logs/ingest.log 2>&1
```

### Or use a simple shell script:

```bash
#!/bin/bash
# save as: daily_update.sh

cd /path/to/sportline
npm run ingest

# Optionally: retrain models weekly (only on Mondays)
if [ $(date +%u) -eq 1 ]; then
  echo "Monday: Retraining models..."
  sportline model train --sport cfb --season 2025 --markets moneyline,spread,total --calibrate none
  sportline model train --sport ncaam --season 2025 --markets moneyline,spread,total --calibrate none
fi
```

Make it executable:
```bash
chmod +x daily_update.sh
```

## Troubleshooting

### "No new data found"
- Normal if you've already run ingest today
- Database is up to date

### "Errors encountered"
- Usually means ESPN API returned incomplete data for some games
- Non-critical - script continues with available data

### Want to re-fetch specific dates?
Use the full ingest command:
```bash
sportline data ingest --sport cfb --season 2025 --from 2025-11-25 --to 2025-11-29
```

## Data Growth Expectations

### NCAAM (Nov 2025 - Mar 2026)
- **Nov:** ~100 games total
- **Dec:** ~400 games total  
- **Jan:** ~800 games total
- **Feb:** ~1200 games total
- **Mar (regular season end):** ~1500 games total

### CFB (Aug 2025 - Dec 2025)
- **Aug-Sep:** ~300 games
- **Oct:** ~800 games
- **Nov:** ~1400 games
- **Dec (bowl season):** ~1700+ games

**Rule of thumb:** Models become reliable after 300+ completed games with diverse matchups.
