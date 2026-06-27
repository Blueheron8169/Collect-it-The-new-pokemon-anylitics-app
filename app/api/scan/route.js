import { NextResponse } from 'next/server';

function parseJsonFromText(text = '') {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callGeminiVision({ imageBase64, mimeType = 'image/jpeg', retries = 0 }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'You are a precise Pokemon card scanner. Return ONLY JSON with keys: pokemonName, cardSuffix, cardNumber, cardDetails, confidence. If you are unsure, return your best guess and keep confidence low. Extract cardNumber as only the left side number (example 113 from 113/185).',
          },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 260,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed with ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseJsonFromText(text);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini returned non-JSON response.');
    }

    return parsed;
  } catch (error) {
    if (retries < 5) {
      const delayMs = Math.pow(2, retries) * 500;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return callGeminiVision({ imageBase64, mimeType, retries: retries + 1 });
    }
    throw error;
  }
}

function sanitizeCardNumber(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  return value.split('/')[0].trim();
}

export async function POST(request) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing image payload.' }, { status: 400 });
    }
    let parsed;
    try {
      parsed = await callGeminiVision({ imageBase64, mimeType });
    } catch (error) {
      return NextResponse.json({
        cardName: '',
        setName: '',
        cardNumber: '',
        cardSuffix: '',
        isHolo: false,
        estimatedCondition: 'Near Mint',
        centeringAnalysis: 'AI scan unavailable. Enter card name manually, then scan again.',
        edgeWear: 'Unknown',
        source: 'scan-fallback',
        message: error.message || 'AI scan unavailable.',
      });
    }

    const pokemonName = String(parsed.pokemonName || parsed.name || '').trim();
    const cardSuffix = String(parsed.cardSuffix || '').trim();
    const combinedName = [pokemonName, cardSuffix].filter(Boolean).join(' ').trim();
    const cardNumber = sanitizeCardNumber(parsed.cardNumber);
    const details = String(parsed.cardDetails || '').trim();

    return NextResponse.json({
      cardName: combinedName || pokemonName || '',
      pokemonName,
      cardSuffix,
      setName: '',
      cardNumber,
      isHolo: /holo|full art|hyper rare|rainbow/i.test(details),
      estimatedCondition: 'Near Mint',
      centeringAnalysis: details || 'AI scan complete.',
      edgeWear: 'Unknown',
      confidence: Number(parsed.confidence || 0),
      source: 'gemini-vision',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Scan failed.' }, { status: 500 });
  }
}
