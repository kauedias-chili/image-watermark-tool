import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `Você é um especialista em geração de imagens com IA. Dado o prompt do usuário, gere EXATAMENTE 3 perguntas de validação que ajudarão a criar uma imagem muito melhor e mais precisa.

As perguntas devem explorar aspectos diferentes como:
- Estilo visual (fotorrealista, ilustração, arte digital, etc.)
- Paleta de cores e iluminação
- Composição, perspectiva e detalhes específicos

Retorne APENAS um JSON válido no formato:
{"questions": ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"]}`;

export async function POST(req: NextRequest) {
  try {
    const { provider, token, prompt } = await req.json();

    if (!token || !prompt) {
      return NextResponse.json({ error: 'Token e prompt são obrigatórios' }, { status: 400 });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Prompt do usuário: "${prompt}"` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json({ error: err.error?.message || 'Erro na API OpenAI' }, { status: 400 });
      }

      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      return NextResponse.json({ questions: parsed.questions });

    } else {
      // Gemini
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${SYSTEM_PROMPT}\n\nPrompt do usuário: "${prompt}"` }],
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json({ error: err.error?.message || 'Erro na API Gemini' }, { status: 400 });
      }

      const data = await res.json();
      const text = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text);
      return NextResponse.json({ questions: parsed.questions });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
