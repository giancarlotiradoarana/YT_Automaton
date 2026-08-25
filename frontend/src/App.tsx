import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import StoryDemoPage from './pages/StoryDemoPage';
import SongPage from './pages/SongPage';
import ConfigPage from './pages/ConfigPage';
import FormatSelectionPage from './pages/FormatSelectionPage';
import ScriptPage from './pages/ScriptPage';
import ImagesPage from './pages/ImagesPage';
import VoicePage from './pages/VoicePage';
import CompilePage from './pages/CompilePage';
import ThumbnailPage from './pages/ThumbnailPage';
import UploadPage from './pages/UploadPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<SongPage />} />
        <Route path="/stories" element={<StoryDemoPage />} />
        <Route path="/songs" element={<SongPage />} />
        <Route path="/old-dashboard" element={<DashboardPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/project/:id" element={<FormatSelectionPage />} />
        <Route path="/project/:id/script" element={<ScriptPage />} />
        <Route path="/project/:id/images" element={<ImagesPage />} />
        <Route path="/project/:id/voice" element={<VoicePage />} />
        <Route path="/project/:id/compile" element={<CompilePage />} />
        <Route path="/project/:id/thumbnail" element={<ThumbnailPage />} />
        <Route path="/project/:id/upload" element={<UploadPage />} />
      </Route>
    </Routes>
  );
}
