// src/cli/commands/recommend.ts
const path = require('path');
const fs = require('fs');

module.exports = function recommend() {
  const NCAAM_DIR = path.join(__dirname, '../../train/basketball/ncaam');
  const RECS_JSON = path.join(NCAAM_DIR, 'trainNcaamMoneyline.recommendations.json');
  if (!fs.existsSync(RECS_JSON)) {
    console.error('No recommendations found. Run `train` first.');
    process.exit(1);
  }
  const recs = JSON.parse(fs.readFileSync(RECS_JSON, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const todays = recs.filter(r => r.date && r.date.startsWith(today));
  if (!todays.length) {
    console.log('No games found for today.');
    return;
  }
  todays.sort((a, b) => {
    const aEV = a.recommended_side === 'home' ? a.ev_home : a.ev_away;
    const bEV = b.recommended_side === 'home' ? b.ev_home : b.ev_away;
    return (bEV || 0) - (aEV || 0);
  });
  console.log('Recommended bets for today:');
  console.log('Time       | Home         | Away         | Side | EV    | Odds   | Provider');
  for (const r of todays) {
    const time = r.date.slice(11, 16);
    const home = r.home_team.padEnd(12);
    const away = r.away_team.padEnd(12);
    const side = r.recommended_side ? r.recommended_side.toUpperCase() : '-';
    const ev = (r.recommended_side === 'home' ? r.ev_home : r.ev_away) || 0;
    const odds = (r.recommended_side === 'home' ? r.odds_home : r.odds_away) || '';
    const provider = r.provider || '';
    console.log(`${time} | ${home} | ${away} | ${side} | ${ev.toFixed(3).padStart(5)} | ${odds.toString().padStart(6)} | ${provider}`);
  }
};
