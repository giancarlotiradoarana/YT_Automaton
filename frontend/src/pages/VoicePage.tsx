import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { PipelineState, VoiceOption, VoiceResult } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';
import PipelineStages from '../components/PipelineStages';

export default function VoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<PipelineState | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language] = useState('es');

  useEffect(() => {
    if (id) {
      const loadData = async () => {
        try {
          const [state, voiceData] = await Promise.all([
            api.getProjectState(id),
            api.getVoices(language).catch(() => ({ voices: [] })),
          ]) as [any, any];
          setProject(state.pipeline || state);
          
          // If voices loaded from API, use them. Otherwise use defaults.
          if (voiceData.voices && voiceData.voices.length > 0) {
            setVoices(voiceData.voices);
          } else {
            setVoices([
              { id: 'es-MX-JorgeNeural', name: 'es-MX-JorgeNeural', language: 'es-MX', gender: 'Male' },
              { id: 'es-MX-DaliaNeural', name: 'es-MX-DaliaNeural', language: 'es-MX', gender: 'Female' },
              { id: 'es-ES-AlvaroNeural', name: 'es-ES-AlvaroNeural', language: 'es-ES', gender: 'Male' },
              { id: 'es-ES-ElviraNeural', name: 'es-ES-ElviraNeural', language: 'es-ES', gender: 'Female' },
              { id: 'es-CO-GonzaloNeural', name: 'es-CO-GonzaloNeural', language: 'es-CO', gender: 'Male' },
              { id: 'es-AR-TomasNeural', name: 'es-AR-TomasNeural', language: 'es-AR', gender: 'Male' },
            ]);
          }
          if (state.voice) setVoiceResult(state.voice);
        } catch {
          // fallback
        }
        setLoading(false);
      };
      loadData();
    }
  }, [id, language]);

  async function handleGenerate() {
    if (!id || !selectedVoice) return;
    setGenerating(true);
    setError(null);
    try {
      // Get the full project state to access the script
      const state = await api.getProjectState(id) as any;
      const script = state.script || (location.state as any)?.script;
      if (!script) {
        setError('No hay guión disponible. Vuelve al paso de Guión primero.');
        setGenerating(false);
        return;
      }
      const result = await api.generateVoice(id, script, selectedVoice);
      setVoiceResult(result);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al generar voz';
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

      <h1 style={styles.title}>Generación de Voz</h1>

      {error && <ErrorDisplay error={error} onRetry={handleGenerate} />}

      {/* Voice selection */}
      <div style={styles.section}>
        <label style={styles.label}>Seleccionar Voz</label>
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          style={styles.select}
        >
          <option value="">-- Selecciona una voz --</option>
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} ({voice.gender}) - {voice.language}
            </option>
          ))}
        </select>

        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating || !selectedVoice}
          style={styles.generateBtn}
        >
          {generating ? 'Generando...' : 'Generar Narración'}
        </button>
      </div>

      {generating && <LoadingSpinner message="Generando narración con edge-tts..." />}

      {/* Voice result */}
      {voiceResult && (
        <div style={styles.resultCard}>
          <h3 style={styles.resultTitle}>Narración Generada</h3>
          <div style={styles.audioContainer}>
            <audio controls style={styles.audioPlayer}>
              <source src={`/api/files/${voiceResult.audioPath.split(/[/\\]output[/\\]/)[1] || voiceResult.audioPath.split(/[/\\]/).slice(-2).join('/')}`} type="audio/mpeg" />
              Tu navegador no soporta audio.
            </audio>
          </div>
          <div style={styles.resultMeta}>
            <span>Duración: {voiceResult.durationSeconds.toFixed(1)}s</span>
            <span>Subtítulos: {voiceResult.subtitlePath}</span>
          </div>
          <button
            className="btn-primary"
            onClick={() => navigate(`/project/${id}/compile`)}
            style={styles.continueBtn}
          >
            Continuar a Compilación
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { marginBottom: '1rem', marginTop: '1rem' },
  section: {
    padding: '1.25rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  select: { marginBottom: '1rem' },
  generateBtn: { marginTop: '0.5rem' },
  resultCard: {
    padding: '1.5rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success)',
  },
  resultTitle: { marginBottom: '1rem' },
  audioContainer: { marginBottom: '1rem' },
  audioPlayer: { width: '100%' },
  resultMeta: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
    marginBottom: '1rem',
  },
  continueBtn: { marginTop: '0.5rem' },
};
