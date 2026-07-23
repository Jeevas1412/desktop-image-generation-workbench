import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ImageModels from './pages/ImageModels'
import ImageStudio from './pages/ImageStudio'
import Jobs from './pages/Jobs'
import Library from './pages/Library'
import ComfyUiConnection from './pages/ComfyUiConnection'

function App() {
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="image-models" element={<ImageModels />} />
          <Route path="image-studio" element={<ImageStudio />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="library" element={<Library />} />
          <Route path="comfyui-connection" element={<ComfyUiConnection />} />
          <Route index element={<ImageStudio />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
