#!/bin/bash
# Model Optimization Script
# Runs autonomous training experiments across NBA, NCAAM, NHL
# Uses 2025 season for training, 2026 for validation
# Expected runtime: 2-3 hours

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$PROJECT_DIR/optimization-results-$TIMESTAMP.log"
SUMMARY_FILE="$PROJECT_DIR/optimization-summary-$TIMESTAMP.txt"

# Change to project directory
cd "$PROJECT_DIR"

# Ensure build is current
echo "Building project..."
npm run build

# Initialize log
echo "=== Model Optimization Started: $(date) ===" | tee "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Training on 2025 season, validating on 2026" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Function to run training experiment
run_train() {
    local sport=$1
    local name=$2
    shift 2
    local args="$@"

    echo "" | tee -a "$LOG_FILE"
    echo "=============================================" | tee -a "$LOG_FILE"
    echo "TRAIN: $sport / $name" | tee -a "$LOG_FILE"
    echo "Command: node dist/cli/index.js train $sport $args" | tee -a "$LOG_FILE"
    echo "Started: $(date)" | tee -a "$LOG_FILE"
    echo "=============================================" | tee -a "$LOG_FILE"

    local start_time=$(date +%s)

    # Run training and capture output
    if node dist/cli/index.js train $sport $args 2>&1 | tee -a "$LOG_FILE"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "Duration: ${duration}s" | tee -a "$LOG_FILE"
        echo "Status: SUCCESS" | tee -a "$LOG_FILE"
    else
        echo "Status: FAILED" | tee -a "$LOG_FILE"
    fi
}

# Function to run backtest with explicit model path
run_backtest() {
    local sport=$1
    local season=$2
    local model_season=$3
    local name=$4
    local market=${5:-moneyline}
    shift 5
    local args="$@"

    local model_path="$PROJECT_DIR/data/models/$sport/$market-$model_season.json"

    echo "" | tee -a "$LOG_FILE"
    echo "---------------------------------------------" | tee -a "$LOG_FILE"
    echo "BACKTEST: $sport / $name (test season $season, model from $model_season)" | tee -a "$LOG_FILE"
    echo "Model: $model_path" | tee -a "$LOG_FILE"
    echo "---------------------------------------------" | tee -a "$LOG_FILE"

    # Run backtest and capture output
    node dist/cli/index.js backtest $sport --season $season --model-path "$model_path" --show-buckets --max-ev 0.50 --market $market $args 2>&1 | tee -a "$LOG_FILE"
}

##############################################
# PHASE 1: NBA MONEYLINE EXPERIMENTS
##############################################

echo "" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"
echo "# PHASE 1: NBA MONEYLINE EXPERIMENTS           #" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"

# Baseline - 2025 season
run_train nba "baseline-2025" --seasons 2025
run_backtest nba 2026 2025 "baseline-2025" moneyline

# Walk-forward CV
run_train nba "walkforward-2025" --seasons 2025 --walk-forward
run_backtest nba 2026 2025 "walkforward-2025" moneyline

# With calibration
run_train nba "calibrated-2025" --seasons 2025 --calibrate
run_backtest nba 2026 2025 "calibrated-2025" moneyline

# Hyperparameter tuning - grid search
run_train nba "tuned-grid-2025" --seasons 2025 --tune grid
run_backtest nba 2026 2025 "tuned-grid-2025" moneyline

# Hyperparameter tuning - random search
run_train nba "tuned-random-2025" --seasons 2025 --tune random --tune-iter 15
run_backtest nba 2026 2025 "tuned-random-2025" moneyline

# Full combo: walk-forward + calibration + tuning
run_train nba "full-2025" --seasons 2025 --walk-forward --calibrate --tune random --tune-iter 10
run_backtest nba 2026 2025 "full-2025" moneyline

##############################################
# PHASE 2: NCAAM MONEYLINE EXPERIMENTS
##############################################

echo "" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"
echo "# PHASE 2: NCAAM MONEYLINE EXPERIMENTS         #" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"

# Baseline - 2025 season only
run_train ncaam "baseline-2025" --seasons 2025 --cv
run_backtest ncaam 2026 2025 "baseline-2025" moneyline

# Temperature calibration
run_train ncaam "temp-cal-2025" --seasons 2025 --calibrate temperature
run_backtest ncaam 2026 2025 "temp-cal-2025" moneyline

# Isotonic calibration
run_train ncaam "isotonic-cal-2025" --seasons 2025 --calibrate isotonic
run_backtest ncaam 2026 2025 "isotonic-cal-2025" moneyline

# Beta calibration
run_train ncaam "beta-cal-2025" --seasons 2025 --calibrate beta
run_backtest ncaam 2026 2025 "beta-cal-2025" moneyline

##############################################
# PHASE 3: NHL MONEYLINE EXPERIMENTS
##############################################

echo "" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"
echo "# PHASE 3: NHL MONEYLINE EXPERIMENTS           #" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"

# Baseline - 2025 season
run_train nhl "baseline-2025" --seasons 2025
run_backtest nhl 2026 2025 "baseline-2025" moneyline

# Walk-forward CV
run_train nhl "walkforward-2025" --seasons 2025 --walk-forward
run_backtest nhl 2026 2025 "walkforward-2025" moneyline

# With calibration
run_train nhl "calibrated-2025" --seasons 2025 --calibrate
run_backtest nhl 2026 2025 "calibrated-2025" moneyline

# Hyperparameter tuning - grid
run_train nhl "tuned-grid-2025" --seasons 2025 --tune grid
run_backtest nhl 2026 2025 "tuned-grid-2025" moneyline

# Hyperparameter tuning - random
run_train nhl "tuned-random-2025" --seasons 2025 --tune random --tune-iter 15
run_backtest nhl 2026 2025 "tuned-random-2025" moneyline

# Full combo
run_train nhl "full-2025" --seasons 2025 --walk-forward --calibrate --tune random --tune-iter 10
run_backtest nhl 2026 2025 "full-2025" moneyline

##############################################
# PHASE 4: SPREAD MODEL EXPERIMENTS
##############################################

echo "" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"
echo "# PHASE 4: SPREAD MODEL EXPERIMENTS            #" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"

# NBA Spread
run_train nba "spread-2025" --market spread --seasons 2025 --calibrate
run_backtest nba 2026 2025 "spread-2025" spread

# NCAAM Spread
run_train ncaam "spread-2025" --market spread --seasons 2025 --calibrate
run_backtest ncaam 2026 2025 "spread-2025" spread

# NHL Spread
run_train nhl "spread-2025" --market spread --seasons 2025 --calibrate
run_backtest nhl 2026 2025 "spread-2025" spread

##############################################
# GENERATE SUMMARY
##############################################

echo "" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"
echo "# OPTIMIZATION COMPLETE                        #" | tee -a "$LOG_FILE"
echo "################################################" | tee -a "$LOG_FILE"

{
    echo "=== MODEL OPTIMIZATION SUMMARY ==="
    echo "Generated: $(date)"
    echo ""
    echo "Training: 2025 season"
    echo "Validation: 2026 season"
    echo ""
    echo "Review the log file for detailed results:"
    echo "  $LOG_FILE"
    echo ""
    echo "To find ROI results:"
    echo "  grep -E 'ROI|Expected' $LOG_FILE"
    echo ""
} | tee "$SUMMARY_FILE" | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== Optimization Completed: $(date) ===" | tee -a "$LOG_FILE"
echo "Summary saved to: $SUMMARY_FILE" | tee -a "$LOG_FILE"
