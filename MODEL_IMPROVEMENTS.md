To improve the models that need it (especially NCAAM and NFL), here are concrete steps you can take:

1. Increase Data Size & Quality
Gather more historical data: More seasons, more games, and more granular stats.
Incorporate additional data sources: Injury reports, advanced stats, betting splits, weather, travel, etc.
2. Feature Engineering
Recent form: Rolling averages for team stats (last 5/10 games).
Opponent strength: Adjust stats for quality of opposition.
Situational features: Home/away, rest days, back-to-back games, travel distance, rivalry games.
Market features: Closing line value, line movement, consensus odds.
3. Modeling Improvements
Try more advanced models: Gradient boosting (XGBoost, LightGBM), random forests, or neural networks.
Ensemble methods: Combine predictions from multiple models for robustness.
Regularization: Use L1/L2 regularization to prevent overfitting, especially with small datasets (like NFL).
4. Calibration
Platt scaling or isotonic regression: Further calibrate output probabilities.
Reliability diagrams: Routinely check and tune calibration.
5. Cross-Validation & Hyperparameter Tuning
K-fold cross-validation: Especially important for small datasets (NFL).
Grid/random search: Tune model hyperparameters for best performance.
6. Monitor & Retrain
Track model performance over time: Watch for data drift or performance drops.
Retrain regularly: Incorporate new data as seasons progress.
7. Error Analysis
Analyze mispredictions: Look for patterns in games the model gets wrong.
Segment by market: See if the model struggles with certain teams, odds ranges, or game types.
8. Domain-Specific Adjustments
NCAAM: Account for high roster turnover, coaching changes, and conference strength.
NFL: Use injury reports, weather, and player-level data (QBs, key positions).
Summary:

For NCAAM: Focus on richer features, more data, and advanced models/ensembles.
For NFL: Get more data, use regularization, and always report validation metrics.
For all: Keep calibrating, monitoring, and iterating.
If you want, I can help you design new features or set up advanced modeling pipelines for any sport!