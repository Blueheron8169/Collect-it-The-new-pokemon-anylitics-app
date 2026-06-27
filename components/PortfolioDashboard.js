'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '../lib/cardUtils';

export default function PortfolioDashboard({ cards, totalNetWorth, totalCostBasis = 0, onRemoveCard, getDealUrl }) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedInsights, setSelectedInsights] = useState(null);
  const [selectedForecast, setSelectedForecast] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const historySeries = cards.length ? cards.map((card) => Number(card.estimatedValue || 0)) : [0];
  const chartHeight = 120;
  const max = Math.max(...historySeries, 1);
  const points = historySeries.map((value, index) => {
    const x = historySeries.length === 1 ? 50 : (index / (historySeries.length - 1)) * 100;
    const y = 100 - (value / max) * 80;
    return `${x},${y}`;
  });

  const estimatedProfit = totalNetWorth - totalCostBasis;

  const setTotals = useMemo(() => {
    const bucket = new Map();
    cards.forEach((card) => {
      const setName = card.setName || 'Unknown set';
      const value = Number(card.estimatedValue || 0) * Number(card.quantity || 1);
      bucket.set(setName, (bucket.get(setName) || 0) + value);
    });
    return [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [cards]);

  const topPositions = useMemo(() => {
    return cards
      .map((card) => {
        const qty = Number(card.quantity || 1);
        const totalValue = Number(card.estimatedValue || 0) * qty;
        const totalCost = Number(card.purchasePrice || 0) * qty;
        return {
          key: card.id || `${card.cardName}-${card.cardNumber}`,
          name: card.cardName || 'Pokemon card',
          number: card.cardNumber || '',
          totalValue,
          totalCost,
          gain: totalValue - totalCost,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 6);
  }, [cards]);

  const maxSetTotal = Math.max(...setTotals.map((entry) => entry[1]), 1);

  async function openCardDetail(card) {
    setSelectedCard(card);
    setSelectedInsights(null);
    setSelectedForecast(null);
    setDetailsLoading(true);

    try {
      const query = `${card.cardName || ''} ${card.cardNumber || ''}`.trim();
      const response = await fetch('/api/pokewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query }),
      });
      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];

      const series = results
        .filter((item) => Number(item.priceValue || 0) > 0)
        .sort((a, b) => new Date(a.releaseDate || 0).getTime() - new Date(b.releaseDate || 0).getTime())
        .slice(-12)
        .map((item) => ({
          label: item.releaseDate || item.set,
          value: Number(item.priceValue || 0),
          timestamp: item.releaseDate || '',
          set: item.set,
        }));

      const marketPoints = results[0]?.marketPoints || [];
      const marketRange = marketPoints.length
        ? {
            low: Math.min(...marketPoints.map((point) => Number(point.value || 0))),
            high: Math.max(...marketPoints.map((point) => Number(point.value || 0))),
          }
        : { low: 0, high: 0 };

      setSelectedInsights({
        liveMatches: results.length,
        marketEstimate: Number(data.marketEstimate || 0),
        marketPoints,
        marketRange,
        series,
      });

      const forecastRes = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardName: card.cardName,
          cardNumber: card.cardNumber,
          setName: card.setName,
          series,
          marketPoints,
        }),
      });
      const forecastData = await forecastRes.json();
      if (forecastRes.ok) {
        setSelectedForecast(forecastData);
      }
    } catch {
      setSelectedInsights({
        liveMatches: 0,
        marketEstimate: Number(card.estimatedValue || 0),
        marketPoints: [],
        marketRange: { low: 0, high: 0 },
        series: [],
      });
      setSelectedForecast({
        direction: 'up',
        confidence: 52,
        summary: 'Live forecast data is unavailable right now. Try again in a moment.',
        source: 'fallback',
      });
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <div className="dashboard-card">
      <h2>Portfolio dashboard</h2>
      <div className="stats-grid">
        <div className="stat-box">
          <strong>Collection value</strong>
          <div>{formatCurrency(totalNetWorth)}</div>
        </div>
        <div className="stat-box">
          <strong>Cost basis</strong>
          <div>{formatCurrency(totalCostBasis)}</div>
        </div>
      </div>

      <div className="stat-box" style={{ marginBottom: 16 }}>
        <strong>Estimated gain/loss</strong>
        <div style={{ color: estimatedProfit >= 0 ? '#047857' : '#be123c' }}>{formatCurrency(estimatedProfit)}</div>
      </div>

      <div className="chart-box">
        <strong>Value trend (latest cards)</strong>
        <svg viewBox="0 0 100 100" width="100%" height={chartHeight}>
          <polyline fill="none" stroke="#4b78ff" strokeWidth="2" points={points.join(' ')} />
        </svg>
        <p className="muted-text" style={{ marginBottom: 0 }}>Trend line updates as cards are added to your binder.</p>
      </div>

      <div className="chart-box">
        <strong>Top sets by value</strong>
        {setTotals.length ? (
          <div className="set-bars">
            {setTotals.map(([setName, value]) => (
              <div className="set-bar-row" key={setName}>
                <span>{setName}</span>
                <div className="set-bar-track">
                  <div className="set-bar-fill" style={{ width: `${Math.max(8, (value / maxSetTotal) * 100)}%` }} />
                </div>
                <strong>{formatCurrency(value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-text" style={{ marginBottom: 0 }}>Add cards to populate this chart.</p>
        )}
      </div>

      <div className="chart-box">
        <strong>Top card positions (value vs cost)</strong>
        {topPositions.length ? (
          <div className="position-bars">
            {topPositions.map((item) => {
              const maxWidth = Math.max(...topPositions.map((entry) => entry.totalValue), 1);
              return (
                <div className="position-row" key={item.key}>
                  <span>{item.name} {item.number ? `· ${item.number}` : ''}</span>
                  <div className="position-track">
                    <div className="position-value" style={{ width: `${Math.max(8, (item.totalValue / maxWidth) * 100)}%` }} />
                    <div className="position-cost" style={{ width: `${Math.max(6, (item.totalCost / maxWidth) * 100)}%` }} />
                  </div>
                  <strong>{formatCurrency(item.gain)}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted-text" style={{ marginBottom: 0 }}>Add cards to render this chart.</p>
        )}
      </div>

      <div className="chart-box">
        <strong>Binder cards and best deals</strong>
        <p className="muted-text" style={{ marginTop: 6 }}>Tap any card row to view live market fluctuation and AI forecast.</p>
        <div className="deals-list" style={{ marginTop: 10 }}>
          {cards.length ? (
            cards.map((card) => {
              const url = getDealUrl
                ? getDealUrl(card.cardName || 'Pokemon card', card.cardNumber || '')
                : `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.cardName || 'Pokemon card')}&LH_BIN=1&sop=15`;
              return (
                <div
                  className="deal-item deal-item-btn"
                  key={card.id || `${card.cardName}-${card.cardNumber}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCardDetail(card)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openCardDetail(card);
                    }
                  }}
                >
                  <div><strong>{card.cardName}</strong> — {card.cardNumber}</div>
                  <div className="muted-text" style={{ fontSize: '0.85rem' }}>{card.setName} · Qty {card.quantity || 1} · Value {formatCurrency(card.estimatedValue || 0)}</div>
                  <div className="binder-links">
                    <a href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>eBay deal</a>
                    {onRemoveCard ? (
                      <button
                        type="button"
                        className="danger-cta"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveCard(card.id);
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="deal-item">Scan a card to generate live deal links.</div>
          )}
        </div>
      </div>

      {selectedCard ? (
        <div
          className="insight-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Card market insight"
          onClick={() => setSelectedCard(null)}
        >
          <div className="insight-modal" onClick={(event) => event.stopPropagation()}>
            <div className="insight-topbar">
              <div>
                <strong>{selectedCard.cardName}</strong>
                <div className="muted-text">{selectedCard.setName} · {selectedCard.cardNumber}</div>
              </div>
              <button type="button" className="camera-close" onClick={() => setSelectedCard(null)} aria-label="Close insight">✕</button>
            </div>

            {detailsLoading ? <p className="muted-text">Loading live market data...</p> : null}

            {!detailsLoading && selectedInsights ? (
              <>
                <div className="insight-metrics">
                  <div className="stat-box">
                    <strong>Live estimate</strong>
                    <div>{formatCurrency(selectedInsights.marketEstimate || selectedCard.estimatedValue)}</div>
                  </div>
                  <div className="stat-box">
                    <strong>Market range</strong>
                    <div>{formatCurrency(selectedInsights.marketRange.low)} - {formatCurrency(selectedInsights.marketRange.high)}</div>
                  </div>
                </div>

                <div className="chart-box" style={{ marginTop: 12 }}>
                  <strong>Price fluctuation (live market snapshots)</strong>
                  {selectedInsights.series.length > 1 ? (
                    <svg viewBox="0 0 100 100" width="100%" height="140">
                      <polyline
                        fill="none"
                        stroke="#0f766e"
                        strokeWidth="2.2"
                        points={selectedInsights.series.map((point, idx) => {
                          const x = (idx / (selectedInsights.series.length - 1)) * 100;
                          const maxValue = Math.max(...selectedInsights.series.map((item) => item.value), 1);
                          const y = 100 - (point.value / maxValue) * 78;
                          return `${x},${y}`;
                        }).join(' ')}
                      />
                    </svg>
                  ) : (
                    <p className="muted-text">Not enough data points yet for this specific card trend line.</p>
                  )}
                  <div className="tiny-row muted-text">Live matches sampled: {selectedInsights.liveMatches}</div>
                </div>

                <div className="chart-box" style={{ marginTop: 12 }}>
                  <strong>AI outlook</strong>
                  {selectedForecast ? (
                    <>
                      <p className="forecast-pill">Direction: {selectedForecast.direction === 'up' ? 'Likely up' : 'Likely down'} · Confidence {Math.round(Number(selectedForecast.confidence || 0))}%</p>
                      <p className="muted-text" style={{ marginBottom: 0 }}>{selectedForecast.summary}</p>
                    </>
                  ) : (
                    <p className="muted-text">Forecast not available yet.</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
