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
  <title>Sportline • Betting Recommendations</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-blue-hover: #79c0ff;
      --success-green: #3fb950;
      --warning-yellow: #d29922;
      --danger-red: #f85149;
      --edge-high: #3fb950;
      --edge-medium: #d29922;
      --edge-low: #58a6ff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Header */
    .header {
      background: var(--bg-secondary);
      padding: 1.25rem 1rem;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(10px);
    }

    .header-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .logo {
      font-size: 1.75rem;
    }

    .last-updated {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* Filter Pills */
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-group {
      display: flex;
      gap: 0.375rem;
      background: var(--bg-tertiary);
      padding: 0.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border-color);
    }

    .filter-pill {
      padding: 0.375rem 0.75rem;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      border-radius: 0.375rem;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .filter-pill:hover {
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .filter-pill.active {
      background: var(--accent-blue);
      color: var(--bg-primary);
      font-weight: 600;
    }

    .filter-pill:active {
      transform: scale(0.97);
    }

    /* Action Buttons */
    .action-btns {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: 0.5rem;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .btn:hover {
      background: var(--bg-secondary);
      border-color: var(--text-muted);
    }

    .btn:active {
      transform: scale(0.97);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: var(--bg-primary);
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--accent-blue-hover);
      border-color: var(--accent-blue-hover);
    }

    .btn-success {
      background: var(--success-green);
      border-color: var(--success-green);
      color: var(--bg-primary);
    }

    .btn-success:hover:not(:disabled) {
      opacity: 0.9;
    }

    /* Container */
    .container {
      padding: 1rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Recommendation Cards */
    .rec-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 1rem;
      transition: all 0.2s ease;
      animation: fadeIn 0.3s ease;
    }

    .rec-card:hover {
      border-color: var(--text-muted);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transform: translateY(-2px);
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .rec-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-color);
    }

    .rec-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .sport-badge {
      padding: 0.25rem 0.625rem;
      border-radius: 0.375rem;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .sport-badge.nba { background: #c8102e; color: white; }
    .sport-badge.ncaam { background: #003087; color: white; }
    .sport-badge.nhl { background: #000; color: white; border: 1px solid var(--border-color); }

    .market-badge {
      padding: 0.25rem 0.625rem;
      background: var(--bg-tertiary);
      border-radius: 0.375rem;
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .rec-time {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .best-badge {
      padding: 0.25rem 0.625rem;
      background: var(--success-green);
      color: var(--bg-primary);
      border-radius: 0.375rem;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .rec-matchup {
      font-size: 1.125rem;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
      font-weight: 400;
    }

    .rec-pick {
      font-size: 1.375rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .rec-pick-icon {
      color: var(--accent-blue);
      font-size: 1.125rem;
    }

    .rec-pick-team {
      color: var(--accent-blue);
    }

    /* Stats Grid */
    .rec-stats-main {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
      border: 1px solid var(--border-color);
    }

    .stat {
      text-align: center;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.375rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-value.edge-high { color: var(--edge-high); }
    .stat-value.edge-medium { color: var(--edge-medium); }
    .stat-value.edge-low { color: var(--edge-low); }

    /* Secondary Stats */
    .rec-stats-secondary {
      display: flex;
      gap: 1.5rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .stat-secondary {
      display: flex;
      gap: 0.375rem;
    }

    .stat-secondary-label {
      color: var(--text-muted);
    }

    .stat-secondary-value {
      font-weight: 600;
    }

    /* Empty/Loading/Error States */
    .empty-state, .loading-state, .error-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .empty-state h3, .error-state h3 {
      font-size: 1.25rem;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }

    .empty-state p, .error-state p {
      font-size: 0.95rem;
    }

    .error-state {
      color: var(--danger-red);
    }

    .error-state h3 {
      color: var(--danger-red);
    }

    /* Loading Skeleton */
    .skeleton {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 1rem;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .skeleton-line {
      height: 1rem;
      background: var(--bg-tertiary);
      border-radius: 0.25rem;
      margin-bottom: 0.75rem;
    }

    .skeleton-line.short {
      width: 40%;
    }

    .skeleton-line.medium {
      width: 60%;
    }

    /* Mobile Adjustments */
    @media (max-width: 640px) {
      .header {
        padding: 1rem 0.75rem;
      }

      .header h1 {
        font-size: 1.25rem;
      }

      .rec-card {
        padding: 1rem;
      }

      .rec-stats-main {
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
        padding: 0.75rem;
      }

      .stat-value {
        font-size: 1.25rem;
      }

      .rec-pick {
        font-size: 1.125rem;
      }
    }

    /* Pull to Refresh Indicator */
    .ptr-indicator {
      text-align: center;
      padding: 1rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      display: none;
    }

    .ptr-indicator.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="ptr-indicator">Release to refresh...</div>

  <div class="header">
    <div class="header-title">
      <h1><span class="logo">⚡</span> Sportline</h1>
      <span class="last-updated" id="last-updated">Loading...</span>
    </div>

    <div class="filters">
      <div class="filter-group">
        <button class="filter-pill active" data-filter="sport" data-value="all">All Sports</button>
        <button class="filter-pill" data-filter="sport" data-value="nba">NBA</button>
        <button class="filter-pill" data-filter="sport" data-value="ncaam">NCAAM</button>
        <button class="filter-pill" data-filter="sport" data-value="nhl">NHL</button>
      </div>

      <div class="filter-group">
        <button class="filter-pill active" data-filter="market" data-value="all">All</button>
        <button class="filter-pill" data-filter="market" data-value="moneyline">ML</button>
        <button class="filter-pill" data-filter="market" data-value="spread">Spread</button>
      </div>
    </div>

    <div class="action-btns">
      <button class="btn btn-primary" id="refresh-btn">
        <span>↻</span>
        <span>Refresh</span>
      </button>
      <button class="btn btn-success" id="update-odds-btn">
        <span>⚡</span>
        <span>Update Odds</span>
      </button>
    </div>
  </div>

  <div class="container">
    <div id="recs-container">
      <div class="loading-state">
        <div class="skeleton">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
        </div>
        <div class="skeleton">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>
    </div>
  </div>

  <script>${appJs}</script>
</body>
</html>`;
}
