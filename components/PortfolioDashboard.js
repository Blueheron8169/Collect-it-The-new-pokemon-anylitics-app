'use client';

export default function PortfolioDashboard({ cards, totalNetWorth }) {
  const historySeries = cards.length ? cards.map((card) => Number(card.estimatedValue || 0)) : [0];
  const chartHeight = 120;
  const max = Math.max(...historySeries, 1);
  const points = historySeries.map((value, index) => {
    const x = historySeries.length === 1 ? 50 : (index / (historySeries.length - 1)) * 100;
    const y = 100 - (value / max) * 80;
    return `${x},${y}`;
  });

  return (
    <div className="dashboard-card">
      <h2>Portfolio dashboard</h2>
      <div className="stats-grid">
        <div className="stat-box">
          <strong>Total net worth</strong>
          <div>${totalNetWorth.toFixed(2)}</div>
        </div>
        <div className="stat-box">
          <strong>Cards tracked</strong>
          <div>{cards.length}</div>
        </div>
      </div>

      <div className="chart-box">
        <strong>7d / 30d / All-Time pricing view</strong>
        <svg viewBox="0 0 100 100" width="100%" height={chartHeight}>
          <polyline fill="none" stroke="#4b78ff" strokeWidth="2" points={points.join(' ')} />
        </svg>
        <p style={{ color: '#9eb0c7', marginBottom: 0 }}>Mocked chart mapped from the latest pricing data arrays.</p>
      </div>

      <div className="chart-box">
        <strong>Best live deals across the web</strong>
        <div className="deals-list" style={{ marginTop: 10 }}>
          {cards.length ? (
            cards.map((card) => {
              const name = encodeURIComponent(card.cardName || 'Pokemon Card');
              const number = encodeURIComponent(card.cardNumber || '');
              const url = `https://www.ebay.com/sch/i.html?_nkw=${name}+${number}&LH_BIN=1&sop=15`;
              return (
                <div className="deal-item" key={card.id || card.cardName}>
                  <div><strong>{card.cardName}</strong> — {card.cardNumber}</div>
                  <a href={url} target="_blank" rel="noreferrer">Open eBay deal</a>
                </div>
              );
            })
          ) : (
            <div className="deal-item">Scan a card to generate live deal links.</div>
          )}
        </div>
      </div>
    </div>
  );
}
