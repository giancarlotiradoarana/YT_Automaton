import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { PipelineState, UploadResult, PrivacyStatus } from 'shared/types';
import { UPLOAD_LIMITS } from 'shared/constants';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyStatus>('unlisted');

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        if (state.uploadResult) setResult(state.uploadResult);
        if (state.topic) {
          setTitle(state.topic.title.slice(0, UPLOAD_LIMITS.titleMaxChars));
          setDescription(state.topic.description);
          setTags(state.topic.tags.join(', '));
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  async function handleUpload() {
    if (!id || !project?.thumbnail) return;
    setUploading(true);
    setError(null);
    try {
      const uploadResult = await api.uploadToYouTube(id, {
        title: title.slice(0, UPLOAD_LIMITS.titleMaxChars),
        description: description.slice(0, UPLOAD_LIMITS.descriptionMaxChars),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        privacyStatus: privacy,
        thumbnailPath: project.thumbnail.imagePath,
      });
      setResult(uploadResult);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al subir video';
      setError(msg);
    } finally {
      setUploading(false);
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

      <h1 style={styles.title}>Subir a YouTube</h1>

      {error && <ErrorDisplay error={error} onRetry={handleUpload} />}

      {result ? (
        <div style={styles.successCard}>
          <div style={styles.successIcon}>ðŸŽ‰</div>
          <h2 style={styles.successTitle}>Â¡Video Subido Exitosamente!</h2>
          <a
            href={result.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.videoLink}
          >
            {result.videoUrl}
          </a>
          <p style={styles.videoId}>ID: {result.videoId}</p>
        </div>
      ) : (
        <div style={styles.form}>
          {/* Title */}
          <div style={styles.field}>
            <label style={styles.label}>
              Titulo ({title.length}/{UPLOAD_LIMITS.titleMaxChars})
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, UPLOAD_LIMITS.titleMaxChars))}
              placeholder="Titulo del video..."
              maxLength={UPLOAD_LIMITS.titleMaxChars}
            />
          </div>

          {/* Description */}
          <div style={styles.field}>
            <label style={styles.label}>
              Descripcion ({description.length}/{UPLOAD_LIMITS.descriptionMaxChars})
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, UPLOAD_LIMITS.descriptionMaxChars))}
              rows={5}
              style={styles.textarea}
              maxLength={UPLOAD_LIMITS.descriptionMaxChars}
              placeholder="Descripcion del video..."
            />
          </div>

          {/* Tags */}
          <div style={styles.field}>
            <label style={styles.label}>Tags (separados por coma)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3..."
            />
            <span style={styles.charCount}>
              {tags.length}/{UPLOAD_LIMITS.tagsMaxTotalChars} caracteres
            </span>
          </div>

          {/* Privacy */}
          <div style={styles.field}>
            <label style={styles.label}>Privacidad</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as PrivacyStatus)}
            >
              <option value="public">Publico</option>
              <option value="unlisted">No listado</option>
              <option value="private">Privado</option>
            </select>
          </div>

          {/* Upload button */}
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={uploading || !title.trim()}
            style={styles.uploadBtn}
          >
            {uploading ? 'Subiendo...' : 'Subir a YouTube'}
          </button>

          {uploading && (
            <div style={styles.progressSection}>
              <div style={styles.progressBar}>
                <div style={styles.progressFill} />
              </div>
              <p style={styles.progressText}>Subiendo video... esto puede tomar varios minutos.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { marginBottom: '1rem', marginTop: '1rem' },
  form: {
    maxWidth: '600px',
    padding: '1.5rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  field: { marginBottom: '1rem' },
  label: {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
  },
  textarea: { resize: 'vertical', minHeight: '100px' },
  charCount: {
    fontSize: '0.75rem',
    color: 'var(--color-text-dim)',
    marginTop: '0.25rem',
    display: 'block',
  },
  uploadBtn: {
    marginTop: '1rem',
    padding: '0.75rem 2rem',
  },
  progressSection: { marginTop: '1.5rem' },
  progressBar: {
    width: '100%',
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    width: '45%',
    height: '100%',
    background: 'var(--color-primary)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  progressText: {
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
    marginTop: '0.5rem',
  },
  successCard: {
    textAlign: 'center',
    padding: '3rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success)',
  },
  successIcon: { fontSize: '3rem', marginBottom: '1rem' },
  successTitle: { marginBottom: '1rem', color: 'var(--color-success)' },
  videoLink: {
    display: 'block',
    fontSize: '1rem',
    color: 'var(--color-primary)',
    marginBottom: '0.5rem',
  },
  videoId: {
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
  },
};


