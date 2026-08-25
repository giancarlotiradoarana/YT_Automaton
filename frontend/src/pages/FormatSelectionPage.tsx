import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineState, VideoFormat } from 'shared/types';
import { FORMAT_CONSTRAINTS } from 'shared/constants';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import PipelineStages from '../components/PipelineStages';

export default function FormatSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [selected, setSelected] = useState<VideoFormat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        setSelected(state.format || state.pipeline?.format || null);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  function handleContinue() {
    if (id && selected) {
      navigate(`/project/${id}/script`);
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

      <h1 style={styles.title}>Selección de Formato</h1>
      <p style={styles.subtitle}>Elige el formato de video que deseas crear</p>

      <div style={styles.grid}>
        {/* Short format card */}
        <button
          onClick={() => setSelected('short')}
          style={{
            ...styles.formatCard,
            borderColor: selected === 'short' ? 'var(--color-primary)' : 'var(--color-border)',
            boxShadow: selected === 'short' ? '0 0 0 2px var(--color-primary)' : 'none',
          }}
        >
          <div style={styles.previewFrame}>
            <div style={styles.shortPreview}>
              <span style={styles.previewLabel}>9:16</span>
            </div>
          </div>
          <h3 style={styles.formatTitle}>Short</h3>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.short.resolution.width} × {FORMAT_CONSTRAINTS.short.resolution.height}
          </p>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.short.durationSeconds.min}-{FORMAT_CONSTRAINTS.short.durationSeconds.max} segundos
          </p>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.short.sectionCount} secciones
          </p>
        </button>

        {/* Long Video card */}
        <button
          onClick={() => setSelected('long_video')}
          style={{
            ...styles.formatCard,
            borderColor: selected === 'long_video' ? 'var(--color-primary)' : 'var(--color-border)',
            boxShadow: selected === 'long_video' ? '0 0 0 2px var(--color-primary)' : 'none',
          }}
        >
          <div style={styles.previewFrame}>
            <div style={styles.longPreview}>
              <span style={styles.previewLabel}>16:9</span>
            </div>
          </div>
          <h3 style={styles.formatTitle}>Video Largo</h3>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.long_video.resolution.width} × {FORMAT_CONSTRAINTS.long_video.resolution.height}
          </p>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.long_video.durationMinutes.min}-{FORMAT_CONSTRAINTS.long_video.durationMinutes.max} minutos
          </p>
          <p style={styles.formatDetail}>
            {FORMAT_CONSTRAINTS.long_video.sectionCount.min}-{FORMAT_CONSTRAINTS.long_video.sectionCount.max} secciones
          </p>
        </button>
      </div>

      <button
        className="btn-primary"
        onClick={handleContinue}
        disabled={!selected}
        style={styles.continueBtn}
      >
        Continuar con {selected === 'short' ? 'Short' : selected === 'long_video' ? 'Video Largo' : '...'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { marginBottom: '0.5rem', marginTop: '1rem' },
  subtitle: { color: 'var(--color-text-muted)', marginBottom: '2rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem',
    maxWidth: '600px',
  },
  formatCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem',
    background: 'var(--color-surface)',
    border: '2px solid',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '100%',
  },
  previewFrame: {
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '120px',
  },
  shortPreview: {
    width: '56px',
    height: '100px',
    background: 'var(--color-surface-elevated)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  longPreview: {
    width: '140px',
    height: '80px',
    background: 'var(--color-surface-elevated)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    fontSize: '0.7rem',
    color: 'var(--color-text-dim)',
  },
  formatTitle: {
    fontSize: '1.1rem',
    marginBottom: '0.5rem',
    color: 'var(--color-text)',
  },
  formatDetail: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    marginBottom: '0.25rem',
  },
  continueBtn: {
    marginTop: '2rem',
    padding: '0.75rem 2rem',
  },
};
