import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { PipelineState, GeneratedImage } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function ImagesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const passedScript = (location.state as any)?.script;
  const [project, setProject] = useState<PipelineState | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [totalSections, setTotalSections] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<{ section: number; prompt: string } | null>(null);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        if (state.images) {
          setImages(state.images);
          setGeneratedCount(state.images.length);
        }
        if (state.script) {
          setTotalSections(state.script.sections.length);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    setImages([]);
    setGeneratedCount(0);
    try {
      // Get script from navigation state or project state
      let script = passedScript;
      if (!script) {
        const state = await api.getProjectState(id) as any;
        script = state.script;
      }
      if (!script) {
        setError('No hay guion generado. Vuelve al paso anterior.');
        setGenerating(false);
        return;
      }
      setTotalSections(script.sections.length);

      // Get audio duration from project state to match clip timing
      const state = await api.getProjectState(id) as any;
      const audioDuration = state.voice?.durationSeconds || 60;
      const clipDuration = Math.ceil(audioDuration / script.sections.length);

      // Generate animated video clips
      const response = await fetch(`/api/project/${id}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, clipDuration }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw err;
      }

      const data = await response.json();
      const clips = data.clips || [];
      
      // Map clips to GeneratedImage format for compatibility
      const mappedClips = clips.map((clip: any) => ({
        sectionNumber: clip.sectionNumber,
        localPath: clip.clipPath,
        imageUrl: '',
        prompt: clip.prompt,
      }));

      setImages(mappedClips);
      setGeneratedCount(mappedClips.length);

      if (mappedClips.length === 0) {
        setError('No se pudo generar ningun clip de video');
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al generar imágenes';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    if (!id || !editingPrompt) return;
    setRegenerating(editingPrompt.section);
    try {
      const newImage = await api.regenerateImage(id, editingPrompt.section, editingPrompt.prompt);
      setImages((prev) =>
        prev.map((img) => (img.sectionNumber === editingPrompt.section ? newImage : img))
      );
      setEditingPrompt(null);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al regenerar imagen';
      setError(msg);
    } finally {
      setRegenerating(null);
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

      <h1 style={styles.title}>Generacion de Clips de Video</h1>

      {error && <ErrorDisplay error={error} onRetry={handleGenerate} />}

      {images.length === 0 && !generating && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            Genera imágenes para cada sección del guión.
            {totalSections > 0 && ` (${totalSections} secciones)`}
          </p>
          <button className="btn-primary" onClick={handleGenerate}>
            Generar Imágenes
          </button>
        </div>
      )}

      {generating && (
        <LoadingSpinner message={`Generando imágenes... ${generatedCount}/${totalSections}`} />
      )}

      {/* Progress indicator */}
      {images.length > 0 && (
        <p style={styles.progress}>
          {generatedCount}/{totalSections} imágenes generadas
        </p>
      )}

      {/* Gallery Grid */}
      {images.length > 0 && (
        <div style={styles.gallery}>
          {images.map((img) => (
            <div key={img.sectionNumber} style={styles.imageCard}>
              {img.localPath?.endsWith('.mp4') ? (
                <video
                  src={`/api/files/${img.localPath.replace(/.*[/\\]temp[/\\]/, '').replace(/\\/g, '/')}`}
                  style={styles.image}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  src={img.imageUrl || `/api/files/${img.localPath.replace(/.*[/\\]temp[/\\]/, '').replace(/\\/g, '/')}`}
                  alt={`Seccion ${img.sectionNumber}`}
                  style={styles.image}
                />
              )}
              <div style={styles.imageInfo}>
                <span style={styles.sectionLabel}>Seccion {img.sectionNumber}</span>
                <button
                  style={styles.regenerateBtn}
                  onClick={() => setEditingPrompt({ section: img.sectionNumber, prompt: img.prompt })}
                >
                  Regenerar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prompt editing modal */}
      {editingPrompt && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3>Regenerar Imagen - Sección {editingPrompt.section}</h3>
            <textarea
              value={editingPrompt.prompt}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
              rows={4}
              style={{ ...styles.textarea, marginTop: '0.75rem' }}
            />
            <div style={styles.modalActions}>
              <button className="btn-secondary" onClick={() => setEditingPrompt(null)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleRegenerate}
                disabled={regenerating === editingPrompt.section}
              >
                {regenerating === editingPrompt.section ? 'Regenerando...' : 'Regenerar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Continue button */}
      {images.length > 0 && (
        <button
          className="btn-primary"
          onClick={() => {
            // Save images to localStorage for compile step
            localStorage.setItem(`project_${id}_images`, JSON.stringify(images));
            navigate(`/project/${id}/voice`);
          }}
          style={styles.continueBtn}
        >
          Continuar a Voz
        </button>
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
  progress: {
    fontSize: '0.9rem',
    color: 'var(--color-text-muted)',
    marginBottom: '1rem',
  },
  gallery: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '1rem',
  },
  imageCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '160px',
    objectFit: 'cover',
  },
  imageInfo: {
    padding: '0.5rem 0.75rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
  },
  regenerateBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-primary)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    padding: '0.25rem',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'var(--color-surface)',
    padding: '1.5rem',
    borderRadius: 'var(--radius-lg)',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid var(--color-border)',
  },
  modalActions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    marginTop: '1rem',
  },
  textarea: { resize: 'vertical', minHeight: '80px' },
  continueBtn: { marginTop: '1.5rem' },
};
