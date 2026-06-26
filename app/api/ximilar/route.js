import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing image payload.' }, { status: 400 });
    }

    if (!process.env.XIMILAR_API_KEY) {
      return NextResponse.json({
        status: 'fallback',
        note: 'Ximilar key not configured; Gemini scan remains the primary path.',
      });
    }

    const response = await fetch('https://api.ximilar.com/recognition/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.XIMILAR_API_KEY,
      },
      body: JSON.stringify({ imageBase64, mimeType }),
    });

    if (!response.ok) {
      throw new Error('Ximilar request failed');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ status: 'fallback', note: 'Ximilar unavailable.' });
  }
}
