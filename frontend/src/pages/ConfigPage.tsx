import { useState, useEffect } from 'react';
import type { AppConfig, VideoFormat } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';

const REGIONS = [
  { code: 'MX', label: 'México' },
  { code: 'ES', label: 'España' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'AR', label: 'Argentina' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'PE', label: 'Perú' },
];

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<{
    openai?: { valid: boolean; error?: string };
    youtube?: { valid: boolean; error?: string };
  }>({});

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const data = await api.getConfig();
      setConfig(data);
    } catch {
      setConfig({
        apiKeys: { openai: '', youtube: '' },
        defaults: { region: 'MX' },
        paths: { outputDir: './output', tempDir: './temp' },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.saveConfig(config);
      setSuccess('Configuración guardada correctamente');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleValidateKeys() {
    if (!config) return;
    setValidating(true);
    setKeyStatus({});
    try {
      const result = await api.validateKeys(config);
      setKeyStatus({ openai: result.openai, youtube: result.youtube });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al validar';
      setError(msg);
    } finally {
      setValidating(false);
    }
  }

  if (loading) return <LoadingSpinner message="Cargando configuración..." />;
  if (!config) return <ErrorDisplay error="No se pudo cargar la configuración" onRetry={loadConfig} />;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Configuración</h1>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {success && <div style={styles.successBanner}>{success}</div>}

      {/* API Keys */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>API Keys</h2>
        <div style={styles.field}>
          <label style={styles.label}>OpenAI API Key</label>
          <input
            type="password"
            value={config.apiKeys.openai}
            onChange={(e) =>
              setConfig({ ...config, apiKeys: { ...config.apiKeys, openai: e.target.value } })
            }
            placeholder="sk-..."
          />
          {keyStatus.openai && (
            <span style={keyStatus.openai.valid ? styles.validBadge : styles.invalidBadge}>
              {keyStatus.openai.valid ? '✓ Válida' : `✗ ${keyStatus.openai.error || 'Inválida'}`}
            </span>
          )}
        </div>
        <div style={styles.field}>
          <label style={styles.label}>YouTube API Key</label>
          <input
            type="password"
            value={config.apiKeys.youtube}
            onChange={(e) =>
              setConfig({ ...config, apiKeys: { ...config.apiKeys, youtube: e.target.value } })
            }
            placeholder="AIza..."
          />
          {keyStatus.youtube && (
            <span style={keyStatus.youtube.valid ? styles.validBadge : styles.invalidBadge}>
              {keyStatus.youtube.valid ? '✓ Válida' : `✗ ${keyStatus.youtube.error || 'Inválida'}`}
            </span>
          )}
        </div>
        <div style={styles.field}>
          <label style={styles.label}>YouTube Client ID (OAuth)</label>
          <input
            type="text"
            value={(config as any).youtubeClientId || ''}
            onChange={(e) =>
              setConfig({ ...config, youtubeClientId: e.target.value } as any)
            }
            placeholder="XXXXX.apps.googleusercontent.com"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>YouTube Client Secret (OAuth)</label>
          <input
            type="password"
            value={(config as any).youtubeClientSecret || ''}
            onChange={(e) =>
              setConfig({ ...config, youtubeClientSecret: e.target.value } as any)
            }
            placeholder="GOCSPX-..."
          />
        </div>
        <button
          className="btn-secondary"
          onClick={handleValidateKeys}
          disabled={validating}
        >
          {validating ? 'Validando...' : 'Validar Keys'}
        </button>
      </section>

      {/* Defaults */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Preferencias</h2>
        <div style={styles.field}>
          <label style={styles.label}>Región</label>
          <select
            value={config.defaults.region}
            onChange={(e) =>
              setConfig({ ...config, defaults: { ...config.defaults, region: e.target.value } })
            }
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Nicho</label>
          <input
            type="text"
            value={config.defaults.niche || ''}
            onChange={(e) =>
              setConfig({ ...config, defaults: { ...config.defaults, niche: e.target.value } })
            }
            placeholder="ej: tecnología, cocina, gaming..."
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Voz preferida</label>
          <input
            type="text"
            value={config.defaults.voice || ''}
            onChange={(e) =>
              setConfig({ ...config, defaults: { ...config.defaults, voice: e.target.value } })
            }
            placeholder="ID de voz edge-tts"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Formato por defecto</label>
          <select
            value={config.defaults.format || ''}
            onChange={(e) =>
              setConfig({
                ...config,
                defaults: {
                  ...config.defaults,
                  format: (e.target.value || undefined) as VideoFormat | undefined,
                },
              })
            }
          >
            <option value="">Sin preferencia</option>
            <option value="short">Short (1080×1920)</option>
            <option value="long_video">Video Largo (1920×1080)</option>
          </select>
        </div>
      </section>

      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={styles.saveBtn}
      >
        {saving ? 'Guardando...' : 'Guardar Configuración'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '600px' },
  title: { marginBottom: '1.5rem' },
  section: {
    marginBottom: '2rem',
    padding: '1.25rem',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  sectionTitle: { marginBottom: '1rem', fontSize: '1.1rem' },
  field: { marginBottom: '1rem' },
  label: {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.85rem',
    color: 'var(--color-text-muted)',
  },
  saveBtn: { marginTop: '0.5rem' },
  errorBanner: {
    padding: '0.75rem',
    marginBottom: '1rem',
    background: 'rgba(252,92,92,0.1)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-error)',
  },
  successBanner: {
    padding: '0.75rem',
    marginBottom: '1rem',
    background: 'rgba(72,187,120,0.1)',
    border: '1px solid var(--color-success)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-success)',
  },
  validBadge: {
    display: 'inline-block',
    marginTop: '0.3rem',
    fontSize: '0.8rem',
    color: 'var(--color-success)',
  },
  invalidBadge: {
    display: 'inline-block',
    marginTop: '0.3rem',
    fontSize: '0.8rem',
    color: 'var(--color-error)',
  },
};
