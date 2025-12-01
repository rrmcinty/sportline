## Summary: Totals Model Investigation

### Root Cause Found: Missing 10-Game Features Bug

**The Bug:**
In `src/model/apply.ts` line 256-274, the totals model prediction only mapped **18 features** (5-game window) but the trained model expected **36 features** (both 5-game and 10-game windows). All 10-game features were being set to zero during prediction.

**Impact:**
- Zero-valued features after standardization: `(0 - mean) / std` ≈ -16 (huge negative z-scores)
- Resulted in catastrophically wrong predictions
- NBA: 99%+ predictions on all games (before fix)
- NFL: Systematically inverted predictions

### Fix Applied:
Added all 10-game features to the vecMap in apply.ts (lines 275-292)

### Results After Fix + Retrain:

**NBA Totals** ✅ FIXED
- Calibration Error: 6.56% (excellent! down from 50.18%)
- ROI: -1.84% (down from -6.09%)
- Predictions now distributed across bins properly
- Status: **Well-calibrated but slightly unprofitable**

**NFL Totals** ❌ STILL BROKEN
- Calibration Error: 43.17% (catastrophic)
- ROI: -38.42% (catastrophic)  
- **SYSTEMATIC INVERSION**: When model says 0-10%, actually goes Over 97.4%
- **SYSTEMATIC INVERSION**: When model says 90-100%, actually goes Over 11.9%

### NFL-Specific Issue:
The sigma floor was set to 38 (appropriate for NBA ~230 point totals) but way too high for NFL (~45 point totals). Fixed to be sport-specific (NBA/NCAAM: 38, NFL/CFB: 10).

Even after fixing sigma, NFL totals model is **systematically inverted**.

### Next Steps Needed:
1. Investigate if there's a sign error in NFL predictions
2. Check if the training target variable is correct for NFL
3. May need to examine if NFL has different characteristics requiring different approach
4. Consider if the normal distribution assumption is wrong for NFL totals

**Recommendation:** Keep totals suppressed from recommend command until NFL issue is resolved.
