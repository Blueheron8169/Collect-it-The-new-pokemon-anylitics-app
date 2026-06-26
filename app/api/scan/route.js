import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing image payload.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt =
      'Analyze this Pokémon card photo. Return a raw JSON object with these exact keys: cardName, setName, cardNumber, isHolo (boolean), estimatedCondition (\'Near Mint\', \'Lightly Played\', or \'Heavily Played\'), centeringAnalysis, edgeWear. Do not output markdown text wrappers, only raw JSON code.';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

    const text = result.response.text();
    let parsed = {};

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    return NextResponse.json({
      cardName: parsed.cardName || 'Unknown Card',
      setName: parsed.setName || 'Unknown Set',
      cardNumber: parsed.cardNumber || '000',
      isHolo: Boolean(parsed.isHolo),
      estimatedCondition: parsed.estimatedCondition || 'Near Mint',
      centeringAnalysis: parsed.centeringAnalysis || 'Not available',
      edgeWear: parsed.edgeWear || 'Not available',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Scan failed.' }, { status: 500 });
  }
}
