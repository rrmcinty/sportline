# Underdog Analysis by Sport

## Summary

Analysis of underdog moneyline bets across all supported sports to identify profitable patterns and home/away preferences.

**Key Finding:** Each sport has unique underdog dynamics. Some favor home underdogs, others favor away underdogs.

---

## Profitable Sports

### NFL: Home Underdogs Win More
- **Odds Range:** +100 to +149
- **ROI:** +6.71%
- **Overall Win Rate:** 47.3%
- **Home Underdog Win Rate:** 47.8%
- **Away Underdog Win Rate:** 41.1%
- **Recommendation:** ✅ Show indicator for HOME underdogs only

### NBA: Away Underdogs Win More
- **Odds Range:** +100 to +149
- **ROI:** +5.27%
- **Overall Win Rate:** 46.8%
- **Home Underdog Win Rate:** Not favorable
- **Away Underdog Win Rate:** 54.4% ⭐
- **Recommendation:** ✅ Show indicator for AWAY underdogs only

### CFB: Away Underdogs Win More
- **Odds Range:** +100 to +149
- **ROI:** +4.90%
- **Overall Win Rate:** 46.8%
- **Home Underdog Win Rate:** Not favorable
- **Away Underdog Win Rate:** 58.9% ⭐
- **Recommendation:** ✅ Show indicator for AWAY underdogs only

---

## Unprofitable Sports

### NCAAM: Not Profitable
- **Odds Range:** +100 to +149
- **ROI:** -7.55% ❌
- **Overall Win Rate:** 41.0%
- **Home Underdog Win Rate:** 47.8%
- **Away Underdog Win Rate:** Not enough to overcome juice
- **Recommendation:** ❌ Do NOT show indicator (negative ROI)

### NHL: Not Profitable
- **Odds Range:** +150 to +199 (wider range tested)
- **ROI:** -0.12% ❌
- **Overall Win Rate:** 37.3%
- **Away Underdog Win Rate:** 77.8% (but still unprofitable overall)
- **Recommendation:** ❌ Do NOT show indicator (negative ROI)

---

## Implementation

### Code Location
File: `src/cli/commands.ts`

### Constants
```typescript
const UNDERDOG_ROI_BY_SPORT: Record<string, { roi: number; bucket: string }> = {
  nfl: { roi: 6.71, bucket: "+100 to +149" },
  nba: { roi: 5.27, bucket: "+100 to +149" },
  cfb: { roi: 4.90, bucket: "+100 to +149" }
  // NCAAM: -7.55% ROI (unprofitable)
  // NHL: -0.12% ROI (unprofitable)
};
```

### Logic
```typescript
// Sport-specific home/away checking
if (sport === 'nfl') {
  // NFL prefers home underdogs (47.8% vs 41.1%)
  if (isHomeUnderdog && odds >= 100 && odds <= 149) {
    matchesOptimalProfile = true;
  }
} else if (sport === 'nba') {
  // NBA prefers away underdogs (54.4% win rate)
  if (!isHomeUnderdog && odds >= 100 && odds <= 149) {
    matchesOptimalProfile = true;
  }
} else if (sport === 'cfb') {
  // CFB prefers away underdogs (58.9% win rate)
  if (!isHomeUnderdog && odds >= 100 && odds <= 149) {
    matchesOptimalProfile = true;
  }
}
```

### Indicators
- 🐶 = Underdog with optimal profile for that sport
- NFL example: `NYJ +130 🐶` (home underdog)
- NBA example: `LAL +140 🐶` (away underdog at GSW)
- CFB example: `MICH +135 🐶` (away underdog at IOWA)

---

## Testing

Test file: `test-nfl-spread-integration.ts`

All tests passing:
- ✅ NFL home underdogs show indicator
- ✅ NFL away underdogs do NOT show indicator
- ✅ NBA away underdogs show indicator
- ✅ NBA home underdogs do NOT show indicator
- ✅ CFB away underdogs show indicator
- ✅ CFB home underdogs do NOT show indicator
- ✅ NCAAM underdogs do NOT show indicator (negative ROI)
- ✅ NHL underdogs do NOT show indicator (negative ROI)

---

## Notes

1. **Why different patterns?**
   - NFL: Strong home field advantage, home dogs benefit from point spread compression
   - NBA/CFB: Road underdogs often undervalued, favorable scheduling dynamics
   - NCAAM: Too much variance, conference strength matters more than home/away
   - NHL: Goaltending variance too high, no clear profitable pattern

2. **Future improvements:**
   - Could add conference strength filters for NCAAM to make it profitable
   - Could test different odds ranges for NHL
   - Could add recent form filters (dogs on winning streaks)

3. **Do NOT:**
   - Apply generic "all home dogs are good" logic across sports
   - Show indicators for NCAAM/NHL (negative ROI)
   - Use complex profile matching without sport-specific data
