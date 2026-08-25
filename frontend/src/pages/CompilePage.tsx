import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineState, CompilationResult } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function CompilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        if (state.video) setResult(state.video);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  async function handleCompile() {
    if (!id) return;
    setCompiling(true);
    setError(null);
    try {
      const state = await api.getProjectState(id) as any;
      
      const images = state.images || [];
      const voice = state.voice || null;
      const format = state.format || 'long_video';
      
      if (!voice || !voice.audioPath) {
        setError('No se encontro la narracion. Genera la voz primero.');
        setCompiling(false);
        return;
      }

      if (images.length === 0) {
        setError('No se encontraron imagenes. Genera las imagenes primero.');
        setCompiling(false);
        return;
      }

      const inputs = {
        images,
        audioPath: voice.audioPath,
        subtitlePath: voice.subtitlePath || '',
        format,
        audioDuration: voice.durationSeconds || 0,
      };

      const compilationResult = await api.compileVideo(id, inputs);
      setResult(compilationResult);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al compilar video';
      setError(msg);
    } finally {
      setCompiling(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {project && id && (
        <PipelineStages
          projectId={id}
          stages={project.stages}
          currentStage={project.currentStage}
        />
      )}

      <h1 style={styles.title}>Compilacion de Video</h1>

      {error && <ErrorDisplay error={error} onRetry={handleCompile} />}

      {!result && !compiling && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            Combina imagenes, narracion y subtitulos en un video final.
          </p>
          <button className="btn-primary" onClick={handleCompile}>
            Compilar Video
          </button>
        </div>
      )}

      {compiling && (
        <div style={styles.progressContainer}>
          <LoadingSpinner message="Compilando video con Sensei Gian" />
          <div style={styles.progressBar}>
            <div style={styles.progressFill} />
          </div>
        </div>
      )}

      {result && (
        <div style={styles.resultCard}>
          <h3 style={styles.resultTitle}>Video Compilado</h3>
          <div style={styles.videoContainer}>
            <video controls style={styles.videoPlayer}>
              <source src={`/api/files/${result.videoPath.split(/[/\\]output[/\\]/)[1] || result.videoPath.split(/[/\\]/).slice(-1)[0]}`} type="video/mp4" />
              Tu navegador no soporta video.
            </video>
          </div>
          <div style={styles.resultMeta}>
            <span>Duracion: {result.durationSeconds.toFixed(1)}s</span>
            <span>Tamano: {(result.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <div style={styles.actions}>
            <button className="btn-secondary" onClick={handleCompile} disabled={compiling}>
              Recompilar
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate(`/project/${id}/thumbnail`)}
            >
              Continuar a Miniatura
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { marginBottom: '1rem', marginTop: '1rem' },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  emptyText: { color: 'var(--color-text-muted)', marginBottom: '1rem' },
  progressContainer: { textAlign: 'center' },
  progressBar: {
    width: '100%',
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    marginTop: '1rem',
    overflow: 'hidden',
  },
  progressFill: {
    width: '60%',
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '2px',
    animation: 'pulse 2s ease-in-out infinite',
  },
  resultCard: {
    padding: '1.5rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success)',
  },
  resultTitle: { marginBottom: '1rem' },
  videoContainer: { marginBottom: '1rem' },
  videoPlayer: {
    width: '100%',
    maxHeight: '400px',
    borderRadius: 'var(--radius-sm)',
    background: '#000',
  },
  resultMeta: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
    marginBottom: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
  },
};


