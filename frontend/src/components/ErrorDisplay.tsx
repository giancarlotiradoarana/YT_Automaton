import type { AppError } from 'shared/types';

interface ErrorDisplayProps {
  error: AppError | Error | string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const message =
    typeof error === 'string'
      ? error
      : 'message' in error
        ? error.message
        : 'An unknown error occurred';

  const code =
    typeof error === 'object' && 'code' in error ? (error as AppError).code : undefined;

  const retryable =
    typeof error === 'object' && 'retryable' in error
      ? (error as AppError).retryable
      : true;

  return (
    <div style={styles.container}>
      <div style={styles.icon}>⚠️</div>
      <p style={styles.message}>{message}</p>
      {code && <p style={styles.code}>Code: {code}</p>}
      {onRetry && retryable && (
        <button className="btn-primary" onClick={onRetry} style={styles.button}>
          Reintentar
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '2rem',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
  },
  icon: {
    fontSize: '2rem',
  },
  message: {
    color: 'var(--color-text)',
    fontSize: '0.95rem',
  },
  code: {
    color: 'var(--color-text-dim)',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-mono)',
  },
  button: {
    marginTop: '0.5rem',
  },
};
