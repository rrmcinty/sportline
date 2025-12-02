# Optimal Training Configuration Analysis

**Generated:** 2025-12-01

## Overview

Analysis of all model training variations to determine optimal configuration per sport/market combination.

---

## NBA (Pro Basketball)

### Moneyline
**Data Evolution:**
- 2-season (2024-2025): +7.56% ROI, 4.90% ECE ✅ **BEST**
- 3-season (2023-2025): +0.49% ROI, 2.51% ECE ❌ Worse ROI

**Optimal Configuration:**
- **Seasons:** 2024, 2025 (2 seasons)
- **ROI:** +7.56%
- **ECE:** 4.90%
- **Sample:** 349 games
- **Reasoning:** Recent seasons massively outperform when adding 2023 data. Game style/scoring has evolved.

### Spreads
**Data Evolution:**
- 2-season (2024-2025): +11.02% ROI, 6.67% ECE ✅ **BEST** (ONLY PROFITABLE SPREAD MODEL!)
- 3-season (2023-2025): -3.33% ROI, 44.11% ECE ❌ Systematic failure

**Optimal Configuration:**
- **Seasons:** 2024, 2025 (2 seasons)
- **ROI:** +11.02%
- **ECE:** 6.67%
- **Sample:** 268 games
- **Reasoning:** Only profitable spread model across all sports! Historical data breaks calibration.

### Totals
**Data Evolution:**
- 3-season (2023-2025): +2.57% ROI, 0.91% ECE ✅ **BEST** (exceptional calibration)
- 2-season data: Not separately documented

**Optimal Configuration:**
- **Seasons:** 2023, 2024, 2025 (3 seasons)
- **ROI:** +2.57%
- **ECE:** 0.91% (exceptional!)
- **Sample:** 1,657 games
- **Reasoning:** Exceptional calibration with 3 seasons; larger sample improves totals models.

---

## NFL (Pro Football)

### Moneyline
**Data Evolution:**
- 2-season (2024-2025): +5.69% ROI, 6.13% ECE ✅ **BEST**
- 3-season (2023-2025): +5.06% ROI, 3.64% ECE ✅ Better calibration, slightly lower ROI

**Optimal Configuration:**
- **Seasons:** 2024, 2025 (2 seasons) for maximum ROI
- **Alternative:** 2023, 2024, 2025 (3 seasons) for better calibration at cost of -0.63% ROI
- **ROI:** +5.69% (2-season)
- **ECE:** 6.13% (2-season) vs 3.64% (3-season)
- **Sample:** 441 games (2-season) vs 752 games (3-season)
- **Reasoning:** 2-season has higher ROI; 3-season has better calibration. Choose based on priority.

### Spreads
- All configurations unprofitable (-11% to -19% ROI)
- **Recommendation:** ❌ Do not use NFL spreads

### Totals
**Data Evolution:**
- 3-season (2023-2025): +8.19% ROI, 2.41% ECE ✅ **BEST**
- 2-season: -3.76% ROI ❌ Unprofitable

**Optimal Configuration:**
- **Seasons:** 2023, 2024, 2025 (3 seasons) **REQUIRED**
- **ROI:** +8.19%
- **ECE:** 2.41%
- **Sample:** 669 games
- **Reasoning:** MAJOR breakthrough! 2-season was unprofitable; 3-season is highly profitable (+8.19%). Historical data critical for totals.

---

## CFB (College Football)

### Moneyline
**Data Evolution:**
- 2-season (2024-2025): +12.04% ROI, 6.52% ECE ✅ **BEST**
- 3-season (2023-2025): +7.67% ROI, 7.17% ECE ✅ Still good but lower

**Optimal Configuration:**
- **Seasons:** 2024, 2025 (2 seasons)
- **ROI:** +12.04%
- **ECE:** 6.52%
- **Sample:** 1,584 games
- **Reasoning:** +4.37% absolute ROI improvement using recent data only. College football meta changes year-to-year.

### Spreads
- All configurations unprofitable (-4% to -7% ROI)
- **Recommendation:** ❌ Do not use CFB spreads

### Totals
- 3-season: -5.77% ROI, 5.36% ECE ❌ Unprofitable despite decent calibration
- **Recommendation:** ❌ Do not use CFB totals

---

## NCAAM (College Basketball)

### Moneyline
**Data Evolution:**
- 2-season (2024-2025): +3.11% ROI, 11.84% ECE ✅ **BEST** (lower calibration but profitable)
- 3-season (2023-2025): +5.06% ROI, 9.83% ECE ✅ Better ROI and calibration

**Optimal Configuration:**
- **Seasons:** 2023, 2024, 2025 (3 seasons)
- **ROI:** +5.06%
- **ECE:** 9.83%
- **Sample:** 1,818 games
- **Reasoning:** +1.95% absolute ROI improvement with 3 seasons; better calibration; larger sample.

### Spreads
- All configurations unprofitable (~-8% ROI)
- **Recommendation:** ❌ Do not use NCAAM spreads

### Totals
**Data Evolution:**
- 3-season (2023-2025): +13.22% ROI, 4.44% ECE ✅ **BEST** (ELITE!)
- 2-season data: Not separately documented

**Optimal Configuration:**
- **Seasons:** 2023, 2024, 2025 (3 seasons)
- **ROI:** +13.22% (ELITE!)
- **ECE:** 4.44%
- **Sample:** 933 games
- **Reasoning:** Exceptional performance; high divergence picks +28.7% ROI. Best total model across all sports.

---

## NHL (Pro Hockey)

### Moneyline
**Data Evolution:**
- 2-season (2024-2025): +37.83% ROI, 8.44% ECE ✅ **BEST** (same as before recency weighting)
- Note: Only 2-season data available for NHL

**Optimal Configuration:**
- **Seasons:** 2024, 2025 (2 seasons)
- **ROI:** +37.83%
- **ECE:** 8.44%
- **Sample:** 2,335 games
- **Reasoning:** Exceptional ROI; large sample; no 3-season comparison available yet.

---

## Summary: Optimal Training per Sport/Market

| Sport | Market | Optimal Seasons | ROI | ECE | Sample | Key Insight |
|-------|--------|----------------|-----|-----|--------|-------------|
| **NBA** | Moneyline | 2024, 2025 | +7.56% | 4.90% | 349 | Recent > Historical |
| **NBA** | Spread | 2024, 2025 | +11.02% | 6.67% | 268 | ONLY profitable spread! |
| **NBA** | Total | 2023-2025 | +2.57% | 0.91% | 1,657 | Exceptional calibration |
| **NFL** | Moneyline | 2024, 2025 | +5.69% | 6.13% | 441 | Prioritize ROI |
| **NFL** | Total | 2023-2025 | +8.19% | 2.41% | 669 | **3-season REQUIRED** |
| **CFB** | Moneyline | 2024, 2025 | +12.04% | 6.52% | 1,584 | Recent meta critical |
| **NCAAM** | Moneyline | 2023-2025 | +5.06% | 9.83% | 1,818 | More data = better |
| **NCAAM** | Total | 2023-2025 | +13.22% | 4.44% | 933 | **ELITE performance** |
| **NHL** | Moneyline | 2024, 2025 | +37.83% | 8.44% | 2,335 | Exceptional edge |

---

## Key Findings

### When to Use 2 Seasons (Recent Data):
1. **NBA Moneyline & Spreads:** Game style evolution makes old data harmful
2. **NFL Moneyline:** Slight ROI boost (but 3-season has better calibration)
3. **CFB Moneyline:** +4.37% ROI improvement; college meta changes rapidly
4. **NHL:** No 3-season comparison yet

### When to Use 3 Seasons (More Data):
1. **NFL Totals:** CRITICAL - goes from -3.76% to +8.19% ROI
2. **NCAAM Moneyline:** +1.95% ROI improvement and better calibration
3. **NCAAM Totals:** Elite +13.22% ROI
4. **NBA Totals:** Exceptional 0.91% ECE calibration

### Pattern Recognition:
- **College sports (CFB):** Prefer recent data (roster turnover, coaching changes)
- **Totals models:** Generally benefit from more historical data for scoring patterns
- **Moneyline models:** Mixed; depends on sport stability

### Avoid Completely:
- ❌ All NFL spreads (all configs unprofitable)
- ❌ All CFB spreads (all configs unprofitable)
- ❌ All CFB totals (unprofitable)
- ❌ All NCAAM spreads (all configs unprofitable)

---

## Implementation Recommendation

**Update training script to use sport/market-specific optimal seasons:**

```typescript
const OPTIMAL_CONFIGS = {
  nba: {
    moneyline: { seasons: [2024, 2025], reason: 'Recent data critical' },
    spread: { seasons: [2024, 2025], reason: 'Only profitable spread model' },
    total: { seasons: [2023, 2024, 2025], reason: 'Exceptional calibration' }
  },
  nfl: {
    moneyline: { seasons: [2024, 2025], reason: 'Max ROI priority' },
    total: { seasons: [2023, 2024, 2025], reason: '3-season REQUIRED for profitability' }
  },
  cfb: {
    moneyline: { seasons: [2024, 2025], reason: '+4.37% boost vs 3-season' }
  },
  ncaam: {
    moneyline: { seasons: [2023, 2024, 2025], reason: '+1.95% boost vs 2-season' },
    total: { seasons: [2023, 2024, 2025], reason: 'Elite +13.22% ROI' }
  },
  nhl: {
    moneyline: { seasons: [2024, 2025], reason: 'No 3-season comparison yet' }
  }
};
```

This ensures each model trains on its optimal dataset for maximum profitability.
