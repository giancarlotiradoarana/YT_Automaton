import { useState, useEffect } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';

interface Story {
  title: string;
  hook: string;
  fullText: string;
  category: string;
  estimatedDuration: number;
  shortClipText: string;
}

export default function StoryDemoPage() {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState<'short' | 'medium' | 'long'>('medium');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [trending, setTrending] = useState<any[]>([]);
  const [trendingDate, setTrendingDate] = useState('');
  const [loadingTrending, setLoadingTrending] = useState(true);

  // Load trending categories on mount
  useEffect(() => {
    fetch('/api/story/trending')
      .then(res => res.json())
      .then(data => {
        setTrending(data.trending || []);
        setTrendingDate(data.date || '');
        setLoadingTrending(false);
      })
      .catch(() => setLoadingTrending(false));
  }, []);

  async function handleGenerateAndCreate() {
    setLoading(true);
    setError(null);
    setSelectedStory(null);
    setResult(null);
    try {
      // Step 1: Generate the best story
      const res = await fetch('/api/story/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category || undefined, duration, count: 1 }),
      });
      if (!res.ok) throw await res.json();
      const data = await res.json();
      const story = data.stories?.[0];
      if (!story) throw { message: 'No se pudo generar la historia' };
      setSelectedStory(story);
      setLoading(false);

      // Step 2: Create video automatically
      setCreating(true);
      const videoRes = await fetch('/api/story/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story,
          format: duration === 'short' ? 'short' : 'long',
        }),
      });
      if (!videoRes.ok) throw await videoRes.json();
      const videoData = await videoRes.json();
      setResult(videoData);
    } catch (err: any) {
      setError(err.message || 'Error en el proceso');
    } finally {
      setLoading(false);
      setCreating(false);
    }
  }

  async function handleGenerateStories() {
    await handleGenerateAndCreate();
  }

  async function handleCreateVideo() {
    if (!selectedStory) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/story/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story: selectedStory,
          format: duration === 'short' ? 'short' : 'long',
        }),
      });
      if (!res.ok) throw await res.json();
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message || 'Error creando video');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <h1>Demo: Storytelling Video Generator</h1>
      <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
        Genera historias virales tipo confesiones/Reddit y crea videos automaticamente.
      </p>

      {/* Trending Categories */}
      {trending.length > 0 && (
        <div style={{ ...cardStyle, borderColor: '#6366f1' }}>
          <h2 style={{ color: '#a78bfa' }}>
            🔥 En Tendencia — {trendingDate}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Categorias que mas vistas estan generando hoy en YouTube:
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {trending.map((item: any, i: number) => (
              <button
                key={i}
                onClick={() => setCategory(item.category)}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: 20,
                  border: category === item.category ? '2px solid #6366f1' : '1px solid #4b5563',
                  background: category === item.category ? '#312e81' : '#1f2937',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                }}
                title={item.reason}
              >
                {item.category} <span style={{ color: '#fbbf24' }}>⭐{item.score}/10</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {loadingTrending && <LoadingSpinner message="Analizando tendencias de YouTube..." />}

      {/* Step 1: Configure and Generate */}
      <div style={cardStyle}>
        <h2>1. Configuracion</h2>
        {category && (
          <p style={{ color: '#a78bfa', marginBottom: '1rem' }}>
            Categoria seleccionada: <strong>{category}</strong>
          </p>
        )}
        {!category && (
          <p style={{ color: '#f87171', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            👆 Selecciona una categoria de tendencia arriba
          </p>
        )}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={duration} onChange={(e) => setDuration(e.target.value as any)} style={selectStyle}>
            <option value="short">Short/Reel (60s)</option>
            <option value="medium">Medio (3-5 min)</option>
            <option value="long">Largo (10-15 min)</option>
          </select>
          <button className="btn-primary" onClick={handleGenerateAndCreate} disabled={loading || creating || !category}>
            {loading ? 'Generando historia...' : creating ? 'Creando video...' : 'Generar Video'}
          </button>
        </div>
        {(loading || creating) && (
          <LoadingSpinner message={loading ? 'AI eligiendo la mejor historia viral...' : 'Generando voz + fondo + compilando video...'} />
        )}
      </div>

      {loading && <LoadingSpinner message="AI eligiendo la mejor historia viral..." />}
      {error && <ErrorDisplay error={error} onRetry={handleGenerateAndCreate} />}

      {/* Story Preview (shows after generation) */}
      {selectedStory && !result && !creating && (
        <div style={cardStyle}>
          <h2>Historia Generada</h2>
          <h3 style={{ color: '#a78bfa' }}>{selectedStory.title}</h3>
          <p style={{ color: '#d1d5db', fontStyle: 'italic' }}>"{selectedStory.hook}"</p>
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            {selectedStory.fullText.slice(0, 300)}...
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            Categoria: {selectedStory.category} | Duracion estimada: ~{selectedStory.estimatedDuration}s
          </p>
        </div>
      )}

      {/* Step 4: Result */}
      {result && (
        <div style={cardStyle}>
          <h2>Video Listo!</h2>
          <div style={{ marginBottom: '2rem' }}>
            <h3>Video Largo</h3>
            <video controls style={{ width: '100%', maxHeight: 400, borderRadius: 8, background: '#000' }}>
              <source src={result.video.url} type="video/mp4" />
            </video>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                Duracion: {result.video.durationSeconds?.toFixed(1)}s
              </span>
              <a
                href={result.video.url}
                download={`video_largo_${Date.now()}.mp4`}
                style={downloadBtnStyle}
              >
                Descargar Video Largo
              </a>
            </div>
          </div>

          {result.short && (
            <div>
              <h3>Short / Reel (mejores escenas)</h3>
              <video controls style={{ width: '100%', maxHeight: 400, borderRadius: 8, background: '#000' }}>
                <source src={result.short.url} type="video/mp4" />
              </video>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  Duracion: {result.short.durationSeconds}s
                </span>
                <a
                  href={result.short.url}
                  download={`short_reel_${Date.now()}.mp4`}
                  style={downloadBtnStyle}
                >
                  Descargar Short/Reel
                </a>
              </div>
            </div>
          )}

          {/* YouTube Metadata */}
          {result.metadata && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#1f2937', borderRadius: 8, border: '1px solid #374151' }}>
              <h3 style={{ color: '#a78bfa', marginBottom: '1rem' }}>Metadata para YouTube</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#9ca3af', fontSize: '0.8rem' }}>TITULO (video largo):</label>
                <p style={{ color: '#e5e7eb', fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0' }}>
                  {result.metadata.title}
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#9ca3af', fontSize: '0.8rem' }}>TITULO (short/reel):</label>
                <p style={{ color: '#e5e7eb', margin: '0.25rem 0' }}>
                  {result.metadata.shortTitle}
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#9ca3af', fontSize: '0.8rem' }}>DESCRIPCION:</label>
                <p style={{ color: '#d1d5db', fontSize: '0.9rem', whiteSpace: 'pre-wrap', margin: '0.25rem 0' }}>
                  {result.metadata.description}
                </p>
              </div>

              <div>
                <label style={{ color: '#9ca3af', fontSize: '0.8rem' }}>HASHTAGS:</label>
                <p style={{ color: '#60a5fa', fontSize: '0.85rem', margin: '0.25rem 0' }}>
                  {result.metadata.hashtags?.join(' ')}
                </p>
              </div>

              <button
                style={{ marginTop: '1rem', background: '#374151', border: '1px solid #4b5563', padding: '0.5rem 1rem', borderRadius: 6, color: '#e5e7eb', cursor: 'pointer' }}
                onClick={() => {
                  const text = `${result.metadata.title}\n\n${result.metadata.description}\n\n${result.metadata.hashtags?.join(' ')}`;
                  navigator.clipboard.writeText(text);
                  alert('Copiado al portapapeles!');
                }}
              >
                Copiar Todo al Portapapeles
              </button>
            </div>
          )}

          {/* Thumbnails */}
          {result.thumbnails && (result.thumbnails.long || result.thumbnails.short) && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#1f2937', borderRadius: 8, border: '1px solid #374151' }}>
              <h3 style={{ color: '#a78bfa', marginBottom: '1rem' }}>Miniaturas</h3>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {result.thumbnails.long && (
                  <div>
                    <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Video Largo (16:9)</p>
                    <img src={result.thumbnails.long} alt="Miniatura largo" style={{ width: 320, borderRadius: 8, border: '1px solid #4b5563' }} />
                    <br />
                    <a href={result.thumbnails.long} download="thumbnail_largo.png" style={downloadBtnStyle}>
                      Descargar
                    </a>
                  </div>
                )}
                {result.thumbnails.short && (
                  <div>
                    <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Short/Reel (9:16)</p>
                    <img src={result.thumbnails.short} alt="Miniatura short" style={{ width: 180, borderRadius: 8, border: '1px solid #4b5563' }} />
                    <br />
                    <a href={result.thumbnails.short} download="thumbnail_short.png" style={downloadBtnStyle}>
                      Descargar
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            <button className="btn-primary" onClick={handleGenerateAndCreate}>
              Generar Otro Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const downloadBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.5rem 1rem',
  background: '#10b981',
  color: 'white',
  borderRadius: 8,
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const cardStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 12,
  padding: '1.5rem',
  marginBottom: '1.5rem',
};

const selectStyle: React.CSSProperties = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '0.5rem 1rem',
  color: '#e5e7eb',
};

const storyCardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.2s',
};
