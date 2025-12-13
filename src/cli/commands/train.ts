// src/cli/commands/train.ts
import { execSync } from 'child_process';
import path from 'path';

module.exports = function train() {
  const TRAIN_SCRIPT = path.join(__dirname, '../../train/basketball/ncaam/trainNcaamMoneyline.ts');
  console.log('Training model...');
  execSync(`node ${TRAIN_SCRIPT}`, { stdio: 'inherit' });
};
    