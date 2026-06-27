const sampleCards = [
  {
    name: 'Pikachu V',
    set: 'Scarlet & Violet',
    number: '001/198',
    price: 12.5,
    description: 'A bright, popular promo card with strong collector demand.',
    imageUrl: 'https://images.pokemontcg.io/swsh4/44.png',
  },
  {
    name: 'Charizard ex',
    set: 'Obsidian Flames',
    number: '186/197',
    price: 28,
    description: 'A modern staple with excellent resale momentum.',
    imageUrl: 'https://images.pokemontcg.io/sv3/125.png',
  },
  {
    name: 'Umbreon VMAX',
    set: 'Evolving Skies',
    number: '054/203',
    price: 18.75,
    description: 'Classic collector appeal with dependable interest.',
    imageUrl: 'https://images.pokemontcg.io/swsh7/95.png',
  },
  {
    name: 'Mew ex',
    set: 'Astral Radiance',
    number: '071/189',
    price: 9.4,
    description: 'An affordable option for collectors who want a flexible build.',
    imageUrl: 'https://images.pokemontcg.io/sv2/151.png',
  },
];

function parsePriceValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    return parsePriceValue(value.value ?? value.amount ?? 0);
  }
  return 0;
}

export function formatCurrency(value) {
  const amount = parsePriceValue(value);
  return `$${amount.toFixed(2)}`;
}

export function buildFallbackCard(fileName = '', manualValues = {}) {
  const rawName = manualValues.name?.trim() || fileName.replace(/\.[^.]+$/, '') || 'Mystery Pokemon Card';
  const cardName = rawName.replace(/[-_]+/g, ' ').trim() || 'Mystery Pokemon Card';
  const setName = manualValues.set?.trim() || 'Classic Collection';
  const cardNumber = manualValues.number?.trim() || '001/100';
  const estimatedValue = Math.max(parsePriceValue(manualValues.price), getDefaultValue(cardName));

  return {
    cardName,
    setName,
    cardNumber,
    isHolo: /charizard|umbreon|rayquaza/i.test(cardName),
    estimatedCondition: 'Near Mint',
    centeringAnalysis: 'The preview looks centered enough to track immediately.',
    edgeWear: 'No obvious issues detected in the supplied draft.',
    estimatedValue,
    priceData: [{ label: 'Draft estimate', value: estimatedValue }],
  };
}

export function buildSearchResults(query = '') {
  const normalized = query.trim().toLowerCase();
  const filtered = sampleCards.filter((card) => {
    const haystack = `${card.name} ${card.set} ${card.number}`.toLowerCase();
    return haystack.includes(normalized);
  });

  return (filtered.length ? filtered : sampleCards).slice(0, 4).map((card) => ({
    ...card,
    priceValue: card.price,
    price: formatCurrency(card.price),
    imageUrl: card.imageUrl || '',
  }));
}

function getDefaultValue(cardName) {
  const normalized = cardName.toLowerCase();
  if (normalized.includes('charizard')) return 24;
  if (normalized.includes('pikachu')) return 16;
  if (normalized.includes('umbreon')) return 12;
  return 10;
}
