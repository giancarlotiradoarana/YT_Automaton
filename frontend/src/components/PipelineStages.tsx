import { useNavigate, useLocation } from 'react-router-dom';
import type { PipelineStage, StageStatus } from 'shared/types';
import { PIPELINE_STAGES_ORDER } from 'shared/constants';

interface PipelineStagesProps {
  projectId: string;
  stages?: Record<PipelineStage, StageStatus>;
  currentStage?: PipelineStage;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  trend_analysis: 'Tendencias',
  format_selection: 'Formato',
  script_generation: 'Guión',
  image_generation: 'Imágenes',
  voice_generation: 'Voz',
  video_compilation: 'Video',
  thumbnail_generation: 'Miniatura',
  upload: 'Subir',
};

const STAGE_ROUTES: Record<PipelineStage, string> = {
  trend_analysis: '',
  format_selection: '',
  script_generation: '/script',
  image_generation: '/images',
  voice_generation: '/voice',
  video_compilation: '/compile',
  thumbnail_generation: '/thumbnail',
  upload: '/upload',
};

// Map URL paths to stage index
function getStageIndexFromPath(path: string): number {
  if (path.includes('/upload')) return 7;
  if (path.includes('/thumbnail')) return 6;
  if (path.includes('/compile')) return 5;
  if (path.includes('/voice')) return 4;
  if (path.includes('/images')) return 3;
  if (path.includes('/script')) return 2;
  if (path.includes('/project/')) return 1; // format selection
  return 0;
}

export default function PipelineStages({ projectId, stages, currentStage }: PipelineStagesProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current step from URL
  const currentIndex = getStageIndexFromPath(location.pathname);

  const handleClick = (stage: PipelineStage, index: number) => {
    if (index <= currentIndex) {
      const route = STAGE_ROUTES[stage];
      navigate(`/project/${projectId}${route}`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {/* Background line */}
        <div style={styles.lineBackground} />
        {/* Progress line */}
        <div style={{
          ...styles.lineProgress,
          width: `${(currentIndex / (PIPELINE_STAGES_ORDER.length - 1)) * 100}%`,
        }} />

        {/* Stage circles */}
        {PIPELINE_STAGES_ORDER.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isClickable = index <= currentIndex;
          const stepNumber = index + 1;

          return (
            <div
              key={stage}
              style={{
                ...styles.stepWrapper,
                left: `${(index / (PIPELINE_STAGES_ORDER.length - 1)) * 100}%`,
              }}
            >
              <button
                onClick={() => handleClick(stage, index)}
                disabled={!isClickable}
                style={{
                  ...styles.circle,
                  background: isCompleted
                    ? '#10b981'
                    : isActive
                    ? '#6366f1'
                    : status === 'error'
                    ? '#ef4444'
                    : '#374151',
                  border: isActive ? '3px solid #818cf8' : '3px solid transparent',
                  cursor: isClickable ? 'pointer' : 'default',
                  transform: isActive ? 'scale(1.2)' : 'scale(1)',
                }}
                title={STAGE_LABELS[stage]}
              >
                {isCompleted ? (
                  <span style={styles.checkmark}>✓</span>
                ) : (
                  <span style={styles.number}>{stepNumber}</span>
                )}
              </button>
              <span style={{
                ...styles.label,
                color: isCompleted ? '#10b981' : isActive ? '#a5b4fc' : '#6b7280',
                fontWeight: isActive ? 600 : 400,
              }}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '2rem 1rem 3rem',
    width: '100%',
  },
  track: {
    position: 'relative',
    height: '60px',
    margin: '0 30px',
  },
  lineBackground: {
    position: 'absolute',
    top: '18px',
    left: 0,
    right: 0,
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
  },
  lineProgress: {
    position: 'absolute',
    top: '18px',
    left: 0,
    height: '4px',
    background: 'linear-gradient(90deg, #10b981, #6366f1)',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  stepWrapper: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  circle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  number: {
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  checkmark: {
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 700,
  },
  label: {
    fontSize: '0.7rem',
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  },
};
