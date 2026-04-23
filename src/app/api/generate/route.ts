import { NextRequest, NextResponse } from 'next/server';

interface QA {
  question: string;
  answer: string;
}

async function refinePrompt(provider: string, token: string, original: string, answers: QA[]): Promise<string> {
  const answersBlock = answers
    .filter(a => a.answer.trim())
    .map(a => `P: ${a.question}\nR: ${a.answer}`)
    .join('\n\n');

  const systemMsg = `Você é um especialista em criar prompts para geração de imagens com IA.
Com base no prompt original e nas respostas do usuário, crie um prompt refinado, detalhado e otimizado para gerar a melhor imagem possível.
Retorne APENAS o prompt refinado em inglês (prompts em inglês funcionam melhor com IA), sem explicações adicionais.`;

  const userMsg = `Prompt original: "${original}"\n\nRespostas de validação:\n${answersBlock || '(sem respostas adicionais)'}`;

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
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.8,
      }),
    });
    const data = await res.json();
    return data.choices[0].message.content.trim();
  } else {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemMsg}\n\n${userMsg}` }] }],
          generationConfig: { temperature: 0.8 },
        }),
      }
    );
    const data = await res.json();
    return data.candidates[0].content.parts[0].text.trim();
  }
}

async function generateWithOpenAI(token: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Erro ao gerar imagem com DALL-E 3');
  }

  const data = await res.json();
  return `data:image/png;base64,${data.data[0].b64_json}`;
}

async function generateWithGemini(token: string, prompt: string): Promise<string> {
  // Try Imagen 3 first
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: prompt },
        safetyFilterLevel: 'BLOCK_SOME',
        personGeneration: 'ALLOW_ADULT',
        numberOfImages: 1,
        aspectRatio: '1:1',
      }),
    }
  );

  if (!res.ok) {
    // Fall back to Gemini 2.0 Flash image generation
    const res2 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    if (!res2.ok) {
      const err = await res2.json();
      throw new Error(err.error?.message || 'Erro ao gerar imagem com Gemini. Verifique se seu token tem acesso a geração de imagens.');
    }

    const data2 = await res2.json();
    const parts = data2.candidates[0].content.parts;
    const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) throw new Error('Gemini não retornou imagem. Tente com uma chave OpenAI para DALL-E 3.');
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  }

  const data = await res.json();
  const imgBytes = data.generatedImages?.[0]?.image?.imageBytes;
  if (!imgBytes) throw new Error('Nenhuma imagem retornada pelo Imagen 3');
  return `data:image/png;base64,${imgBytes}`;
}

export async function POST(req: NextRequest) {
  try {
    const { provider, token, prompt, answers } = await req.json();

    if (!token || !prompt) {
      return NextResponse.json({ error: 'Token e prompt são obrigatórios' }, { status: 400 });
    }

    const refinedPrompt = await refinePrompt(provider, token, prompt, answers || []);

    const imageUrl = provider === 'openai'
      ? await generateWithOpenAI(token, refinedPrompt)
      : await generateWithGemini(token, refinedPrompt);

    return NextResponse.json({ imageUrl, refinedPrompt });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno ao gerar imagem';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
