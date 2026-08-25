import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrendVideo, TopicSuggestion, VideoFormat } from 'shared/types';
import * as api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorDisplay from '../components/ErrorDisplay';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [niche, setNiche] = useState('');
  const [region] = useState('MX');
  const [videos, setVideos] = useState<TrendVideo[]>([]);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTrends() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      let trendVideos: TrendVideo[];
      if (niche.trim()) {
        const data = await api.getTrendsByNiche(region, niche.trim());
        trendVideos = [...data.nicheVideos, ...data.recentVideos];
      } else {
        const data = await api.getTrendingVideos(region);
        trendVideos = data.videos;
      }
      setVideos(trendVideos);

      // Generate suggestions
      setLoadingSuggestions(true);
      const suggestionsData = await api.getTopicSuggestions(trendVideos);
      setSuggestions(
        suggestionsData.suggestions.sort((a, b) => b.viralScore - a.viralScore)
      );
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al obtener tendencias';
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingSuggestions(false);
    }
  }

  async function handleSelectTopic(topic: TopicSuggestion) {
    try {
      const format: VideoFormat = topic.recommendedFormat;
      const state = await api.createProject(topic, format);
      navigate(`/project/${state.id}`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Error al crear proyecto';
      setError(msg);
    }
  }

  return (
    <div>
      <h1 style={styles.title}>Dashboard de Tendencias</h1>

      {/* Search bar */}
      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="Escribe un nicho (ej: tecnología, cocina)..."
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchTrends()}
          style={styles.searchInput}
        />
        <button className="btn-primary" onClick={fetchTrends} disabled={loading}>
          {loading ? 'Buscando...' : 'Analizar Tendencias'}
        </button>
      </div>

      {error && <ErrorDisplay error={error} onRetry={fetchTrends} />}

      {loading && <LoadingSpinner message="Analizando tendencias..." />}

      {/* Trending Videos */}
      {videos.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            Videos en Tendencia ({videos.length})
          </h2>
          <div style={styles.videosGrid}>
            {videos.slice(0, 8).map((video) => (
              <div key={video.videoId} className="card" style={styles.videoCard}>
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  style={styles.thumbnail}
                />
                <div style={styles.videoInfo}>
                  <p style={styles.videoTitle}>{video.title}</p>
                  <p style={styles.videoMeta}>
                    {video.channelTitle} · {formatViews(video.viewCount)} views
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Topic Suggestions */}
      {loadingSuggestions && <LoadingSpinner message="Generando sugerencias con IA..." />}

      {suggestions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Sugerencias de Temas</h2>
          <div style={styles.suggestionsGrid}>
            {suggestions.map((topic, i) => (
              <button
                key={i}
                onClick={() => handleSelectTopic(topic)}
                style={styles.suggestionCard}
              >
                <div style={styles.suggestionHeader}>
                  <span style={styles.viralScore}>{topic.viralScore}/10</span>
                  <span style={styles.formatBadge}>{topic.recommendedFormat === 'short' ? 'Short' : 'Largo'}</span>
                </div>
                <h3 style={styles.suggestionTitle}>{topic.title}</h3>
                <p style={styles.suggestionDesc}>{topic.description}</p>
                <div style={styles.tags}>
                  {topic.tags.slice(0, 5).map((tag) => (
                    <span key={tag} style={styles.tag}>#{tag}</span>
                  ))}
                </div>
                <p style={styles.reasoning}>{topic.reasoning}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

const styles: Record<string, React.CSSProperties> = {
  title: { marginBottom: '1.5rem' },
  searchRow: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  searchInput: { flex: 1 },
  section: { marginBottom: '2rem' },
  sectionTitle: { marginBottom: '1rem', fontSize: '1.1rem' },
  videosGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '1rem',
  },
  videoCard: { padding: '0' },
  thumbnail: {
    width: '100%',
    height: '140px',
    objectFit: 'cover',
    borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
  },
  videoInfo: { padding: '0.75rem' },
  videoTitle: {
    fontSize: '0.85rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  videoMeta: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
  },
  suggestionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
  suggestionCard: {
    textAlign: 'left',
    padding: '1rem',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '100%',
  },
  suggestionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  viralScore: {
    fontWeight: 700,
    color: 'var(--color-primary)',
    fontSize: '0.9rem',
  },
  formatBadge: {
    fontSize: '0.7rem',
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    background: 'var(--color-surface-elevated)',
    color: 'var(--color-text-muted)',
  },
  suggestionTitle: {
    fontSize: '0.95rem',
    marginBottom: '0.4rem',
    color: 'var(--color-text)',
  },
  suggestionDesc: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    marginBottom: '0.5rem',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
    marginBottom: '0.5rem',
  },
  tag: {
    fontSize: '0.7rem',
    color: 'var(--color-secondary)',
  },
  reasoning: {
    fontSize: '0.75rem',
    color: 'var(--color-text-dim)',
    fontStyle: 'italic',
  },
};
