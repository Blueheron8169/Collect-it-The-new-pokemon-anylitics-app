import { NextResponse } from 'next/server';

function summarizeSeries(series = []) {
  const clean = (Array.isArray(series) ? series : [])
    .map((item) => ({
      label: String(item.label || ''),
      value: Number(item.value || 0),
      timestamp: String(item.timestamp || ''),
    }))
    .filter((item) => item.value > 0);

  if (!clean.length) {
    return {
      latest: 0,
      first: 0,
      slope: 0,
      volatility: 0,
      points: [],
    };
  }

  const latest = clean[clean.length - 1].value;
  const first = clean[0].value;
  const slope = latest - first;

  const mean = clean.reduce((sum, item) => sum + item.value, 0) / clean.length;
  const variance = clean.reduce((sum, item) => sum + ((item.value - mean) ** 2), 0) / clean.length;
  const volatility = Math.sqrt(variance);

  return {
    latest,
    first,
    slope,
    volatility,
    points: clean,
  };
}

function ruleBasedForecast({ cardName = '', seriesSummary, marketPoints = [] }) {
  const trendUp = seriesSummary.slope > 0;
  const strongTrend = Math.abs(seriesSummary.slope) >= Math.max(1.5, seriesSummary.latest * 0.08);
  const spread = marketPoints.length
    ? (Math.max(...marketPoints.map((item) => Number(item.value || 0))) - Math.min(...marketPoints.map((item) => Number(item.value || 0))))
    : 0;

  const confidence = Math.max(45, Math.min(87, Math.round(58 + (strongTrend ? 14 : 0) - Math.min(10, seriesSummary.volatility))));
  const direction = trendUp ? 'up' : 'down';
  const reasonParts = [
    `${cardName || 'This card'} shows a ${trendUp ? 'positive' : 'softening'} pricing slope across the latest market points.`,
    `Recent value moved from $${seriesSummary.first.toFixed(2)} to $${seriesSummary.latest.toFixed(2)}.`,
  ];

  if (spread > 0) {
    reasonParts.push(`Current market spread is about $${spread.toFixed(2)}, which ${spread > 8 ? 'adds risk' : 'looks relatively stable'}.`);
  }

  return {
    direction,
    confidence,
    summary: reasonParts.join(' '),
    source: 'rule-based',
  };
}

async function aiForecast(payload) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              'You are a Pokemon card market analyst.',
              'Use only the supplied data and return ONLY compact JSON with keys: direction, confidence, summary.',
              'direction must be "up" or "down". confidence must be 1-100 integer.',
              `Data: ${JSON.stringify(payload)}`,
            ].join(' '),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 240,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) return null;

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    const direction = parsed.direction === 'down' ? 'down' : 'up';
    const confidence = Math.max(1, Math.min(100, Number(parsed.confidence || 55)));
    const summary = String(parsed.summary || '').trim();
    if (!summary) return null;
    return { direction, confidence, summary, source: 'gemini' };
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const cardName = String(payload.cardName || '').trim();
    const marketPoints = Array.isArray(payload.marketPoints) ? payload.marketPoints : [];
    const seriesSummary = summarizeSeries(payload.series || []);

    const ai = await aiForecast({
      cardName,
      cardNumber: String(payload.cardNumber || '').trim(),
      setName: String(payload.setName || '').trim(),
      series: seriesSummary.points,
      marketPoints,
      latestValue: seriesSummary.latest,
      slope: seriesSummary.slope,
      volatility: seriesSummary.volatility,
    });

    if (ai) {
      return NextResponse.json(ai);
    }

    return NextResponse.json(ruleBasedForecast({ cardName, seriesSummary, marketPoints }));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Forecast failed.' }, { status: 500 });
  }
}
