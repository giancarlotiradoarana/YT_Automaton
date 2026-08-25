# IAYT — YouTube Video Automation con IA

Aplicación completa para generar videos de YouTube automáticamente usando IA: desde la investigación de tendencias hasta la subida final.

## Qué hace

1. **Analiza tendencias** de YouTube por región y nicho
2. **Genera guiones** con OpenAI
3. **Crea imágenes** con Pollinations AI
4. **Genera narración** con Edge TTS (text-to-speech)
5. **Compila el video** con FFmpeg (imágenes + audio + subtítulos)
6. **Genera thumbnails** automáticamente
7. **Sube a YouTube** con OAuth2

---

## Requisitos previos

Instalar en la nueva máquina **antes** de clonar:

| Software | Versión mínima | Descarga |
|----------|---------------|----------|
| **Node.js** | v18+ | https://nodejs.org/ |
| **npm** | viene con Node.js | — |
| **FFmpeg** | v6+ | https://ffmpeg.org/download.html |
| **Git** | cualquiera | https://git-scm.com/ |

### Instalar FFmpeg en Windows

1. Descargar desde https://www.gyan.dev/ffmpeg/builds/ (essentials build)
2. Extraer en `C:\ffmpeg\` (o donde prefieras)
3. Agregar al PATH del sistema:
   - Buscar "Variables de entorno" en Windows
   - En "Path" del sistema, agregar: `C:\ffmpeg\ffmpeg-X.X-essentials_build\bin`
4. Verificar: abrir CMD y ejecutar `ffmpeg -version`

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/TU_USUARIO/iayt.git
cd iayt

# 2. Instalar dependencias del backend
cd backend
npm install

# 3. Instalar dependencias del frontend
cd ../frontend
npm install
```

---

## Configurar variables de entorno

Crear el archivo `backend/.env` con el siguiente contenido:

```env
# Puerto del servidor
PORT=3001

# YouTube Data API (para buscar tendencias)
YOUTUBE_API_KEY=tu_youtube_api_key

# OpenAI (para generar guiones)
OPENAI_API_KEY=tu_openai_api_key

# Pollinations (para generar imágenes)
POLLINATIONS_API_KEY=tu_pollinations_api_key

# YouTube OAuth2 (para subir videos)
YOUTUBE_CLIENT_ID=tu_client_id
YOUTUBE_CLIENT_SECRET=tu_client_secret

# Ruta de FFmpeg (opcional si está en el PATH)
# FFMPEG_PATH=C:\ffmpeg\ffmpeg-8.1.2-essentials_build\bin\ffmpeg.exe
```

### Cómo obtener las API keys:

| Key | Dónde obtenerla |
|-----|----------------|
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) → Habilitar "YouTube Data API v3" → Crear API Key |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `POLLINATIONS_API_KEY` | [Pollinations](https://pollinations.ai/) |
| `YOUTUBE_CLIENT_ID` / `SECRET` | Google Cloud Console → Credenciales → OAuth 2.0 Client |

---

## Ejecutar el proyecto

Necesitas **dos terminales** abiertas:

### Terminal 1 — Backend (servidor API)

```bash
cd backend
npm run dev
```

El servidor arranca en `http://localhost:3001`

### Terminal 2 — Frontend (interfaz)

```bash
cd frontend
npm run dev
```

La interfaz se abre en `http://localhost:5173`

---

## Estructura del proyecto

```
iayt/
├── backend/              # Servidor Node.js + Express
│   ├── src/
│   │   ├── server.ts     # Entry point
│   │   ├── app.ts        # Configuración Express
│   │   ├── routes/       # Endpoints API
│   │   └── services/     # Lógica de negocio (IA, video, TTS)
│   ├── output/           # Videos/audios generados (no se sube a git)
│   ├── assets/           # Recursos estáticos (CTAs, etc.)
│   └── .env              # Variables de entorno (no se sube a git)
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── pages/        # Páginas del pipeline
│   │   ├── components/   # Componentes reutilizables
│   │   └── api/          # Cliente HTTP
│   └── index.html
├── shared/               # Tipos y constantes compartidas
└── README.md
```

---

## Pipeline de creación de video

```
Dashboard → Elegir Tema → Formato → Guión → Imágenes → Voz → Compilar → Thumbnail → Subir
```

Cada etapa se ejecuta en orden y puedes editar/regenerar en cualquier momento antes de avanzar.

---

## Formatos de video soportados

| Formato | Resolución | Duración | Plataforma |
|---------|-----------|----------|------------|
| Video largo | 1920×1080 | 8-15 min | YouTube |
| Short | 1080×1920 | 30-60 seg | YouTube Shorts |
| Reel | 1080×1920 | 30-60 seg | Instagram/TikTok |

---

## Solución de problemas

### "FFmpeg no encontrado"
- Verificar que FFmpeg está en el PATH: `ffmpeg -version`
- O definir la ruta completa en `backend/.env` con `FFMPEG_PATH=C:\ruta\a\ffmpeg.exe`

### "Error de API key"
- Verificar que el archivo `backend/.env` existe y tiene las keys correctas
- Las keys no deben tener espacios ni comillas

### "CORS error" en el navegador
- Asegurarte de que el backend está corriendo en el puerto 3001
- El frontend usa un proxy de Vite que redirige `/api` al backend

### Puerto 3001 ocupado
- Cambiar `PORT=3002` en el `.env` y actualizar la config de Vite

---

## Notas importantes

- El archivo `.env` **nunca se sube a GitHub** (está en `.gitignore`)
- Las carpetas `output/` y `temp/` se generan automáticamente y no se suben
- Los `node_modules/` tampoco se suben — se instalan con `npm install`
- El proyecto funciona en Windows, Mac y Linux (ajustar ruta de FFmpeg según el SO)

---

## Desarrollado por

**Sensei Gian** ✨
