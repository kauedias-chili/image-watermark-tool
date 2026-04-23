'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

type Provider = 'openai' | 'gemini';
type Step = 'config' | 'prompt' | 'questions' | 'result';

interface QA {
  question: string;
  answer: string;
}

const STEPS: { id: Step; label: string; num: number }[] = [
  { id: 'config', label: 'Configurar IA', num: 1 },
  { id: 'prompt', label: 'Seu Prompt', num: 2 },
  { id: 'questions', label: 'Validação', num: 3 },
  { id: 'result', label: 'Resultado', num: 4 },
];

function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-purple-500/20" />
        <div className="absolute inset-0 rounded-full border-4 border-t-purple-500 animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-t-indigo-400 animate-spin-slow" style={{ animationDirection: 'reverse' }} />
      </div>
      <p className="text-purple-300 text-sm font-medium animate-pulse">{message}</p>
    </div>
  );
}

function ProgressBar({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                done ? 'step-done shadow-lg' : active ? 'step-active glow shadow-lg' : 'bg-white/10'
              }`}>
                {done ? '✓' : step.num}
              </div>
              <span className={`text-xs font-medium transition-colors ${active ? 'text-purple-300' : done ? 'text-emerald-400' : 'text-white/40'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-12 sm:w-20 mx-1 mb-5 transition-all duration-500 ${done ? 'bg-emerald-400' : 'bg-white/10'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>('config');
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [questions, setQuestions] = useState<QA[]>([]);
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [generatedImageB64, setGeneratedImageB64] = useState('');
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState('');
  const [finalImageUrl, setFinalImageUrl] = useState('');
  const [wmOpacity, setWmOpacity] = useState(18);
  const [wmScale, setWmScale] = useState(50);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyWatermark = useCallback(() => {
    if (!generatedImageB64 || !watermarkFile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImg = new Image();
    baseImg.src = generatedImageB64;

    baseImg.onload = () => {
      canvas.width = baseImg.naturalWidth || 1024;
      canvas.height = baseImg.naturalHeight || 1024;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImg, 0, 0);

      const wmUrl = URL.createObjectURL(watermarkFile);
      const wmImg = new Image();
      wmImg.src = wmUrl;

      wmImg.onload = () => {
        const maxW = canvas.width * (wmScale / 100);
        const maxH = canvas.height * (wmScale / 100);
        const scale = Math.min(maxW / wmImg.naturalWidth, maxH / wmImg.naturalHeight);
        const w = wmImg.naturalWidth * scale;
        const h = wmImg.naturalHeight * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
        ctx.globalAlpha = wmOpacity / 100;
        ctx.drawImage(wmImg, x, y, w, h);
        ctx.restore();

        setFinalImageUrl(canvas.toDataURL('image/png'));
        URL.revokeObjectURL(wmUrl);
      };
    };
  }, [generatedImageB64, watermarkFile, wmOpacity, wmScale]);

  useEffect(() => {
    if (generatedImageB64 && watermarkFile) {
      applyWatermark();
    }
  }, [generatedImageB64, watermarkFile, wmOpacity, wmScale, applyWatermark]);

  const fetchQuestions = async () => {
    if (!apiKey.trim()) { setError('Por favor, insira seu token de API.'); return; }
    setError('');
    setLoading(true);
    setLoadingMsg('Analisando seu prompt com IA...');
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token: apiKey, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions.map((q: string) => ({ question: q, answer: '' })));
      setStep('questions');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar perguntas. Verifique seu token.');
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async () => {
    setError('');
    setLoading(true);
    setLoadingMsg('Refinando prompt com IA...');
    setTimeout(() => setLoadingMsg('Gerando sua imagem (pode levar 20-30s)...'), 3000);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token: apiKey, prompt, answers: questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneratedImageB64(data.imageUrl);
      setRefinedPrompt(data.refinedPrompt);
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar imagem.');
    } finally {
      setLoading(false);
    }
  };

  const handleWatermarkFile = (file: File) => {
    if (!file.type.includes('image/')) return;
    setWatermarkFile(file);
    if (watermarkPreview) URL.revokeObjectURL(watermarkPreview);
    setWatermarkPreview(URL.createObjectURL(file));
    setFinalImageUrl('');
  };

  const downloadImage = () => {
    const url = finalImageUrl || generatedImageB64;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `imagem-gerada-${Date.now()}.png`;
    a.click();
  };

  return (
    <main className="min-h-screen py-10 px-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl step-active flex items-center justify-center text-xl">🎨</div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            AI Image + Marca d&apos;Água
          </h1>
        </div>
        <p className="text-white/50 text-sm max-w-md mx-auto">
          Gere imagens com inteligência artificial e adicione sua marca d&apos;água personalizada com efeito profissional
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <ProgressBar current={step} />

        {/* Error banner */}
        {error && (
          <div className="glass rounded-xl p-4 mb-6 border border-red-500/30 bg-red-500/10">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <div>
                <p className="text-red-300 text-sm font-medium">Ocorreu um erro</p>
                <p className="text-red-400/80 text-xs mt-1">{error}</p>
              </div>
              <button onClick={() => setError('')} className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
            </div>
          </div>
        )}

        {loading && <LoadingSpinner message={loadingMsg} />}

        {!loading && (
          <div className="glass rounded-2xl p-6 sm:p-8">

            {/* STEP 1: Config */}
            {step === 'config' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Configure sua IA</h2>
                  <p className="text-white/50 text-sm">Escolha o provedor e insira seu token de API</p>
                </div>

                {/* Provider selection */}
                <div className="grid grid-cols-2 gap-3">
                  {(['openai', 'gemini'] as Provider[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`glass glass-hover rounded-xl p-4 flex flex-col items-center gap-2 transition-all duration-300 ${
                        provider === p ? 'border-purple-500/60 glow' : ''
                      }`}
                    >
                      <span className="text-3xl">{p === 'openai' ? '🤖' : '✨'}</span>
                      <span className="font-semibold text-sm">{p === 'openai' ? 'OpenAI' : 'Google Gemini'}</span>
                      <span className="text-white/40 text-xs text-center">
                        {p === 'openai' ? 'GPT-4o + DALL-E 3' : 'Gemini Flash + Imagen 3'}
                      </span>
                      {provider === p && (
                        <span className="text-xs text-purple-400 font-medium">✓ Selecionado</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* API Key */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    {provider === 'openai' ? 'OpenAI API Key' : 'Google Gemini API Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={provider === 'openai' ? 'sk-...' : 'AIza...'}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500/60 transition-colors pr-12"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors text-lg"
                    >
                      {showKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    Seu token é usado apenas para chamadas à API e não é armazenado em nenhum servidor.
                  </p>
                  {provider === 'openai' && (
                    <p className="text-amber-400/70 text-xs mt-1">
                      ⚠️ DALL-E 3 tem custo por geração (~$0.04/imagem). Verifique seus créditos.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => { setError(''); setStep('prompt'); }}
                  disabled={!apiKey.trim()}
                  className="w-full step-active glow-hover rounded-xl py-3 font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar →
                </button>
              </div>
            )}

            {/* STEP 2: Prompt */}
            {step === 'prompt' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Descreva sua imagem</h2>
                  <p className="text-white/50 text-sm">Quanto mais detalhes, melhor o resultado</p>
                </div>

                <div>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Ex: Um produto automotivo sobre fundo branco, iluminação de estúdio profissional, foto de catálogo..."
                    rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500/60 transition-colors resize-none"
                  />
                  <p className="text-white/30 text-xs mt-1">{prompt.length} caracteres</p>
                </div>

                <div className="glass rounded-xl p-4 border border-white/5">
                  <p className="text-white/50 text-xs font-medium mb-2">💡 Dicas para bons prompts:</p>
                  <ul className="text-white/35 text-xs space-y-1">
                    <li>• Mencione o estilo: fotorrealista, ilustração, arte digital</li>
                    <li>• Descreva a iluminação: estúdio, natural, dramática</li>
                    <li>• Inclua o fundo: branco, gradiente, ambiente</li>
                    <li>• Especifique ângulos: frontal, 3/4, perspectiva</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('config')}
                    className="flex-1 glass glass-hover rounded-xl py-3 text-sm font-medium transition-all"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={fetchQuestions}
                    disabled={prompt.trim().length < 10}
                    className="flex-[2] step-active glow-hover rounded-xl py-3 font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Validar com IA →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Questions */}
            {step === 'questions' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Validação com IA</h2>
                  <p className="text-white/50 text-sm">
                    Responda as perguntas para refinar sua imagem (ou deixe em branco para pular)
                  </p>
                </div>

                <div className="space-y-4">
                  {questions.map((qa, i) => (
                    <div key={i} className="glass rounded-xl p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="w-7 h-7 rounded-full step-active flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm font-medium text-white/90 leading-relaxed">{qa.question}</p>
                      </div>
                      <textarea
                        value={qa.answer}
                        onChange={e => {
                          const updated = [...questions];
                          updated[i] = { ...updated[i], answer: e.target.value };
                          setQuestions(updated);
                        }}
                        placeholder="Sua resposta (opcional)..."
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/60 transition-colors resize-none ml-10"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('prompt')}
                    className="flex-1 glass glass-hover rounded-xl py-3 text-sm font-medium transition-all"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={generateImage}
                    className="flex-[2] step-active glow-hover rounded-xl py-3 font-semibold transition-all duration-300"
                  >
                    🎨 Gerar Imagem
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Result */}
            {step === 'result' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Sua Imagem</h2>
                  <p className="text-white/50 text-sm">Adicione uma marca d&apos;água PNG (opcional)</p>
                </div>

                {/* Generated image */}
                {generatedImageB64 && (
                  <div className="relative rounded-xl overflow-hidden bg-black/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={finalImageUrl || generatedImageB64}
                      alt="Imagem gerada"
                      className="w-full h-auto"
                    />
                    {finalImageUrl && (
                      <div className="absolute top-2 right-2 bg-emerald-500/80 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium">
                        ✓ Com marca d&apos;água
                      </div>
                    )}
                  </div>
                )}

                {/* Refined prompt */}
                {refinedPrompt && (
                  <div className="glass rounded-xl p-4">
                    <p className="text-white/40 text-xs font-medium mb-1">Prompt refinado pela IA:</p>
                    <p className="text-white/60 text-xs leading-relaxed italic">&ldquo;{refinedPrompt}&rdquo;</p>
                  </div>
                )}

                {/* Watermark upload */}
                <div>
                  <p className="text-sm font-medium text-white/70 mb-3">Marca d&apos;água (PNG)</p>
                  <div
                    className={`drop-zone rounded-xl p-6 text-center cursor-pointer transition-all ${dragOver ? 'dragover' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleWatermarkFile(file);
                    }}
                  >
                    {watermarkPreview ? (
                      <div className="flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={watermarkPreview} alt="Marca d'água" className="h-16 object-contain" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-white/80">{watermarkFile?.name}</p>
                          <p className="text-white/40 text-xs">Clique para trocar</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-4xl mb-2">🖼️</p>
                        <p className="text-sm font-medium text-white/70">Arraste seu PNG aqui</p>
                        <p className="text-white/30 text-xs mt-1">ou clique para selecionar</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleWatermarkFile(f); }}
                  />
                </div>

                {/* Watermark controls */}
                {watermarkFile && (
                  <div className="glass rounded-xl p-4 space-y-4">
                    <p className="text-sm font-medium text-white/70">Ajustar marca d&apos;água</p>
                    <div>
                      <div className="flex justify-between text-xs text-white/50 mb-2">
                        <span>Opacidade</span>
                        <span>{wmOpacity}%</span>
                      </div>
                      <input
                        type="range" min={5} max={60} value={wmOpacity}
                        onChange={e => setWmOpacity(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-white/50 mb-2">
                        <span>Tamanho</span>
                        <span>{wmScale}% da imagem</span>
                      </div>
                      <input
                        type="range" min={20} max={90} value={wmScale}
                        onChange={e => setWmScale(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep('prompt');
                      setGeneratedImageB64('');
                      setFinalImageUrl('');
                      setWatermarkFile(null);
                      setWatermarkPreview('');
                      setRefinedPrompt('');
                    }}
                    className="flex-1 glass glass-hover rounded-xl py-3 text-sm font-medium transition-all"
                  >
                    ← Nova imagem
                  </button>
                  <button
                    onClick={downloadImage}
                    className="flex-[2] step-active glow-hover rounded-xl py-3 font-semibold transition-all duration-300"
                  >
                    ⬇️ Baixar imagem
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-white/20 text-xs mt-10">
        Seu token de API não é armazenado — apenas usado para chamadas diretas à {provider === 'openai' ? 'OpenAI' : 'Google'}.
      </p>
    </main>
  );
}
