import { NextResponse } from 'next/server';

const PAGE_SIZE = 250;
const MAX_PAGES = 30;
const PAGE_FETCH_CONCURRENCY = 4;
const SEALED_KEYWORDS = [
  'sealed',
  'booster box',
  'booster bundle',
  'elite trainer box',
  'etb',
  'tin',
  'collection box',
  'premium collection',
  'blister',
  'build and battle',
  'bundle',
  'upc',
  'ultra premium collection',
];

function normalizePrice(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function cleanNumber(rawNumber = '') {
  const normalized = String(rawNumber || '').trim();
  if (!normalized) return '';
  return normalized.split('/')[0].trim();
}

function parseSearchTerms(query) {
  const tokens = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return { cardName: '', suffix: '', number: '' };
  }

  const suffixes = new Set(['v', 'vmax', 'vstar', 'ex', 'gx', 'tag', 'team', 'lv.x', 'radiant', 'prime']);
  let number = '';
  let suffix = '';
  const nameParts = [];

  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (!number && /^[a-z]{0,3}\d+[a-z]{0,2}(?:\/\d+)?$/i.test(normalized)) {
      number = cleanNumber(token);
      continue;
    }
    if (!suffix && suffixes.has(normalized)) {
      suffix = token;
      continue;
    }
    nameParts.push(token);
  }

  return {
    cardName: nameParts.join(' ').trim() || String(query || '').trim(),
    suffix,
    number,
  };
}

function escapeForQuery(value) {
  return String(value || '').replace(/"/g, '\\"').trim();
}

function resolvePrice(card = {}) {
  const tcg = card.tcgplayer?.prices || {};
  const cardmarket = card.cardmarket?.prices || {};
  const scored = [];

  const keyScores = {
    market: 1,
    trendPrice: 2,
    averageSellPrice: 3,
    mid: 4,
    directLow: 5,
    low: 6,
    high: 7,
  };

  function collectCandidates(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 4) return;

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        collectCandidates(value, depth + 1);
        continue;
      }

      const normalized = normalizePrice(value);
      if (normalized <= 0) continue;

      const score = keyScores[key] ?? 9;
      scored.push({ score, value: normalized });
    }
  }

  collectCandidates(tcg);
  collectCandidates(cardmarket);

  if (!scored.length) return 0;
  scored.sort((a, b) => (a.score - b.score) || (b.value - a.value));
  return scored[0].value;
}

function collectMarketPoints(card = {}) {
  const tcg = card.tcgplayer?.prices || {};
  const cardmarket = card.cardmarket?.prices || {};
  const points = [
    { label: 'TCG market', value: normalizePrice(tcg.holofoil?.market || tcg.normal?.market || tcg.reverseHolofoil?.market) },
    { label: 'TCG low', value: normalizePrice(tcg.holofoil?.low || tcg.normal?.low || tcg.reverseHolofoil?.low) },
    { label: 'TCG mid', value: normalizePrice(tcg.holofoil?.mid || tcg.normal?.mid || tcg.reverseHolofoil?.mid) },
    { label: 'Cardmarket avg', value: normalizePrice(cardmarket.averageSellPrice) },
    { label: 'Cardmarket trend', value: normalizePrice(cardmarket.trendPrice) },
  ].filter((item) => item.value > 0);

  const uniqueLabels = new Set();
  return points.filter((item) => {
    if (uniqueLabels.has(item.label)) return false;
    uniqueLabels.add(item.label);
    return true;
  });
}

function buildDescription(card = {}) {
  const parts = [];
  if (card.rarity) parts.push(card.rarity);
  if (card.set?.name) parts.push(card.set.name);
  if (card.supertype) parts.push(card.supertype);
  return parts.join(' • ') || 'Live Pokemon TCG listing.';
}

function toResult(card) {
  const value = resolvePrice(card);
  const releaseDate = card.set?.releaseDate || '';
  const marketPoints = collectMarketPoints(card);
  return {
    id: card.id,
    name: card.name || 'Pokemon card',
    set: card.set?.name || 'Unknown set',
    setId: card.set?.id || '',
    releaseDate,
    number: card.number || '---',
    price: `$${value.toFixed(2)}`,
    priceValue: value,
    description: buildDescription(card),
    imageUrl: card.images?.small || card.images?.large || '',
    marketPoints,
  };
}

function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSealedQuery(query = '') {
  const normalized = String(query || '').toLowerCase();
  return SEALED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function median(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function parseEbaySoldItems(html = '') {
  const items = [];
  const itemRegex = /<li\s+class="s-item[\s\S]*?<div\s+class="s-item__title[\s\S]*?<\/li>/gi;
  const chunks = String(html || '').match(itemRegex) || [];

  for (const chunk of chunks) {
    if (chunk.includes('s-item__title--tagblock')) continue;

    const titleMatch = chunk.match(/s-item__title[^>]*>([\s\S]*?)<\/div>/i);
    const priceMatch = chunk.match(/s-item__price[^>]*>\s*\$([0-9,]+(?:\.[0-9]{2})?)/i);
    if (!titleMatch || !priceMatch) continue;

    const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '');
    const title = decodeHtml(rawTitle);
    if (!title || /shop on ebay|new listing/i.test(title)) continue;

    const value = normalizePrice(priceMatch[1].replace(/,/g, ''));
    if (value <= 0) continue;

    items.push({
      name: title,
      priceValue: value,
      price: `$${value.toFixed(2)}`,
      set: 'Sealed Product',
      number: '---',
      description: 'Estimated from recent sold eBay listings.',
      imageUrl: '',
    });
  }

  return items;
}

async function fetchEbaySoldListings(query) {
  const endpoint = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&rt=nc`;
  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CollectItBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 120 },
  });

  if (!response.ok) {
    throw new Error(`eBay sold listings request failed with ${response.status}`);
  }

  const html = await response.text();
  return parseEbaySoldItems(html);
}

async function fetchCardsPage(query, page = 1, pageSize = PAGE_SIZE) {
  const endpoint = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      ...(process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {}),
    },
    next: { revalidate: 90 },
  });

  if (!response.ok) {
    throw new Error(`Pokemon TCG API request failed with ${response.status}`);
  }

  const data = await response.json();
  return {
    cards: Array.isArray(data?.data) ? data.data : [],
    totalCount: Number(data?.totalCount || 0),
    page: Number(data?.page || page),
    pageSize: Number(data?.pageSize || pageSize),
  };
}

async function fetchAllCards(query) {
  const firstPage = await fetchCardsPage(query, 1, PAGE_SIZE);
  if (!firstPage.cards.length) return [];

  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(firstPage.totalCount / PAGE_SIZE)));
  const allCards = [...firstPage.cards];

  if (totalPages === 1) {
    return allCards;
  }

  const remainingPages = [];
  for (let page = 2; page <= totalPages; page += 1) {
    remainingPages.push(page);
  }

  for (let i = 0; i < remainingPages.length; i += PAGE_FETCH_CONCURRENCY) {
    const chunk = remainingPages.slice(i, i + PAGE_FETCH_CONCURRENCY);
    const responses = await Promise.all(chunk.map((page) => fetchCardsPage(query, page, PAGE_SIZE)));
    for (const response of responses) {
      if (response.cards.length) {
        allCards.push(...response.cards);
      }
    }
  }

  return allCards;
}

export async function POST(request) {
  try {
    const { q } = await request.json();

    if (!q) {
      return NextResponse.json({ error: 'Missing search query.' }, { status: 400 });
    }

    const queryRaw = String(q || '').trim();

    if (isSealedQuery(queryRaw)) {
      let soldItems = [];
      try {
        soldItems = await fetchEbaySoldListings(queryRaw);
      } catch {
        soldItems = [];
      }

      const marketEstimate = median(soldItems.map((item) => item.priceValue).filter((value) => value > 0));
      const priceData = soldItems.slice(0, 7).map((item, index) => ({ label: `Comp ${index + 1}`, value: item.priceValue }));

      return NextResponse.json({
        marketEstimate,
        priceData,
        results: soldItems,
        source: 'ebay-sealed',
        fallback: soldItems.length === 0,
      });
    }

    const { cardName, suffix, number } = parseSearchTerms(queryRaw);
    const escapedName = escapeForQuery(cardName);
    const escapedSuffix = escapeForQuery(suffix);
    const escapedNumber = escapeForQuery(number);

    const queries = [];
    if (escapedName && escapedNumber && escapedSuffix) {
      queries.push(`name:"*${escapedName}*" name:"*${escapedSuffix}*" number:"${escapedNumber}"`);
    }
    if (escapedName && escapedNumber) {
      queries.push(`name:"*${escapedName}*" number:"${escapedNumber}"`);
    }
    if (escapedName && escapedSuffix) {
      queries.push(`name:"*${escapedName} ${escapedSuffix}*"`);
    }
    if (escapedName) {
      queries.push(`name:"*${escapedName}*"`);
    }

    let cards = [];
    for (const query of queries) {
      try {
        cards = await fetchAllCards(query);
      } catch {
        cards = [];
      }
      if (cards.length) break;
    }

    cards.sort((a, b) => {
      const aDate = new Date(a.set?.releaseDate || 0).getTime();
      const bDate = new Date(b.set?.releaseDate || 0).getTime();
      return bDate - aDate;
    });

    const results = cards.map(toResult);
    let marketEstimate = results.length ? results[0].priceValue : 0;
    if (marketEstimate <= 0) {
      const priced = results.find((item) => item.priceValue > 0);
      marketEstimate = priced?.priceValue || 0;
    }

    if (marketEstimate <= 0 && queryRaw) {
      try {
        const soldItems = await fetchEbaySoldListings(`${queryRaw} pokemon card`);
        const soldMedian = median(soldItems.map((item) => item.priceValue).filter((value) => value > 0));
        if (soldMedian > 0) {
          marketEstimate = soldMedian;
          if (results.length) {
            results[0] = {
              ...results[0],
              priceValue: soldMedian,
              price: `$${soldMedian.toFixed(2)}`,
              description: `${results[0].description} • Price backfilled from sold listings.`,
            };
          }
        }
      } catch {
        // Keep card data as-is if sold listing fallback is unavailable.
      }
    }

    const priceData = results.slice(0, 5).map((item) => ({ label: item.set, value: item.priceValue }));

    return NextResponse.json({
      marketEstimate,
      priceData,
      results,
      source: 'pokemontcg',
      fallback: results.length === 0,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      marketEstimate: 0,
      priceData: [],
      results: [],
      fallback: true,
    });
  }
}
