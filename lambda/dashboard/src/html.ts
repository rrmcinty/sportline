/**
 * HTML template for dashboard
 * The bundled JS will be injected at build time
 */

export function getHtmlTemplate(appJs: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Sportline Dashboard</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      -webkit-font-smoothing: antialiased;
    }

    .header {
      background: #1a1a1a;
      padding: 1rem;
      border-bottom: 1px solid #333;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .filters {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    select {
      flex: 1;
      padding: 0.5rem;
      background: #2a2a2a;
      border: 1px solid #444;
      color: #e0e0e0;
      border-radius: 0.5rem;
      font-size: 0.9rem;
    }

    button {
      padding: 0.5rem 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: white;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      cursor: pointer;
    }

    button:active {
      opacity: 0.8;
    }

    .meta {
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #999;
      background: #151515;
      border-bottom: 1px solid #222;
    }

    .container {
      padding: 1rem;
    }

    .rec-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 0.75rem;
    }

    .rec-header {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
    }

    .time {
      color: #999;
    }

    .sport {
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 600;
    }

    .sport.nba { background: #c8102e; color: white; }
    .sport.ncaam { background: #003087; color: white; }
    .sport.nhl { background: #000; color: white; }

    .market {
      padding: 0.125rem 0.5rem;
      background: #2a2a2a;
      border-radius: 0.25rem;
      color: #999;
    }

    .best-badge {
      padding: 0.125rem 0.5rem;
      background: #4ade80;
      color: #0a0a0a;
      border-radius: 0.25rem;
      font-weight: 600;
      margin-left: auto;
    }

    .rec-matchup {
      font-size: 1.05rem;
      color: #999;
      margin-bottom: 0.5rem;
    }

    .rec-pick {
      font-size: 1.25rem;
      font-weight: 400;
      margin-bottom: 0.75rem;
    }

    .rec-pick strong {
      font-weight: 700;
      color: #667eea;
    }

    .rec-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }

    .stat {
      text-align: center;
    }

    .stat .label {
      font-size: 0.75rem;
      color: #999;
      margin-bottom: 0.25rem;
    }

    .stat .value {
      font-size: 0.95rem;
      font-weight: 600;
    }

    .edge-high { color: #4ade80; }
    .edge-medium { color: #facc15; }
    .edge-low { color: #60a5fa; }

    .loading, .error, .no-data {
      text-align: center;
      padding: 2rem;
      color: #999;
    }

    .error {
      color: #ef4444;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ Sportline</h1>
    <div class="filters">
      <select id="sport-filter">
        <option value="all">All Sports</option>
        <option value="nba">NBA</option>
        <option value="ncaam">NCAAM</option>
        <option value="nhl">NHL</option>
      </select>
      <select id="market-filter">
        <option value="all">All Markets</option>
        <option value="moneyline">Moneyline</option>
        <option value="spread">Spread</option>
      </select>
      <button id="refresh-btn">↻</button>
    </div>
  </div>
  <div class="meta">
    <span id="last-updated">Loading...</span>
  </div>
  <div class="container">
    <div id="recs-container">
      <div class="loading">Loading recommendations...</div>
    </div>
  </div>
  <script>${appJs}</script>
</body>
</html>`;
}
