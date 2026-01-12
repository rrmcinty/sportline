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
  };

  async init() {
    this.setupEventListeners();
    await this.loadData();
    this.render();
  }

  setupEventListeners() {
    // Filter listeners
    document.getElementById('sport-filter')?.addEventListener('change', (e) => {
      this.filters.sport = (e.target as HTMLSelectElement).value;
      this.filterAndRender();
    });

    document.getElementById('market-filter')?.addEventListener('change', (e) => {
      this.filters.market = (e.target as HTMLSelectElement).value;
      this.filterAndRender();
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
      btn.textContent = 'Updating...';

      try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        if (!response.ok) throw new Error('Failed to trigger update');

        // Wait 3 seconds for Lambda to run, then reload data
        setTimeout(() => {
          this.loadData();
          btn.disabled = false;
          btn.textContent = 'Update Odds';
        }, 3000);
      } catch (error) {
        alert(`Failed to update odds: ${error}`);
        btn.disabled = false;
        btn.textContent = 'Update Odds';
      }
    });

    // Pull to refresh
    let startY = 0;
    document.addEventListener('touchstart', (e) => {
      startY = e.touches[0].pageY;
    });

    document.addEventListener('touchmove', (e) => {
      const y = e.touches[0].pageY;
      if (window.scrollY === 0 && y > startY + 50) {
        this.loadData();
      }
    });
  }

  async loadData() {
    const container = document.getElementById('recs-container');
    if (container) {
      container.innerHTML = '<div class="loading">Loading...</div>';
    }

    try {
      const response = await fetch('/api/recs');
      if (!response.ok) throw new Error('Failed to fetch');
      this.data = await response.json();
      this.filterAndRender();
    } catch (error) {
      if (container) {
        container.innerHTML = `<div class="error">Failed to load recommendations: ${error}</div>`;
      }
    }
  }

  filterAndRender() {
    if (!this.data) return;

    this.filteredRecs = this.data.recommendations.filter((rec) => {
      if (this.filters.sport !== 'all' && rec.sport !== this.filters.sport) return false;
      if (this.filters.market !== 'all' && rec.market !== this.filters.market) return false;
      return true;
    });

    this.render();
  }

  render() {
    const container = document.getElementById('recs-container');
    const timestamp = document.getElementById('last-updated');

    if (!container || !this.data) return;

    if (timestamp) {
      const date = new Date(this.data.generatedAt);
      timestamp.textContent = `Last updated: ${date.toLocaleString()}`;
    }

    if (this.filteredRecs.length === 0) {
      container.innerHTML = '<div class="no-data">No recommendations matching filters</div>';
      return;
    }

    container.innerHTML = this.filteredRecs.map((rec) => this.renderRec(rec)).join('');
  }

  renderRec(rec: Recommendation): string {
    const gameTime = this.formatGameTime(rec.gameDate);
    const matchup = `${rec.awayTeamName} @ ${rec.homeTeamName}`;
    const market = rec.market === 'moneyline' ? 'ML' : 'SPR';
    const lineOrOdds =
      rec.line !== null
        ? `${rec.line > 0 ? '+' : ''}${rec.line}`
        : `${rec.odds > 0 ? '+' : ''}${rec.odds}`;

    const edgeClass = rec.edge > 0.1 ? 'high' : rec.edge > 0.06 ? 'medium' : 'low';
    const bestBadge = rec.isBest ? '<span class="best-badge">✓ Best</span>' : '';

    return `
      <div class="rec-card">
        <div class="rec-header">
          <span class="time">${gameTime}</span>
          <span class="sport ${rec.sport}">${rec.sport.toUpperCase()}</span>
          <span class="market">${market}</span>
          ${bestBadge}
        </div>
        <div class="rec-matchup">${matchup}</div>
        <div class="rec-pick">Pick: <strong>${rec.pickTeamName}</strong></div>
        <div class="rec-stats">
          <div class="stat">
            <div class="label">Model</div>
            <div class="value">${(rec.modelProbability * 100).toFixed(1)}%</div>
          </div>
          <div class="stat">
            <div class="label">Edge</div>
            <div class="value edge-${edgeClass}">+${(rec.edge * 100).toFixed(1)}%</div>
          </div>
          <div class="stat">
            <div class="label">EV</div>
            <div class="value">+${(rec.ev * 100).toFixed(1)}%</div>
          </div>
          <div class="stat">
            <div class="label">Line/Odds</div>
            <div class="value">${lineOrOdds}</div>
          </div>
        </div>
      </div>
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
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SportlineDashboard().init();
  });
} else {
  new SportlineDashboard().init();
}
