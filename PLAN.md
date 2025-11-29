# sportline Plan

## Overview
NCAAM betting CLI with parlay EV ranking. Build sport-agnostic infrastructure first, enable NCAAM immediately, add CFB for bowl/playoff season (late December).

## Decisions

### Phase 1: NCAAM (Now – December 2025)
- **Language:** TypeScript/Node
- **Data Source:** ESPN Core API (`sports.core.api.espn.com`)
- **Sports:** NCAAM only
- **Markets:** Moneyline, Spread (ATS), Totals (O/U)
- **Providers:** ESPN BET (priority), DraftKings, others as available
- **Parlay Logic:** Independence assumption (no same-game correlation yet)
- **Caching:** Simple on-disk JSON cache by URL/date
- **CLI:** `sportline games fetch --date`, `game show --event`, `odds import --event`, `parlay eval --legs --stake`

### Phase 2: CFB (Late December 2025)
- Enable `--sport cfb` flag
- Reuse all models/parlay engine
- Focus on bowl games and playoffs

### Phase 3: Future
- Same-game parlay correlation (SGP)
- Player/team props
- Alternative odds APIs (if ESPN BET coverage insufficient)
- Tournament bracket simulator

## Architecture

### Data Flow
1. **Fetch Events:** `src/espn/ncaam/events.ts` pulls list of games for a date
2. **Fetch Competition:** `src/espn/ncaam/competition.ts` gets boxscore/leaders/status
3. **Fetch Odds:** `src/espn/ncaam/odds.ts` gets provider odds (ESPN BET, DK, etc.)
4. **Normalize:** Map to `BetLeg[]` with standardized types (`Moneyline`, `Spread`, `Total`)
5. **Evaluate Parlays:** `src/parlay/eval.ts` computes probability (product of implied probs), payout (product of decimal odds), EV = (payout × probability) - stake
6. **Recommend:** Rank parlays by EV descending

### Models
- `Sport`: `"ncaam" | "cfb"`
- `MarketType`: `"moneyline" | "spread" | "total"`
- `BetLeg`: `{ market, team?, line?, odds, impliedProb }`
- `ParlaySpec`: `{ legs: BetLeg[], stake: number }`
- `ParlayResult`: `{ probability, payout, ev }`

### CLI Commands
```bash
sportline games fetch --sport ncaam --date 2025-11-29
sportline game show --sport ncaam --event 401827111
sportline odds import --sport ncaam --event 401827111
sportline parlay eval --sport ncaam --legs "IU ML,-115" "UK +1.5,-110" --stake 10
sportline recommend --sport ncaam --date 2025-11-29 --stake 10 --min-legs 2 --max-legs 4
```

## Technical Notes
- **ESPN Core API:** Returns $ref links; follow to get full resources
- **Odds Format:** American (e.g., -110, +150) → convert to decimal → implied probability
- **Vig Removal:** ✅ Implemented - removes bookmaker edge to calculate fair probabilities
  - Two-way markets (ML, spread, totals) normalized to sum to 100%
  - Provides accurate EV calculations showing true expected value
  - Example: Spread odds -115/-105 with raw probabilities 53.5%/51.2% (sum 104.7%) becomes 51.1%/48.9% (sum 100%)
- **Rate Limiting:** 1 req/sec default, configurable
- **Cache TTL:** 5 min for live games, 1 hour for final games

## Open Questions
- [ ] Do we need historical data storage (SQLite/Postgres)?
- [ ] Should we scrape additional odds sources or stick with ESPN-provided?
- [x] ~~User preference for vig-free probabilities vs. raw implied?~~ → Vig-free by default (can add flag later)
