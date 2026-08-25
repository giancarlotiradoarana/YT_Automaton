import { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';

const LOVE_TYPES = [
  { id: 'desamor', label: 'Desamor / Ruptura', emoji: '💔', desc: 'Cuando el amor termina y duele' },
  { id: 'no_correspondido', label: 'Amor no correspondido', emoji: '🥀', desc: 'Amar a alguien que no te ama' },
  { id: 'distancia', label: 'Amor a distancia', emoji: '✈️', desc: 'Separados pero unidos en el alma' },
  { id: 'perdido', label: 'Amor que ya fue', emoji: '🌅', desc: 'Recordar lo que tuvieron' },
  { id: 'imposible', label: 'Amor imposible', emoji: '🚫', desc: 'Querer a quien no puedes tener' },
  { id: 'traicion', label: 'Traicion / Infidelidad', emoji: '🗡️', desc: 'Cuando te rompen la confianza' },
  { id: 'despedida', label: 'Despedida final', emoji: '👋', desc: 'Decir adios para siempre' },
  { id: 'soledad', label: 'Soledad despues del amor', emoji: '🌙', desc: 'La vida sin esa persona' },
];

const STEPS = ['Tipo de Amor', 'Subir Audio', 'Crear Video', 'Resultado', 'YouTube'];

const TRENDING_TAGS = 'musica romantica, balada triste, cancion de desamor, musica para llorar, amor perdido, balada romantica 2024, musica latina, latin ballad, sad song, heartbreak, nueva musica, canciones tristes, musica en español, desamor, love song';

function YouTubeUploadStep({ videoResult, setVideoResult, songTitle }: { videoResult: any; setVideoResult: any; songTitle: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [title, setTitle] = useState(videoResult.metadata?.title || songTitle || '');
  const [description, setDescription] = useState(videoResult.metadata?.description || '');
  const [tags, setTags] = useState(TRENDING_TAGS);
  const [privacy, setPrivacy] = useState('unlisted');

  async function handleUpload() {
    if (uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      // Use local file if available (uploaded manually), otherwise use server path
      if (videoResult.localVideoFile) {
        formData.append('video', videoResult.localVideoFile);
      } else {
        formData.append('videoPath', videoResult.videoUrl);
      }
      formData.append('title', title);
      formData.append('description', description);
      formData.append('tags', tags);
      formData.append('privacyStatus', privacy);
      if (videoResult.customThumbnail) {
        formData.append('thumbnail', videoResult.customThumbnail);
      }

      const res = await fetch('/api/song/upload-youtube', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.needsAuth) {
        window.open(data.authUrl, '_blank');
        alert('Autenticate en la ventana que se abrio. Despues vuelve y dale click de nuevo a Subir a YouTube.');
      } else if (data.success) {
        setUploadedUrl(data.videoUrl);
      } else {
        alert('Error: ' + (data.message || 'Fallo la subida'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  if (uploadedUrl) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
        <h2 style={{ color: '#10b981' }}>Video subido exitosamente</h2>
        <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Tu video ya está en YouTube:</p>
        <a href={uploadedUrl} target="_blank" rel="noreferrer"
          style={{ display: 'inline-block', padding: '0.75rem 2rem', background: '#dc2626', color: 'white', borderRadius: 10, fontWeight: 700, fontSize: '1rem', textDecoration: 'none', marginBottom: '0.5rem' }}>
          ▶ Ver en YouTube
        </a>
        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.75rem', wordBreak: 'break-all' }}>{uploadedUrl}</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2>Subir a YouTube</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>TITULO:</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>DESCRIPCION:</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>TAGS (tendencias):</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={labelStyle}>PRIVACIDAD:</label>
        <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} style={inputStyle}>
          <option value="public">Publico</option>
          <option value="unlisted">No listado</option>
          <option value="private">Privado</option>
        </select>
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{
          padding: '0.75rem 2rem', borderRadius: 10, border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: '1rem', transition: 'all 0.2s',
          background: uploading ? '#7f1d1d' : '#dc2626',
          color: uploading ? '#fca5a5' : 'white',
          opacity: uploading ? 0.85 : 1,
        }}>
        {uploading ? '⏳ Subiendo a YouTube...' : '🚀 Subir a YouTube'}
      </button>
    </div>
  );
}

export default function SongPage() {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sunoDesc, setSunoDesc] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoResult, setVideoResult] = useState<any>(null);
  const [creatingVideo, setCreatingVideo] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);

  // TEST ONLY: jump directly to YouTube upload step with existing video
  function jumpToYouTubeTest() {
    setSongTitle('Cenizas y Polvo');
    setVideoResult({
      videoUrl: '/api/files/songs/song_1787696154622/music_video.mp4',
      shortUrl: '/api/files/songs/song_1787696154622/short.mp4',
      thumbnailUrl: '/api/files/songs/song_1787696154622/thumbnail.png',
      metadata: {
        title: 'Cenizas y Polvo 💔 | DESAMOR | BALADA TRISTE',
        description: 'Una balada que llega al alma.',
        hashtags: '#MusicaRomantica #Balada #Desamor',
        tags: ['musica romantica', 'balada', 'desamor'],
        bestTime: 'Viernes 6-8pm',
      },
      imagesGenerated: 6,
    });
    setStep(4);
  }

  async function handleGenerateLyrics() {
    if (!selectedType) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/song/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loveType: selectedType }),
      });
      if (!res.ok) throw await res.json();
      const data = await res.json();
      setSunoDesc(data.sunoDescription || '');
      setLyrics(data.lyrics || '');
      setStep(1); // Go to step 2
    } catch (err: any) {
      setError(err.message || 'Error generando letra');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateVideo() {
    if (!uploadedFile || !songTitle) return;
    setCreatingVideo(true);
    setError(null);
    setStep(2);
    try {
      const formData = new FormData();
      formData.append('audio', uploadedFile);
      formData.append('lyrics', lyrics);
      formData.append('title', songTitle);
      formData.append('loveType', selectedType);

      const res = await fetch('/api/song/create-video', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw await res.json();
      setVideoResult(await res.json());
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Error creando video');
    } finally {
      setCreatingVideo(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Generador de Videos Musicales</h1>

      {/* Stepper */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', margin: '2rem 0' }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: i <= step ? '#10b981' : '#6b7280', marginBottom: 4 }}>{s}</span>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i < step ? '#10b981' : i === step ? '#6366f1' : '#374151',
                color: 'white', fontWeight: 700, fontSize: '0.85rem',
                border: i === step ? '3px solid #818cf8' : 'none',
                transition: 'all 0.3s',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 60, height: 3, background: i < step ? '#10b981' : '#374151', margin: '0 8px', marginTop: 16 }} />
            )}
          </div>
        ))}
      </div>

      {error && <ErrorDisplay error={error} onRetry={() => setError(null)} />}

      {/* STEP 0: Tipo de Amor + Generar Letra */}
      {step === 0 && (
        <div style={cardStyle}>
          <h2>Elige el tipo de amor</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {LOVE_TYPES.map((type) => (
              <button key={type.id} onClick={() => setSelectedType(type.id)} style={{
                padding: '1rem', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                border: selectedType === type.id ? '2px solid #ec4899' : '1px solid #374151',
                background: selectedType === type.id ? '#500724' : '#1f2937',
              }}>
                <span style={{ fontSize: '1.5rem' }}>{type.emoji}</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 600 }}>{type.label}</p>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280' }}>{type.desc}</p>
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={handleGenerateLyrics} disabled={!selectedType || loading}>
            {loading ? 'Generando letra...' : 'Generar Letra para Suno'}
          </button>
          {loading && <LoadingSpinner message="Creando la cancion mas emotiva..." />}
        </div>
      )}

      {/* STEP 1: Copiar a Suno + Subir MP3 */}
      {step === 1 && (
        <div style={cardStyle}>
          <h2>Copia a Suno y sube el audio</h2>
          
          {/* Suno Description */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>DESCRIPCION PARA SUNO:</label>
            <div style={copyBox}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.85rem', color: '#e2e8f0' }}>{sunoDesc}</pre>
              <button style={copyBtn} onClick={() => { navigator.clipboard.writeText(sunoDesc); setCopiedDesc(true); setTimeout(() => setCopiedDesc(false), 2000); }}>
                {copiedDesc ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Lyrics */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>LETRA (copia en Suno con "+ Letra"):</label>
            <div style={copyBox}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.85rem', color: '#e2e8f0' }}>{lyrics}</pre>
              <button style={copyBtn} onClick={() => { navigator.clipboard.writeText(lyrics); setCopiedLyrics(true); setTimeout(() => setCopiedLyrics(false), 2000); }}>
                {copiedLyrics ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div style={{ background: '#1a1a2e', padding: '1rem', borderRadius: 8, border: '1px solid #6366f1', marginBottom: '1.5rem' }}>
            <p style={{ color: '#a5b4fc', margin: 0, fontSize: '0.9rem' }}>
              👉 Ve a <a href="https://suno.com" target="_blank" style={{ color: '#ec4899' }}>suno.com</a>, pega la descripcion y letra, genera y descarga el MP3.
            </p>
          </div>

          {/* Title + Upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>TITULO (el que Suno te dio):</label>
            <input type="text" value={songTitle} onChange={(e) => setSongTitle(e.target.value)}
              placeholder="Ej: Laberinto Azul" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>ARCHIVO MP3:</label>
            <input type="file" accept="audio/*" onChange={(e) => setUploadedFile(e.target.files?.[0] || null)} />
            {uploadedFile && <p style={{ color: '#10b981', marginTop: '0.5rem' }}>✓ {uploadedFile.name}</p>}
          </div>

          <button className="btn-primary" onClick={handleCreateVideo} disabled={!uploadedFile || !songTitle || creatingVideo}>
            {creatingVideo ? 'Creando video...' : 'Crear Video'}
          </button>
        </div>
      )}

      {/* STEP 2: Creating Video (loading) */}
      {step === 2 && (
        <div style={cardStyle}>
          <h2>Creando tu video musical...</h2>
          <LoadingSpinner message="Generando imagenes con IA + compilando video (3-5 min)..." />
          <p style={{ color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>
            Generando imagenes para cada seccion de la cancion, aplicando efectos cinematograficos y sincronizando subtitulos.
          </p>
        </div>
      )}

      {/* STEP 3: Result */}
      {step === 3 && videoResult && (
        <div style={cardStyle}>
          <h2>Video Listo! 🎬</h2>
          <p style={{ color: '#10b981' }}>{videoResult.imagesGenerated} imagenes generadas con IA</p>
          
          <video controls style={{ width: '100%', maxHeight: 400, borderRadius: 8, background: '#000', marginBottom: '1rem' }}>
            <source src={videoResult.videoUrl} type="video/mp4" />
          </video>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <a href={videoResult.videoUrl} download style={dlBtn}>Descargar Video</a>
            {videoResult.shortUrl && <a href={videoResult.shortUrl} download style={dlBtn}>Descargar Short/Reel</a>}
          </div>

          {/* Thumbnail - Manual upload with suggested prompt */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1f2937', borderRadius: 8, border: '1px solid #374151' }}>
            <h3 style={{ color: '#a78bfa' }}>Miniatura</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Usa este prompt en <a href="https://chatgpt.com" target="_blank" style={{ color: '#ec4899' }}>ChatGPT</a> o <a href="https://grok.com" target="_blank" style={{ color: '#ec4899' }}>Grok</a> para crear la miniatura:
            </p>
            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: 8, position: 'relative', marginBottom: '1rem' }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.8rem', color: '#e2e8f0' }}>
{`Create a professional YouTube thumbnail for a romantic song called "${songTitle || 'My Song'}".

Include:
- A beautiful couple with emotional expressions (him looking at the horizon, her with a tear rolling down)
- Cinematic dramatic sunset background with warm colors (gold, orange, pink, purple)
- Golden hour lighting with lens flare and bokeh
- The title "${songTitle || 'My Song'}" in large elegant script font with glow effect
- Movie poster composition style, rule of thirds
- Ultra HD quality, hyper realistic, shallow depth of field
- Dramatic clouds, rain particles visible in golden light`}
              </pre>
              <button style={{ position: 'absolute', top: 8, right: 8, padding: '0.3rem 0.75rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => { navigator.clipboard.writeText(`Create a professional YouTube thumbnail for a romantic song called "${songTitle}". Include: a beautiful couple with emotional expressions, cinematic dramatic sunset background, golden hour lighting with lens flare, the title "${songTitle}" in large elegant script font, movie poster composition, ultra HD hyper realistic, dramatic clouds and rain in golden light.`); alert('Prompt copiado!'); }}>
                Copiar Prompt
              </button>
            </div>

            {/* Upload custom thumbnail */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.75rem' }}>SUBE TU MINIATURA:</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', background: '#6366f1', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'background 0.2s' }}>
                📁 Seleccionar Imagen
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setVideoResult((prev: any) => ({ ...prev, customThumbnail: file, customThumbnailPreview: URL.createObjectURL(file) }));
                  }
                }} />
              </label>
              {videoResult.customThumbnailPreview && (
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: '0.5rem' }}>✓ Miniatura cargada:</p>
                  <img src={videoResult.customThumbnailPreview} alt="Tu miniatura" style={{ width: 320, borderRadius: 8, border: '2px solid #10b981' }} />
                </div>
              )}
              {!videoResult.customThumbnailPreview && (
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Tamaño recomendado: 1280×720px (JPG o PNG)
                </p>
              )}
            </div>
          </div>

          {videoResult.metadata && (
            <div style={{ padding: '1rem', background: '#1f2937', borderRadius: 8 }}>
              <h3 style={{ color: '#a78bfa' }}>Metadata YouTube</h3>
              <p style={{ color: '#e5e7eb', fontWeight: 600, fontSize: '1.1rem' }}>{videoResult.metadata.title}</p>
              <pre style={{ color: '#9ca3af', fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{videoResult.metadata.description}</pre>
              <p style={{ color: '#60a5fa', fontSize: '0.8rem', marginTop: '1rem' }}>{videoResult.metadata.hashtags}</p>
              {videoResult.metadata.tags && (
                <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>Tags: {Array.isArray(videoResult.metadata.tags) ? videoResult.metadata.tags.join(', ') : videoResult.metadata.tags}</p>
              )}
              {videoResult.metadata.bestTime && (
                <p style={{ color: '#fbbf24', fontSize: '0.8rem' }}>Mejor hora para publicar: {videoResult.metadata.bestTime}</p>
              )}
              <button style={{ marginTop: '0.5rem', background: '#374151', border: '1px solid #4b5563', padding: '0.4rem 1rem', borderRadius: 6, color: '#e5e7eb', cursor: 'pointer' }}
                onClick={() => { navigator.clipboard.writeText(`${videoResult.metadata.title}\n\n${videoResult.metadata.description}\n\n${videoResult.metadata.hashtags}`); alert('Copiado!'); }}>
                Copiar Metadata
              </button>
            </div>
          )}

          <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={() => { setStep(0); setVideoResult(null); setSongTitle(''); setUploadedFile(null); }}>
            Crear Otro Video
          </button>
          <button style={{ marginTop: '1rem', marginLeft: '1rem', padding: '0.6rem 1.5rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setStep(4)}>
            Subir a YouTube
          </button>
        </div>
      )}

      {/* STEP 4: Upload to YouTube */}
      {step === 4 && videoResult && (
        <YouTubeUploadStep
          videoResult={videoResult}
          setVideoResult={setVideoResult}
          songTitle={songTitle}
        />
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };
const labelStyle: React.CSSProperties = { display: 'block', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' };
const copyBox: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '1rem', position: 'relative', color: '#e2e8f0' };
const copyBtn: React.CSSProperties = { position: 'absolute', top: 8, right: 8, padding: '0.3rem 0.75rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.7rem', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#e5e7eb' };
const dlBtn: React.CSSProperties = { padding: '0.5rem 1.5rem', background: '#10b981', color: 'white', borderRadius: 8, textDecoration: 'none', fontWeight: 600 };
