import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { q } = await request.json();

    if (!q) {
      return NextResponse.json({ error: 'Missing search query.' }, { status: 400 });
    }

    const url = `https://api.pokewallet.io/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        'X-API-Key': process.env.POKEWALLET_API_KEY || '',
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({
        marketEstimate: 0,
        priceData: [],
        fallback: true,
      });
    }

    const data = await res.json();
    const cards = Array.isArray(data) ? data : data.cards || [];
    const firstCard = cards[0] || {};
    const priceData = Array.isArray(firstCard.pricing) ? firstCard.pricing : [];
    const marketEstimate = Number(firstCard.marketValue || firstCard.price || firstCard.avgPrice || 0);

    return NextResponse.json({
      marketEstimate,
      priceData,
      source: 'pokewallet',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      marketEstimate: 0,
      priceData: [],
      fallback: true,
    });
  }
}
