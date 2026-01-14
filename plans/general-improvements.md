# General Sports Betting System Improvements

**Created:** 2026-01-14
**Purpose:** Cross-sport improvements that benefit all models (NHL, NBA, NCAAM)
**Context:** Learnings from NHL optimization can be applied to improve the entire system

---

## Current System State

**Working Models:**
- ✅ **NHL Moneyline:** +21.02% ROI (optimized via bucket filtering)

**Broken Models:**
- ❌ **NBA Moneyline:** -13.23% ROI (needs feature engineering)
- ❌ **NBA Spread:** -9.38% ROI
- ❌ **NCAAM Moneyline:** -7.95% ROI
- ❌ **NCAAM Spread:** -9.18% ROI
- ❌ **NHL Spread:** -35.40% ROI

**System-Level Issues:**
- Manual threshold tuning required per sport
- No automated bucket optimization
- Flat bet sizing ($100 per bet)
- Single odds source (ESPN only)
- No injury tracking
- No live betting capability

---

## Priority 1: Automated Bucket Optimization 🔥

**Effort:** Medium (3-4 hours)
**Expected Impact:** Can optimize any profitable model
**Risk:** Low

### Why This Matters

Manual bucket testing found +7.62pp improvement for NHL. Automate this:
- **Test all bucket combinations** (50-60%, 60-70%, 70-80%, combinations)
- **Find optimal bucket automatically** based on validation ROI
- **Apply to any sport** without manual experimentation

### Implementation Steps

1. **Create bucket optimizer**
   ```typescript
   // src/lib/optimization/bucketOptimizer.ts
   export async function optimizeBuckets(
     sport: string,
     market: string,
     trainSeason: number,
     testSeason: number
   ): Promise<BucketConfig> {
     const candidates = [
       ['50-60'],
       ['60-70'],
       ['70-80'],
       ['60-80'],  // Current NHL winner
       ['65-80'],
       ['70-90'],
     ];

     let bestROI = -Infinity;
     let bestBuckets = [];

     for (const buckets of candidates) {
       const result = await backtest(sport, market, testSeason, { buckets });
       if (result.roi > bestROI) {
         bestROI = result.roi;
         bestBuckets = buckets;
       }
     }

     return { buckets: bestBuckets, roi: bestROI };
   }
   ```

2. **Add CLI command**
   ```bash
   node dist/cli/index.js optimize-buckets nhl --season 2025 --market moneyline
   # Output: Best buckets: 60-80 (ROI: +21.02%)
   ```

3. **Auto-update config**
   ```typescript
   // Optionally write to optimalBuckets.ts
   await updateOptimalBucketsConfig(sport, market, bestBuckets);
   ```

### Success Criteria
- [ ] Finds 60-80% bucket for NHL automatically
- [ ] Can optimize NBA, NCAAM buckets if they become profitable
- [ ] Runs in <10 minutes per sport/market

---

## Priority 2: Universal Kelly Criterion 💰

**Effort:** Medium (3-4 hours)
**Expected Impact:** +2-4pp ROI across all profitable models
**Risk:** Low

### Why This Matters

Currently all models use flat $100 bets. Kelly criterion optimizes:
- **Bet more on high-edge opportunities**
- **Bet less on low-edge opportunities**
- **Maximizes long-term growth rate**

### Implementation Steps

1. **Create Kelly bet sizing module**
   ```typescript
   // src/betting/kelly.ts
   export function calculateKellyBet(
     probability: number,
     americanOdds: number,
     bankroll: number,
     fractionalKelly: number = 0.25  // Conservative
   ): number {
     const decimalOdds = americanToDecimal(americanOdds);
     const q = 1 - probability;  // Probability of loss
     const b = decimalOdds - 1;  // Net odds

     // Kelly formula: f = (bp - q) / b
     const kellyFraction = (b * probability - q) / b;

     // Apply fractional Kelly for safety
     const adjustedFraction = Math.max(0, kellyFraction * fractionalKelly);

     // Cap at 5% of bankroll (safety limit)
     return Math.min(adjustedFraction * bankroll, bankroll * 0.05);
   }
   ```

2. **Add to backtest**
   ```typescript
   // src/lib/backtest/backtester.ts
   const betSize = betSizing === 'kelly'
     ? calculateKellyBet(prediction, odds, currentBankroll)
     : 100;  // Flat bet
   ```

3. **Add CLI flag**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --bet-sizing kelly --starting-bankroll 10000
   ```

4. **Compare strategies**
   ```bash
   # Flat betting
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing flat

   # Kelly betting
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing kelly
   ```

### Success Criteria
- [ ] Kelly outperforms flat betting by 2%+ ROI
- [ ] Kelly doesn't increase drawdown excessively
- [ ] Largest bet stays under 5% of bankroll
- [ ] Works across all sports

---

## Priority 3: Multi-Book Odds Shopping 📊

**Effort:** High (8-12 hours)
**Expected Impact:** +3-5pp ROI across all models
**Risk:** Medium (API costs, rate limits)

### Why This Matters

Currently using ESPN odds only. Different sportsbooks offer different lines:
- **DraftKings** may have better home favorite odds
- **FanDuel** may have better underdog odds
- **BetMGM** may have better totals
- **Shopping saves 3-5pp ROI** on average

### Implementation Steps

1. **Sign up for The Odds API**
   - https://the-odds-api.com/
   - Paid tier: $25/month for 10,000 requests
   - Covers NHL, NBA, NCAAM

2. **Create odds aggregator**
   ```typescript
   // src/odds/oddsAggregator.ts
   export async function getBestOddsForGame(
     sport: string,
     gameId: string
   ): Promise<BestOdds> {
     const allBooks = await fetchFromOddsApi(sport, gameId);

     return {
       homeMoneyline: findBestOdds(allBooks, 'home', 'moneyline'),
       awayMoneyline: findBestOdds(allBooks, 'away', 'moneyline'),
       homeSpread: findBestOdds(allBooks, 'home', 'spread'),
       awaySpread: findBestOdds(allBooks, 'away', 'spread'),
       books: {
         homeML: 'DraftKings',
         awayML: 'FanDuel',
       }
     };
   }
   ```

3. **Update recommendation logic**
   ```typescript
   // src/recommend/recommend.ts
   const bestOdds = await getBestOddsForGame(sport, game.id);
   const edge = calculateEdge(prediction, bestOdds);

   if (edge > minEdge) {
     recommendations.push({
       ...game,
       odds: bestOdds,
       edge,
       book: bestOdds.books[market],
       shoppingBenefit: bestOdds.odds - espnOdds.odds
     });
   }
   ```

4. **Track shopping benefit**
   ```typescript
   console.log(`Odds shopping benefit: +${avgShoppingBenefit.toFixed(2)}% per bet`);
   ```

### Success Criteria
- [ ] Average edge improvement +1-2% per bet
- [ ] ROI improvement +3-5pp on historical backtest
- [ ] API costs justified by ROI gains (<$25/month budget)
- [ ] Works for NHL, NBA, NCAAM

---

## Priority 4: Injury Tracking System 🏥

**Effort:** High (12-16 hours)
**Expected Impact:** +5-8pp ROI for NBA, +1-2pp for NHL
**Risk:** High (data source reliability, complexity)

### Why This Matters

Injuries significantly impact game outcomes, especially in NBA:
- **Star player out** → Team win probability drops 10-20%
- **Multiple injuries** → Compounding effect
- **Backup quality** → Some teams have good depth, others don't

### Implementation Steps

1. **Choose data source**
   - Option A: ESPN Injury API (free, may be unreliable)
   - Option B: RotoWire API (paid, $10-50/month)
   - Option C: Scrape from injury report websites

2. **Create injury database**
   ```sql
   -- src/db/schema.sql
   CREATE TABLE IF NOT EXISTS injuries (
     id INTEGER PRIMARY KEY,
     team_id TEXT NOT NULL,
     sport TEXT NOT NULL,
     player_name TEXT NOT NULL,
     injury_status TEXT NOT NULL,  -- out, doubtful, questionable, probable
     position TEXT,
     avg_minutes_per_game REAL,
     avg_points_per_game REAL,
     date_added TEXT NOT NULL,
     date_updated TEXT NOT NULL,
     FOREIGN KEY (team_id, sport) REFERENCES teams(id, sport)
   );
   ```

3. **Add injury features**
   ```typescript
   // src/models/injuryFeatures.ts
   export function extractInjuryFeatures(
     db: Database,
     homeTeamId: string,
     awayTeamId: string,
     gameDate: string
   ): InjuryFeatures {
     const homeInjuries = getActiveInjuries(db, homeTeamId, gameDate);
     const awayInjuries = getActiveInjuries(db, awayTeamId, gameDate);

     return {
       homeTotalMinutesOut: sumMinutes(homeInjuries),
       awayTotalMinutesOut: sumMinutes(awayInjuries),
       homeStarsOut: countStars(homeInjuries),  // >25 mpg
       awayStarsOut: countStars(awayInjuries),
       homeInjuryCount: homeInjuries.length,
       awayInjuryCount: awayInjuries.length,
     };
   }
   ```

4. **Integrate into models**
   ```typescript
   // src/models/features.ts
   const injuryFeatures = extractInjuryFeatures(db, homeId, awayId, date);
   features.push(...injuryFeatures);
   ```

### Success Criteria
- [ ] NBA ROI improves by +5pp (from -13% to -8%)
- [ ] Injury features appear in top 10 importance
- [ ] Data source is reliable (>90% accuracy)
- [ ] Updates daily without manual intervention

---

## Priority 5: Automated Model Retraining 🤖

**Effort:** Medium (4-6 hours)
**Expected Impact:** Maintains performance as seasons progress
**Risk:** Low

### Why This Matters

Models degrade over time as:
- **Roster changes** (trades, injuries, lineup changes)
- **Strategy changes** (coaching adjustments)
- **Meta shifts** (league-wide playing style evolution)

### Implementation Steps

1. **Create retraining scheduler**
   ```typescript
   // src/lib/retraining/scheduler.ts
   export async function checkIfRetrainingNeeded(
     sport: string,
     market: string
   ): Promise<boolean> {
     const lastTraining = getLastTrainingDate(sport, market);
     const daysSince = daysBetween(lastTraining, new Date());

     // Retrain every 30 days during season
     if (daysSince > 30) return true;

     // Retrain if performance degrades >5pp
     const recentROI = getRecentROI(sport, market, 50);  // Last 50 bets
     const expectedROI = getBaselineROI(sport, market);
     if (recentROI < expectedROI - 5) return true;

     return false;
   }
   ```

2. **Add to Lambda update function**
   ```typescript
   // lambda/update/src/index.ts
   if (await checkIfRetrainingNeeded('nhl', 'moneyline')) {
     console.log('Triggering model retraining...');
     await triggerRetraining('nhl', 'moneyline');
   }
   ```

3. **Add CLI command**
   ```bash
   node dist/cli/index.js retrain-if-needed --all
   # Checks all models, retrains if degraded
   ```

### Success Criteria
- [ ] Detects performance degradation automatically
- [ ] Retrains without manual intervention
- [ ] New model maintains baseline performance
- [ ] Notification sent when retraining occurs

---

## Priority 6: Live Betting Foundation 📱

**Effort:** Very High (20+ hours)
**Expected Impact:** New revenue stream (unknown ROI)
**Risk:** Very High (complex, real-time requirements)

### Why This Matters

Pre-game betting is one market. Live betting opens another:
- **In-game probability updates** based on score, time, momentum
- **Higher volume** (multiple betting opportunities per game)
- **Less efficient markets** (bookmakers slower to adjust)

### Implementation Steps (High-Level)

1. **Real-time data ingestion**
   - WebSocket connection to ESPN live scores
   - Update game state every 10-30 seconds
   - Track score, time remaining, recent scoring runs

2. **Live probability model**
   - Train on historical in-game scenarios
   - Input: Current score, time left, possession, momentum
   - Output: Updated win probability

3. **Live recommendation engine**
   - Compare live model to live odds
   - Generate alerts when edge exceeds threshold
   - Send notifications via Telegram/Discord

4. **Backtesting on historical live data**
   - Simulate in-game betting decisions
   - Calculate ROI vs pre-game only strategy

### Success Criteria
- [ ] Live model accuracy > 55%
- [ ] Live betting ROI > Pre-game ROI
- [ ] Latency < 30 seconds (fast enough to act)
- [ ] Notification system works reliably

**Note:** This is a future project, not near-term priority.

---

## Priority 7: Dashboard Improvements 📊

**Effort:** Low (2-3 hours)
**Expected Impact:** Better user experience, no direct ROI impact
**Risk:** Very Low

### Why This Matters

Current dashboard shows recommendations but could be enhanced:
- **Historical performance tracking**
- **Bankroll growth visualization**
- **Win/loss streak tracking**
- **Model confidence indicators**

### Implementation Steps

1. **Add performance tracking**
   ```typescript
   // lambda/dashboard/src/performance.ts
   export function getSeasonPerformance(
     sport: string,
     season: number
   ): Performance {
     return {
       roi: calculateROI(bets),
       winRate: calculateWinRate(bets),
       profit: calculateProfit(bets),
       bankrollGrowth: calculateGrowth(bets),
       largestWin: findLargestWin(bets),
       largestLoss: findLargestLoss(bets),
       currentStreak: calculateStreak(bets),
     };
   }
   ```

2. **Add to dashboard**
   ```html
   <!-- lambda/dashboard/src/html.ts -->
   <div class="performance-card">
     <h3>NHL Moneyline Performance</h3>
     <div class="metric">ROI: +21.02%</div>
     <div class="metric">Win Rate: 61.56%</div>
     <div class="metric">Profit: $7,546</div>
     <div class="metric">Current Streak: 5W</div>
   </div>
   ```

3. **Add historical chart**
   ```typescript
   // Use Chart.js or similar
   const bankrollChart = new Chart(ctx, {
     type: 'line',
     data: {
       labels: dates,
       datasets: [{
         label: 'Bankroll Growth',
         data: bankrollOverTime
       }]
     }
   });
   ```

### Success Criteria
- [ ] Dashboard shows real-time performance metrics
- [ ] Historical charts visualize growth
- [ ] Mobile-friendly and fast (<2s load)

---

## Priority 8: Model Explainability 🔍

**Effort:** Medium (4-6 hours)
**Expected Impact:** Better understanding, easier debugging
**Risk:** Low

### Why This Matters

Current models are "black boxes":
- **Don't know why model picks certain games**
- **Hard to debug when model fails**
- **Can't explain to users**

### Implementation Steps

1. **Add SHAP (SHapley Additive exPlanations)**
   ```bash
   npm install shap
   ```

2. **Generate explanations**
   ```typescript
   // src/models/explainer.ts
   export function explainPrediction(
     model: Model,
     features: number[]
   ): Explanation {
     const shapValues = calculateShap(model, features);

     return {
       prediction: model.predict(features),
       topFeatures: getTopFeatures(shapValues, 5),
       reasoning: generateReasoning(shapValues)
     };
   }
   ```

3. **Add to recommendations**
   ```typescript
   recommendations.push({
     ...game,
     edge: 12.5,
     explanation: {
       topReasons: [
         'Home team on 5-game win streak (+8% impact)',
         'Away team on back-to-back (-5% impact)',
         'Home goalie has .935 save% vs opponent (+4% impact)'
       ]
     }
   });
   ```

### Success Criteria
- [ ] Every recommendation includes top 3 reasons
- [ ] Explanations make intuitive sense
- [ ] Helps identify when model is "guessing" vs confident

---

## Testing Protocol (Universal)

**For any system-level change:**

1. **Test on NHL first** (only profitable model)
   ```bash
   # Before change
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   # Note baseline ROI: +21.02%

   # After change
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" [new-flags] --show-buckets
   # Confirm ROI maintained or improved
   ```

2. **Test on NBA/NCAAM if applicable**
   ```bash
   # Check if change improves unprofitable models
   node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets
   ```

3. **Verify across multiple seasons**
   ```bash
   # Test 2024 to ensure generalization
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline \
     --buckets "60-80" [new-flags] --show-buckets
   ```

4. **Document in appropriate registry**
   ```
   If NHL-specific: data/experiments-nhl-moneyline.md
   If NBA-specific: data/experiments-nba-moneyline.md
   If system-wide: data/experiments-system.md (create if needed)
   ```

---

## Success Criteria (System-Wide)

**Automated Optimization:**
- [ ] Bucket optimization runs automatically
- [ ] Finds optimal buckets for any sport
- [ ] Results match manual testing

**Kelly Criterion:**
- [ ] Improves ROI by 2%+ across all profitable models
- [ ] Works with configurable fractional Kelly
- [ ] Caps bets at 5% of bankroll

**Odds Shopping:**
- [ ] Improves average edge by 1-2% per bet
- [ ] Covers NHL, NBA, NCAAM
- [ ] API costs justified (<$25/month)

**Injury Tracking:**
- [ ] Data source reliable (>90% accuracy)
- [ ] Improves NBA ROI by 5%+
- [ ] Updates daily automatically

**Retraining:**
- [ ] Detects degradation automatically
- [ ] Retrains without manual intervention
- [ ] Maintains baseline performance

---

## Priority Matrix

| Priority | Feature | Effort | Impact | Applies To | Order |
|----------|---------|--------|--------|------------|-------|
| 🔥🔥🔥 | Bucket optimizer | Medium | High | All | 1st |
| 🔥🔥 | Kelly criterion | Medium | High | All profitable | 2nd |
| 💰 | Odds shopping | High | High | All | 3rd |
| 🏥 | Injury tracking | Very High | Very High (NBA) | NBA/NHL | 4th |
| 🤖 | Auto-retraining | Medium | Medium | All | 5th |
| 📱 | Live betting | Very High | Unknown | All | 6th |
| 📊 | Dashboard | Low | Low | User experience | 7th |
| 🔍 | Explainability | Medium | Low | Debugging | 8th |

**Recommended Order:**
1. Bucket optimizer (helps all future optimization)
2. Kelly criterion (immediate ROI boost)
3. Odds shopping (significant ROI boost, worth the effort)
4. Injury tracking (critical for NBA profitability)

---

## Estimated ROI Impact

| Improvement | NHL Impact | NBA Impact | System-Wide |
|-------------|------------|------------|-------------|
| Bucket optimizer | +0% (already done) | +3-5pp (if profitable) | Enables optimization |
| Kelly criterion | +2-4pp | +2-4pp | +2-4pp all models |
| Odds shopping | +3-5pp | +3-5pp | +3-5pp all models |
| Injury tracking | +1-2pp | +5-8pp | Sport-dependent |
| **Cumulative** | **+6-11pp** | **+13-22pp** | **+8-15pp avg** |

**Realistic NHL Target:** +27-32% ROI (from current +21%)
**Realistic NBA Target:** +0 to +9% ROI (from current -13%)

---

## Resources

**External APIs:**
- The Odds API: https://the-odds-api.com/
- RotoWire Injuries: https://www.rotowire.com/
- ESPN APIs: (already integrated)

**Libraries to Consider:**
- SHAP for explainability: https://github.com/slundberg/shap
- Chart.js for dashboard: https://www.chartjs.org/
- WebSockets for live data: `ws` npm package

**Documentation:**
- `CLAUDE.md` - Main project instructions
- `data/experiments-*-moneyline.md` - Experiment registries
- Plans folder - Sport-specific optimization plans

---

## Key Learnings

### From NHL Optimization
1. **Simple often beats complex** - Bucket filtering > hyperparameter tuning
2. **Validate on multiple seasons** - Prevents false positives
3. **Not all optimization helps** - Calibration/hyperparameters were wasted effort
4. **Document everything** - Future self will thank you

### From NBA Failures
1. **Missing features hurt more than model choice** - Injuries critical for NBA
2. **Season-to-season consistency matters** - NBA has high roster volatility
3. **Can't optimize your way out of bad data** - Need better features first

### From NCAAM Failures
1. **Some sports are harder** - NCAAM has 350+ teams, huge talent disparity
2. **More data doesn't always help** - Multi-season training made it worse
3. **Line movement features are critical** - Removing them caused catastrophic failure

---

**Last Updated:** 2026-01-14
**Next Review:** After deploying NHL bucket filtering and testing Kelly criterion
