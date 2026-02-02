import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { NetworkPage } from './pages/NetworkPage'
import { EntitiesPage } from './pages/EntitiesPage'
import { EntityDetailPage } from './pages/EntityDetailPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { SearchPage } from './pages/SearchPage'
import { PatternsPage } from './pages/PatternsPage'
import { CrossRefPage } from './pages/CrossRefPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/entities" element={<EntitiesPage />} />
        <Route path="/entities/:id" element={<EntityDetailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/patterns" element={<PatternsPage />} />
        <Route path="/crossref" element={<CrossRefPage />} />
      </Routes>
    </Layout>
  )
}
