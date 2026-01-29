/**
 * Dashboard frontend logic (TypeScript)
 */

import type { Recommendation, RecommendationsData } from './types.js';

class SportlineDashboard {
  private data: RecommendationsData | null = null;
  private filteredRecs: Recommendation[] = [];
  private filters = {
    sport: 'all',
    market: 'all',
    date: 'all', // 'all', 'today', 'tomorrow'
  };

  async init() {
    this.setupEventListeners();
    await this.loadData();
    this.render();
  }

  setupEventListeners() {
    // Filter pill listeners
    document.querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const filterType = target.getAttribute('data-filter');
        const value = target.getAttribute('data-value');

        if (!filterType || !value) return;

        // Update active state
        document.querySelectorAll(`[data-filter="${filterType}"]`).forEach((p) => {
          p.classList.remove('active');
        });
        target.classList.add('active');

        // Update filter
        if (filterType === 'sport') {
          this.filters.sport = value;
        } else if (filterType === 'market') {
          this.filters.market = value;
        } else if (filterType === 'date') {
          this.filters.date = value;
        }

        this.filterAndRender();
      });
    });

    // Refresh button (reload current data)
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.loadData();
    });

    // Update Odds button (trigger Lambda to fetch fresh odds)
    document.getElementById('update-odds-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('update-odds-btn') as HTMLButtonElement;
      if (!btn) return;

      btn.disabled = true;
      const originalContent = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span><span>Updating...</span>';

      try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        if (!response.ok) throw new Error('Failed to trigger update');

        // Wait 3 seconds for Lambda to run, then reload data
        setTimeout(() => {
          this.loadData();
          btn.disabled = false;
          btn.innerHTML = originalContent;
        }, 3000);
      } catch (error) {
        alert(`Failed to update odds: ${error}`);
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    });

    // Pull to refresh
    let startY = 0;
    const ptrIndicator = document.querySelector('.ptr-indicator');

    document.addEventListener('touchstart', (e) => {
      startY = e.touches[0].pageY;
    });

    document.addEventListener('touchmove', (e) => {
      const y = e.touches[0].pageY;
      const pullDistance = y - startY;

      if (window.scrollY === 0 && pullDistance > 50) {
        ptrIndicator?.classList.add('active');
      }
    });

    document.addEventListener('touchend', (e) => {
      const y = e.changedTouches[0].pageY;
      const pullDistance = y - startY;

      if (window.scrollY === 0 && pullDistance > 50) {
        this.loadData();
      }

      setTimeout(() => {
        ptrIndicator?.classList.remove('active');
      }, 300);
    });
  }

  async loadData() {
    const container = document.getElementById('recs-container');
    if (container) {
      container.innerHTML = `
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
      `;
    }

    try {
      const response = await fetch('/api/recs');
      if (!response.ok) throw new Error('Failed to fetch');
      this.data = await response.json();
      this.filterAndRender();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="error-state">
            <h3>Failed to Load</h3>
            <p>Could not load recommendations. Please try again.</p>
            <p style="margin-top: 1rem; font-size: 0.85rem;">${error}</p>
          </div>
        `;
      }
    }
  }

  filterAndRender() {
    if (!this.data) return;

    const now = new Date();
    const todayEST = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowEST = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    this.filteredRecs = this.data.recommendations.filter((rec) => {
      if (this.filters.sport !== 'all' && rec.sport !== this.filters.sport) return false;
      if (this.filters.market !== 'all' && rec.market !== this.filters.market) return false;

      // Date filter
      if (this.filters.date !== 'all') {
        const gameDate = new Date(rec.gameDate);
        const gameDateEST = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (this.filters.date === 'today' && gameDateEST !== todayEST) return false;
        if (this.filters.date === 'tomorrow' && gameDateEST !== tomorrowEST) return false;
      }
      return true;
    });

    // Update filter pills with counts
    const sportCounts = {
      all: this.data.recommendations.length,
      nba: this.data.recommendations.filter((r) => r.sport === 'nba').length,
      ncaam: this.data.recommendations.filter((r) => r.sport === 'ncaam').length,
      nhl: this.data.recommendations.filter((r) => r.sport === 'nhl').length,
    };

    document.querySelectorAll('[data-filter="sport"]').forEach((pill) => {
      const value = pill.getAttribute('data-value');
      const count = sportCounts[value as keyof typeof sportCounts];
      const baseText = pill.textContent?.split(' (')[0] || '';
      pill.textContent = count > 0 ? `${baseText} (${count})` : baseText;
    });

    const dateCounts = {
      all: this.data.recommendations.length,
      today: this.data.recommendations.filter((r) => {
        const gameDate = new Date(r.gameDate);
        const gameDateEST = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return gameDateEST === todayEST;
      }).length,
      tomorrow: this.data.recommendations.filter((r) => {
        const gameDate = new Date(r.gameDate);
        const gameDateEST = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return gameDateEST === tomorrowEST;
      }).length,
    };

    document.querySelectorAll('[data-filter="date"]').forEach((pill) => {
      const value = pill.getAttribute('data-value');
      const count = dateCounts[value as keyof typeof dateCounts];
      const baseText = pill.textContent?.split(' (')[0] || '';
      pill.textContent = count > 0 ? `${baseText} (${count})` : baseText;
    });

    this.render();
  }

  render() {
    const container = document.getElementById('recs-container');
    const timestamp = document.getElementById('last-updated');

    if (!container || !this.data) return;

    if (timestamp) {
      const date = new Date(this.data.generatedAt);
      timestamp.textContent = this.formatRelativeTime(date);
    }

    if (this.filteredRecs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Recommendations</h3>
          <p>No recommendations match your current filters. Try adjusting your filters or check back later.</p>
        </div>
      `;
      return;
    }

    // Add staggered animation delay
    const cards = this.filteredRecs.map((rec, index) => {
      const card = this.renderRec(rec);
      return card.replace(
        '<div class="rec-card"',
        `<div class="rec-card" style="animation-delay: ${index * 0.05}s"`,
      );
    });

    container.innerHTML = cards.join('');
  }

  renderRec(rec: Recommendation): string {
    const gameTime = this.formatGameTime(rec.gameDate);
    const matchup = `${rec.awayTeamName} @ ${rec.homeTeamName}`;
    const marketLabel = rec.market === 'moneyline' ? 'Moneyline' : 'Spread';
    const lineOrOdds =
      rec.line !== null
        ? `${rec.line > 0 ? '+' : ''}${rec.line}`
        : `${rec.odds > 0 ? '+' : ''}${rec.odds}`;

    const edgeClass = rec.edge > 0.1 ? 'edge-high' : rec.edge > 0.06 ? 'edge-medium' : 'edge-low';
    const bucketBadge = this.renderBucketBadge(rec);

    return `
      <div class="rec-card">
        <div class="rec-card-header">
          <div class="rec-meta">
            <span class="sport-badge ${rec.sport}">${rec.sport.toUpperCase()}</span>
            <span class="market-badge">${marketLabel}</span>
          </div>
          <div class="rec-time">${gameTime}</div>
        </div>

        ${bucketBadge ? `<div style="margin-bottom: 0.75rem;">${bucketBadge}</div>` : ''}

        <div class="rec-matchup">${matchup}</div>

        <div class="rec-pick">
          <span class="rec-pick-icon">▸</span>
          <span>BET:</span>
          <span class="rec-pick-team">${rec.pickTeamName}</span>
        </div>

        <div class="rec-stats-main">
          <div class="stat">
            <div class="stat-label">Model</div>
            <div class="stat-value">${(rec.modelProbability * 100).toFixed(1)}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">Edge</div>
            <div class="stat-value ${edgeClass}">+${(rec.edge * 100).toFixed(1)}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">${rec.line !== null ? 'Line' : 'Odds'}</div>
            <div class="stat-value">${lineOrOdds}</div>
          </div>
        </div>

        <div class="rec-stats-secondary">
          <div class="stat-secondary">
            <span class="stat-secondary-label">Implied:</span>
            <span class="stat-secondary-value">${(rec.impliedProbability * 100).toFixed(1)}%</span>
          </div>
          <div class="stat-secondary">
            <span class="stat-secondary-label">EV:</span>
            <span class="stat-secondary-value">+${(rec.ev * 100).toFixed(1)}%</span>
          </div>
          <div class="stat-secondary">
            <span class="stat-secondary-label">Provider:</span>
            <span class="stat-secondary-value">${rec.provider}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderBucketBadge(rec: Recommendation): string {
    if (!rec.bucketInfo) return '';

    const roiPercent = (rec.bucketInfo.roi * 100).toFixed(1);
    const roiClass =
      rec.bucketInfo.roi > 0.2
        ? 'roi-excellent'
        : rec.bucketInfo.roi > 0.1
          ? 'roi-good'
          : rec.bucketInfo.roi > 0
            ? 'roi-positive'
            : 'roi-neutral';

    return `
      <span class="bucket-badge">
        <span class="bucket-range">${rec.bucketInfo.range}</span>
        <span class="bucket-separator">•</span>
        <span class="bucket-roi ${roiClass}">+${roiPercent}%</span>
        <span class="bucket-separator">•</span>
        <span class="bucket-sample">${rec.bucketInfo.sampleSize} bets</span>
      </span>
    `;
  }

  formatGameTime(utcDateStr: string): string {
    const date = new Date(utcDateStr);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    const formatted = date.toLocaleString('en-US', options);
    return formatted.replace(', ', ' ').replace(' PM', 'p').replace(' AM', 'a');
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SportlineDashboard().init();
  });
} else {
  new SportlineDashboard().init();
}
