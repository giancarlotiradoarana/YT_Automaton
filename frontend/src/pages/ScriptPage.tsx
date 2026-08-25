import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineState, Script, ScriptSection } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function ScriptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.getProjectState(id).then((state: any) => {
        setProject(state.pipeline || state);
        if (state.script) setScript(state.script);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id]);

  async function handleGenerate() {
    if (!id || !project) return;
    setGenerating(true);
    setError(null);
    try {
      const state = await api.getProjectState(id) as any;
      const result = await api.generateScript(id, state.topic, state.format);
      setScript(result);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al generar guión';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!id || !script) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveScript(id, script);
      navigate(`/project/${id}/images`, { state: { script } });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al guardar guión';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function updateSection(index: number, field: keyof ScriptSection, value: string) {
    if (!script) return;
    const sections = [...script.sections];
    sections[index] = { ...sections[index], [field]: value };
    setScript({ ...script, sections });
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

      <h1 style={styles.title}>Generación de Guión</h1>

      {error && <ErrorDisplay error={error} onRetry={handleGenerate} />}

      {!script && !generating && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            Genera un guión basado en el tema y formato seleccionados.
          </p>
          <button className="btn-primary" onClick={handleGenerate}>
            Generar Guión
          </button>
        </div>
      )}

      {generating && <LoadingSpinner message="Generando guión con IA..." />}

      {script && (
        <div style={styles.scriptEditor}>
          {/* Hook */}
          <div style={styles.field}>
            <label style={styles.label}>Hook (enganche inicial)</label>
            <textarea
              value={script.hook}
              onChange={(e) => setScript({ ...script, hook: e.target.value })}
              rows={2}
              style={styles.textarea}
            />
          </div>

          {/* Introduction */}
          <div style={styles.field}>
            <label style={styles.label}>Introducción</label>
            <textarea
              value={script.introduction}
              onChange={(e) => setScript({ ...script, introduction: e.target.value })}
              rows={3}
              style={styles.textarea}
            />
          </div>

          {/* Sections */}
          <h3 style={styles.sectionsTitle}>Secciones ({script.sections.length})</h3>
          {script.sections.map((section, i) => (
            <div key={i} style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionNumber}>#{section.number}</span>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateSection(i, 'title', e.target.value)}
                  style={styles.sectionTitleInput}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.smallLabel}>Narración</label>
                <textarea
                  value={section.narration}
                  onChange={(e) => updateSection(i, 'narration', e.target.value)}
                  rows={3}
                  style={styles.textarea}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.smallLabel}>Descripción Visual</label>
                <textarea
                  value={section.visualDescription}
                  onChange={(e) => updateSection(i, 'visualDescription', e.target.value)}
                  rows={2}
                  style={styles.textarea}
                />
              </div>
            </div>
          ))}

          {/* Closing CTA */}
          <div style={styles.field}>
            <label style={styles.label}>CTA Final</label>
            <textarea
              value={script.closingCTA}
              onChange={(e) => setScript({ ...script, closingCTA: e.target.value })}
              rows={2}
              style={styles.textarea}
            />
          </div>

          <div style={styles.wordCount}>
            Palabras totales: {script.totalWordCount}
          </div>

          <div style={styles.actions}>
            <button className="btn-secondary" onClick={handleGenerate} disabled={generating}>
              Regenerar
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar y Continuar'}
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
  scriptEditor: { maxWidth: '800px' },
  field: { marginBottom: '1rem' },
  label: {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  smallLabel: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
  },
  textarea: {
    resize: 'vertical',
    minHeight: '60px',
  },
  sectionsTitle: { marginBottom: '0.75rem', marginTop: '1.5rem' },
  sectionCard: {
    padding: '1rem',
    marginBottom: '1rem',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  sectionNumber: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  sectionTitleInput: {
    flex: 1,
    fontWeight: 500,
  },
  wordCount: {
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
    marginBottom: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
  },
};
