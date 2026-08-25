import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineState, ThumbnailResult } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function ThumbnailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [thumbnail, setThumbnail] = useState<ThumbnailResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editPrompt, setEditPrompt] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        if (state.thumbnail) {
          setThumbnail(state.thumbnail);
          setEditPrompt(state.thumbnail.prompt);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await api.generateThumbnail(id);
      setThumbnail(result);
      setEditPrompt(result.prompt);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al generar miniatura';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    setShowPromptEditor(false);
    try {
      const result = await api.regenerateThumbnail(id, editPrompt);
      setThumbnail(result);
      setEditPrompt(result.prompt);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al regenerar miniatura';
      setError(msg);
    } finally {
      setGenerating(false);
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

      <h1 style={styles.title}>Generacion de Miniatura</h1>

      {error && <ErrorDisplay error={error} onRetry={handleGenerate} />}

      {!thumbnail && !generating && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Genera una miniatura atractiva para tu video.</p>
          <button className="btn-primary" onClick={handleGenerate}>
            Generar Miniatura
          </button>
        </div>
      )}

      {generating && <LoadingSpinner message="Generando miniatura..." />}

      {thumbnail && (
        <div style={styles.resultCard}>
          <div style={styles.thumbnailContainer}>
            <img
              src={thumbnail.imagePath}
              alt="Miniatura generada"
              style={styles.thumbnailImg}
            />
          </div>

          {/* Suggested overlay text */}
          {thumbnail.suggestedOverlayText.length > 0 && (
            <div style={styles.overlaySection}>
              <h4 style={styles.overlayTitle}>Texto sugerido para overlay:</h4>
              <div style={styles.overlayTexts}>
                {thumbnail.suggestedOverlayText.map((text, i) => (
                  <span key={i} style={styles.overlayBadge}>{text}</span>
                ))}
              </div>
            </div>
          )}

          {/* Regenerate */}
          <div style={styles.actions}>
            <button
              className="btn-secondary"
              onClick={() => setShowPromptEditor(!showPromptEditor)}
            >
              Editar Prompt y Regenerar
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate(`/project/${id}/upload`)}
            >
              Continuar a Upload
            </button>
          </div>

          {showPromptEditor && (
            <div style={styles.promptEditor}>
              <label style={styles.label}>Prompt</label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={3}
                style={styles.textarea}
              />
              <button
                className="btn-primary"
                onClick={handleRegenerate}
                disabled={generating}
                style={styles.regenBtn}
              >
                Regenerar
              </button>
            </div>
          )}
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
  resultCard: {
    padding: '1.5rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  thumbnailContainer: {
    marginBottom: '1rem',
    textAlign: 'center',
  },
  thumbnailImg: {
    maxWidth: '100%',
    maxHeight: '360px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  overlaySection: { marginBottom: '1rem' },
  overlayTitle: {
    fontSize: '0.9rem',
    color: 'var(--color-text-muted)',
    marginBottom: '0.5rem',
  },
  overlayTexts: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  overlayBadge: {
    padding: '0.3rem 0.75rem',
    background: 'var(--color-surface-elevated)',
    borderRadius: '12px',
    fontSize: '0.85rem',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  promptEditor: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--color-surface-elevated)',
    borderRadius: 'var(--radius-sm)',
  },
  label: {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
  },
  textarea: { resize: 'vertical', minHeight: '80px' },
  regenBtn: { marginTop: '0.75rem' },
};


