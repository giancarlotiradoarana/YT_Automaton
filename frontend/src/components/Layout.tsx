import { Link, Outlet, useLocation } from 'react-router-dom';
import logoImg from '../images/Dualidad.png';

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path
      ? { color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)' }
      : {};

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <Link to="/" style={styles.logo}>
          <img src={logoImg} alt="Dualidad" style={{ height: 80, objectFit: 'contain', background: 'white', padding: '6px 12px', borderRadius: 8 }} />
        </Link>
        <nav style={styles.nav}>
          <Link to="/" style={{ ...styles.navLink, ...isActive('/') }}>
            Dashboard
          </Link>
          <Link to="/config" style={{ ...styles.navLink, ...isActive('/config') }}>
            Configuración
          </Link>
        </nav>
      </header>
      <main style={styles.main}>
        <Outlet />
      </main>
      <footer style={styles.footer}>
        <div style={styles.footerColumns}>
          <div style={styles.footerColumn}>
            <h4 style={styles.footerTitle}>Generación de Video</h4>
            <Link to="/" style={styles.footerLink}>Dashboard</Link>
            <Link to="/config" style={styles.footerLink}>Configuración</Link>
            <span style={styles.footerLink}>Crear Video</span>
            <span style={styles.footerLink}>Historial</span>
          </div>
          <div style={styles.footerColumn}>
            <h4 style={styles.footerTitle}>IA & Contenido</h4>
            <span style={styles.footerLink}>Scripts con IA</span>
            <span style={styles.footerLink}>Voces</span>
            <span style={styles.footerLink}>Imágenes</span>
            <span style={styles.footerLink}>Subtítulos</span>
          </div>
          <div style={styles.footerColumn}>
            <h4 style={styles.footerTitle}>YouTube</h4>
            <span style={styles.footerLink}>Subir Video</span>
            <span style={styles.footerLink}>SEO & Metadata</span>
            <span style={styles.footerLink}>Thumbnails</span>
            <span style={styles.footerLink}>Analíticas</span>
          </div>
          <div style={styles.footerColumn}>
            <h4 style={styles.footerTitle}>Soporte</h4>
            <span style={styles.footerLink}>Documentación</span>
            <span style={styles.footerLink}>Contacto</span>
            <span style={styles.footerLink}>Blog</span>
            <span style={styles.footerLink}>Actualizaciones</span>
          </div>
        </div>
        <div style={styles.footerBottom}>
          <p>Desarrollado por <span style={{ color: '#a78bfa', fontWeight: 600 }}>Sensei Gian</span></p>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1.5rem',
    background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textDecoration: 'none',
  },
  logoIcon: {
    fontSize: '1.25rem',
    color: 'var(--color-primary)',
  },
  logoText: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  nav: {
    display: 'flex',
    gap: '1.5rem',
  },
  navLink: {
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    padding: '0.5rem 0',
    transition: 'color 0.2s',
  },
  main: {
    flex: 1,
    padding: '1.5rem',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
  },
  footer: {
    padding: '3rem 2rem 1.5rem',
    borderTop: '1px solid #2a2a4a',
    background: '#0f0f1a',
  },
  footerColumns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  footerColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
  },
  footerTitle: {
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  },
  footerLink: {
    color: '#9ca3af',
    fontSize: '0.85rem',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'color 0.2s',
  },
  footerBottom: {
    textAlign: 'center' as const,
    marginTop: '2.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #1f1f3a',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
};
