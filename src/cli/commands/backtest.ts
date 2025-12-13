// src/cli/commands/backtest.ts
const train = require('./train');

module.exports = function backtest() {
  train();
  console.log('Backtest complete. See recommendations and logs.');
};
