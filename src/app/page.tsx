'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

type Provider = 'openai' | 'gemini';
type Mode = 'ai' | 'watermark';
type Step = 'config' | 'prompt' | 'questions' | 'result';

interface QA { question: string; answer: string; }

const AI_STEPS: { id: Step; label: string }[] = [
  { id: 'config',    label: 'IA'        },
  { id: 'prompt',    label: 'Prompt'    },
  { id: 'questions', label: 'Validação' },
  { id: 'result',    label: 'Resultado' },
];

/* ─── Spinner ─── */
function Spinner({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-14">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-[3px] border-white/8" />
        <div className="absolute inset-0 rounded-full border-[3px] border-t-violet-400 spin" />
        <div className="absolute inset-[5px] rounded-full border-2 border-t-indigo-300 spin-r" />
      </div>
      <p className="text-sm text-white/40 tracking-wide">{msg}</p>
    </div>
  );
}

/* ─── Progress Bar ─── */
function ProgressBar({ current }: { current: Step }) {
  const idx = AI_STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center justify-center mb-10">
      {AI_STEPS.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`step-dot ${done ? 'done' : active ? 'active' : 'pending'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-semibold tracking-widest uppercase transition-colors ${
                active ? 'text-violet-400' : done ? 'text-emerald-400' : 'text-white/20'
              }`}>{s.label}</span>
            </div>
            {i < AI_STEPS.length - 1 && (
              <div className={`step-line mx-2 ${done ? 'bg-emerald-400/40' : 'bg-white/8'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── Error Banner ─── */
function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="error-box p-4 mb-6 flex items-start gap-3 fade-up">
      <span className="text-red-400 mt-0.5">⚠</span>
      <p className="text-red-300/90 text-sm flex-1 leading-relaxed">{msg}</p>
      <button onClick={onClose} className="text-red-400/40 hover:text-red-400 transition-colors text-lg leading-none">×</button>
    </div>
  );
}

/* ─── Watermark Controls (shared) ─── */
function WatermarkPanel({
  baseUrl, wmFile, wmPreview, opacity, scale, finalUrl,
  dragOver, inputRef,
  onOpacity, onScale, onFile, onDragOver, onDragLeave, onDrop,
  onDownload, onBack, backLabel,
}: {
  baseUrl: string; wmFile: File | null; wmPreview: string;
  opacity: number; scale: number; finalUrl: string;
  dragOver: boolean; inputRef: React.RefObject<HTMLInputElement | null>;
  onOpacity: (v: number) => void; onScale: (v: number) => void;
  onFile: (f: File) => void; onDragOver: () => void; onDragLeave: () => void;
  onDrop: (f: File) => void; onDownload: () => void;
  onBack: () => void; backLabel: string;
}) {
  return (
    <div className="space-y-5 fade-up">
      {/* Preview */}
      {baseUrl && (
        <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={finalUrl || baseUrl} alt="Preview" className="w-full h-auto max-h-[440px] object-contain bg-black/40" />
          {finalUrl && (
            <div className="absolute top-3 right-3 success-badge px-3 py-1 text-xs font-semibold text-emerald-300">
              ✓ Marca aplicada
            </div>
          )}
        </div>
      )}

      {/* Watermark upload */}
      <div>
        <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">Marca d&apos;água</p>
        <div
          className={`drop-skeu p-6 text-center ${dragOver ? 'active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); onDragOver(); }}
          onDragLeave={onDragLeave}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }}
        >
          {wmPreview ? (
            <div className="flex items-center gap-4 justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wmPreview} alt="wm" className="h-12 object-contain opacity-80" />
              <div className="text-left">
                <p className="text-sm font-medium text-white/70">{wmFile?.name}</p>
                <p className="text-xs text-white/25 mt-0.5">Clique para trocar</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-3xl mb-2 opacity-30">⬡</p>
              <p className="text-sm text-white/35 font-medium">Arraste o PNG da marca</p>
              <p className="text-xs text-white/18 mt-1">ou clique para selecionar</p>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>

      {/* Sliders */}
      {wmFile && (
        <div className="glass-inner p-5 space-y-5 fade-up">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Ajustes</p>
          {[
            { label: 'Opacidade', val: opacity, set: onOpacity, min: 3, max: 60, unit: '%' },
            { label: 'Tamanho',   val: scale,   set: onScale,   min: 15, max: 90, unit: '% da imagem' },
          ].map(({ label, val, set, min, max, unit }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs text-white/45 font-medium">{label}</span>
                <span className="text-xs text-violet-400 font-semibold tabular-nums">{val}{unit}</span>
              </div>
              <input type="range" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))} />
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className="btn-secondary flex-1 py-3 text-sm">{backLabel}</button>
        <button onClick={onDownload} disabled={!baseUrl} className="btn-primary flex-[2] py-3 text-sm">
          Baixar imagem
        </button>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function Home() {
  const [mode, setMode]   = useState<Mode | null>(null);
  const [step, setStep]   = useState<Step>('config');
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey]     = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [prompt, setPrompt]     = useState('');
  const [questions, setQuestions] = useState<QA[]>([]);
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [loading, setLoading]   = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError]       = useState('');

  const [baseUrl, setBaseUrl]         = useState('');
  const [wmFile, setWmFile]           = useState<File | null>(null);
  const [wmPreview, setWmPreview]     = useState('');
  const [finalUrl, setFinalUrl]       = useState('');
  const [opacity, setOpacity]         = useState(18);
  const [scale, setScale]             = useState(50);
  const [dragOver, setDragOver]       = useState(false);
  const [dragOverBase, setDragOverBase] = useState(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wmInputRef  = useRef<HTMLInputElement>(null);
  const baseInputRef = useRef<HTMLInputElement>(null);

  const applyWatermark = useCallback(() => {
    if (!baseUrl || !wmFile) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;

    const base = new Image(); base.src = baseUrl;
    base.onload = () => {
      canvas.width  = base.naturalWidth  || 1024;
      canvas.height = base.naturalHeight || 1024;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);

      const wmUrl = URL.createObjectURL(wmFile);
      const wm = new Image(); wm.src = wmUrl;
      wm.onload = () => {
        const maxW = canvas.width  * (scale / 100);
        const maxH = canvas.height * (scale / 100);
        const s = Math.min(maxW / wm.naturalWidth, maxH / wm.naturalHeight);
        const w = wm.naturalWidth * s, h = wm.naturalHeight * s;
        const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;

        ctx.save();
        ctx.shadowColor   = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur    = 28;
        ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 6;
        ctx.globalAlpha   = opacity / 100;
        ctx.drawImage(wm, x, y, w, h);
        ctx.restore();

        setFinalUrl(canvas.toDataURL('image/png'));
        URL.revokeObjectURL(wmUrl);
      };
    };
  }, [baseUrl, wmFile, opacity, scale]);

  useEffect(() => { if (baseUrl && wmFile) applyWatermark(); }, [baseUrl, wmFile, opacity, scale, applyWatermark]);

  const handleWmFile = (f: File) => {
    if (!f.type.includes('image/')) return;
    setWmFile(f);
    if (wmPreview) URL.revokeObjectURL(wmPreview);
    setWmPreview(URL.createObjectURL(f));
    setFinalUrl('');
  };

  const handleBaseFile = (f: File) => {
    if (!f.type.includes('image/')) return;
    const r = new FileReader();
    r.onload = e => { setBaseUrl(e.target?.result as string); setFinalUrl(''); };
    r.readAsDataURL(f);
  };

  const fetchQuestions = async () => {
    if (!apiKey.trim()) { setError('Insira seu token de API.'); return; }
    setError(''); setLoading(true); setLoadingMsg('Analisando prompt…');
    try {
      const res = await fetch('/api/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token: apiKey, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions.map((q: string) => ({ question: q, answer: '' })));
      setStep('questions');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao gerar perguntas.'); }
    finally { setLoading(false); }
  };

  const generateImage = async () => {
    setError(''); setLoading(true); setLoadingMsg('Refinando prompt…');
    const t = setTimeout(() => setLoadingMsg('Gerando imagem (20–30s)…'), 3500);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token: apiKey, prompt, answers: questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBaseUrl(data.imageUrl); setRefinedPrompt(data.refinedPrompt); setStep('result');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao gerar imagem.'); }
    finally { clearTimeout(t); setLoading(false); }
  };

  const download = () => {
    const url = finalUrl || baseUrl; if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = `imagem-${Date.now()}.png`; a.click();
  };

  const reset = () => {
    setBaseUrl(''); setFinalUrl(''); setWmFile(null); setWmPreview('');
    setRefinedPrompt(''); setPrompt(''); setQuestions([]); setError('');
  };

  /* ─── Render ─── */
  return (
    <main className="min-h-screen py-12 px-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="icon-badge w-11 h-11 flex items-center justify-center text-xl">✦</div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-300 via-purple-200 to-indigo-300 bg-clip-text text-transparent">
            Image Studio
          </h1>
        </div>
        <p className="text-sm text-white/28 max-w-xs mx-auto leading-relaxed">
          Geração com IA e marca d&apos;água profissional
        </p>
      </header>

      <div className="max-w-xl mx-auto">

        {/* ── MODE SELECTOR ── */}
        {!mode && (
          <div className="fade-up space-y-4">
            <p className="text-center text-xs font-semibold text-white/25 uppercase tracking-widest mb-8">
              Escolha o modo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  id: 'ai' as Mode,
                  icon: '⬡',
                  title: 'Gerar com IA',
                  desc: 'Descreva e a IA cria sua imagem',
                  tags: ['DALL-E 3', 'Imagen 3'],
                },
                {
                  id: 'watermark' as Mode,
                  icon: '◈',
                  title: 'Marca d\'Água',
                  desc: 'Carregue sua imagem e aplique o logo',
                  tags: ['PNG · JPG · WEBP', 'Sem IA'],
                },
              ].map(({ id, icon, title, desc, tags }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className="glass-select p-7 flex flex-col items-start gap-4 text-left"
                >
                  <div className="text-2xl opacity-50">{icon}</div>
                  <div>
                    <p className="font-semibold text-base text-white/85">{title}</p>
                    <p className="text-xs text-white/30 mt-1 leading-relaxed">{desc}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {tags.map(t => <span key={t} className="tag">{t}</span>)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── WATERMARK ONLY MODE ── */}
        {mode === 'watermark' && (
          <div className="fade-up">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => { setMode(null); reset(); }}
                className="text-xs text-white/25 hover:text-white/55 transition-colors tracking-wide">
                ← Voltar
              </button>
              <div className="flex-1 h-px bg-white/6" />
              <span className="text-xs text-white/18 uppercase tracking-widest">Marca d&apos;Água</span>
            </div>

            <div className="glass-card p-7">
              {!baseUrl ? (
                <div className="space-y-5 fade-up">
                  <div>
                    <p className="font-semibold text-base text-white/85 mb-1">Sua imagem</p>
                    <p className="text-xs text-white/30">Carregue a imagem que receberá a marca</p>
                  </div>
                  <div
                    className={`drop-skeu p-14 text-center ${dragOverBase ? 'active' : ''}`}
                    onClick={() => baseInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOverBase(true); }}
                    onDragLeave={() => setDragOverBase(false)}
                    onDrop={e => { e.preventDefault(); setDragOverBase(false); const f = e.dataTransfer.files[0]; if (f) handleBaseFile(f); }}
                  >
                    <p className="text-4xl mb-3 opacity-20">⬡</p>
                    <p className="text-sm text-white/35 font-medium">Arraste a imagem aqui</p>
                    <p className="text-xs text-white/18 mt-1.5">PNG · JPG · WEBP</p>
                  </div>
                  <input ref={baseInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleBaseFile(f); }} />
                </div>
              ) : (
                <WatermarkPanel
                  baseUrl={baseUrl} wmFile={wmFile} wmPreview={wmPreview}
                  opacity={opacity} scale={scale} finalUrl={finalUrl}
                  dragOver={dragOver} inputRef={wmInputRef}
                  onOpacity={setOpacity} onScale={setScale} onFile={handleWmFile}
                  onDragOver={() => setDragOver(true)} onDragLeave={() => setDragOver(false)} onDrop={handleWmFile}
                  onDownload={download}
                  onBack={() => { setBaseUrl(''); setFinalUrl(''); setWmFile(null); setWmPreview(''); }}
                  backLabel="← Trocar imagem"
                />
              )}
            </div>
          </div>
        )}

        {/* ── AI MODE ── */}
        {mode === 'ai' && (
          <div className="fade-up">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => { setMode(null); reset(); setStep('config'); }}
                className="text-xs text-white/25 hover:text-white/55 transition-colors tracking-wide">
                ← Voltar
              </button>
              <div className="flex-1 h-px bg-white/6" />
              <span className="text-xs text-white/18 uppercase tracking-widest">Gerar com IA</span>
            </div>

            <ProgressBar current={step} />

            {error && <ErrorBanner msg={error} onClose={() => setError('')} />}
            {loading && <Spinner msg={loadingMsg} />}

            {!loading && (
              <div className="glass-card p-7">

                {/* Step 1 — Config */}
                {step === 'config' && (
                  <div className="space-y-6 fade-up">
                    <div>
                      <p className="font-semibold text-base text-white/85">Configurar IA</p>
                      <p className="text-xs text-white/30 mt-1">Escolha o provedor e insira seu token</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(['openai', 'gemini'] as Provider[]).map(p => (
                        <button key={p} onClick={() => setProvider(p)}
                          className={`glass-select p-4 flex flex-col items-start gap-2 ${provider === p ? 'selected' : ''}`}>
                          <span className="text-lg opacity-40">{p === 'openai' ? '◻' : '◈'}</span>
                          <span className="font-semibold text-sm text-white/80">{p === 'openai' ? 'OpenAI' : 'Gemini'}</span>
                          <span className="text-[10px] text-white/28">
                            {p === 'openai' ? 'GPT-4o · DALL-E 3' : 'Gemini 2.5 · Imagen 3'}
                          </span>
                          {provider === p && <span className="text-[10px] text-violet-400 font-semibold">✓ selecionado</span>}
                        </button>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">
                        {provider === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
                      </p>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={apiKey} onChange={e => setApiKey(e.target.value)}
                          placeholder={provider === 'openai' ? 'sk-…' : 'AIza…'}
                          className="input-skeu pr-12"
                        />
                        <button onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/45 transition-colors text-base">
                          {showKey ? '○' : '●'}
                        </button>
                      </div>
                      <p className="text-[11px] text-white/18 mt-2 leading-relaxed">
                        Token não é armazenado — usado apenas para chamadas diretas à API.
                        {provider === 'openai' && ' DALL-E 3 tem custo por geração (~$0.04).'}
                      </p>
                    </div>

                    <button onClick={() => { setError(''); setStep('prompt'); }} disabled={!apiKey.trim()}
                      className="btn-primary w-full py-3 text-sm">
                      Continuar →
                    </button>
                  </div>
                )}

                {/* Step 2 — Prompt */}
                {step === 'prompt' && (
                  <div className="space-y-6 fade-up">
                    <div>
                      <p className="font-semibold text-base text-white/85">Descreva sua imagem</p>
                      <p className="text-xs text-white/30 mt-1">Quanto mais detalhes, melhor o resultado</p>
                    </div>

                    <div>
                      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
                        placeholder="Ex: produto automotivo em fundo branco, iluminação de estúdio, foto de catálogo…"
                        className="input-skeu resize-none" style={{ borderRadius: '14px' }}
                      />
                      <p className="text-[11px] text-white/18 mt-1.5 text-right">{prompt.length} caracteres</p>
                    </div>

                    <div className="glass-inner p-4">
                      <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Dicas</p>
                      <ul className="text-[11px] text-white/30 space-y-1.5 leading-relaxed">
                        <li>· Estilo — fotorrealista, ilustração, arte digital</li>
                        <li>· Iluminação — estúdio, natural, dramática, contra-luz</li>
                        <li>· Fundo — branco, gradiente, ambiente específico</li>
                        <li>· Ângulo — frontal, 3/4, perspectiva isométrica</li>
                      </ul>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep('config')} className="btn-secondary flex-1 py-3 text-sm">← Voltar</button>
                      <button onClick={fetchQuestions} disabled={prompt.trim().length < 10}
                        className="btn-primary flex-[2] py-3 text-sm">Validar com IA →</button>
                    </div>
                  </div>
                )}

                {/* Step 3 — Questions */}
                {step === 'questions' && (
                  <div className="space-y-6 fade-up">
                    <div>
                      <p className="font-semibold text-base text-white/85">Validação</p>
                      <p className="text-xs text-white/30 mt-1">Respostas opcionais — deixe em branco para pular</p>
                    </div>

                    <div className="space-y-3">
                      {questions.map((qa, i) => (
                        <div key={i} className="glass-inner p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="step-dot active w-6 h-6 text-[10px] shrink-0 mt-0.5">{i + 1}</span>
                            <p className="text-sm text-white/75 leading-relaxed">{qa.question}</p>
                          </div>
                          <textarea value={qa.answer} rows={2} placeholder="Sua resposta…"
                            onChange={e => {
                              const u = [...questions]; u[i] = { ...u[i], answer: e.target.value }; setQuestions(u);
                            }}
                            className="input-skeu resize-none ml-9" style={{ borderRadius: '10px' }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep('prompt')} className="btn-secondary flex-1 py-3 text-sm">← Voltar</button>
                      <button onClick={generateImage} className="btn-primary flex-[2] py-3 text-sm">Gerar Imagem</button>
                    </div>
                  </div>
                )}

                {/* Step 4 — Result */}
                {step === 'result' && (
                  <div className="space-y-5 fade-up">
                    <div>
                      <p className="font-semibold text-base text-white/85">Imagem gerada</p>
                      <p className="text-xs text-white/30 mt-1">Adicione marca d&apos;água ou baixe direto</p>
                    </div>

                    {refinedPrompt && (
                      <div className="glass-inner p-4">
                        <p className="text-[10px] font-semibold text-white/22 uppercase tracking-widest mb-1.5">Prompt refinado</p>
                        <p className="text-xs text-white/40 leading-relaxed italic">&ldquo;{refinedPrompt}&rdquo;</p>
                      </div>
                    )}

                    <WatermarkPanel
                      baseUrl={baseUrl} wmFile={wmFile} wmPreview={wmPreview}
                      opacity={opacity} scale={scale} finalUrl={finalUrl}
                      dragOver={dragOver} inputRef={wmInputRef}
                      onOpacity={setOpacity} onScale={setScale} onFile={handleWmFile}
                      onDragOver={() => setDragOver(true)} onDragLeave={() => setDragOver(false)} onDrop={handleWmFile}
                      onDownload={download}
                      onBack={() => { setStep('prompt'); setBaseUrl(''); setFinalUrl(''); setWmFile(null); setWmPreview(''); setRefinedPrompt(''); }}
                      backLabel="← Nova imagem"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="text-center mt-14">
        <p className="text-[11px] text-white/14 tracking-wide">
          Tokens não são armazenados · Processamento direto via API
        </p>
      </footer>
    </main>
  );
}
