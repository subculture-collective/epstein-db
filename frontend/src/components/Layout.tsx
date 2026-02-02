import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Search, 
  Network, 
  Users, 
  FileText, 
  Lightbulb, 
  Link2, 
  Home 
} from 'lucide-react'
import { clsx } from 'clsx'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/network', icon: Network, label: 'Network' },
  { path: '/entities', icon: Users, label: 'Entities' },
  { path: '/documents', icon: FileText, label: 'Documents' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/patterns', icon: Lightbulb, label: 'Patterns' },
  { path: '/crossref', icon: Link2, label: 'Cross-Ref' },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <nav className="w-64 bg-surface border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">EF</span>
            </div>
            <div>
              <h1 className="font-semibold text-white">Epstein Files</h1>
              <p className="text-xs text-gray-500">Database</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-2">
          {navItems.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors',
                location.pathname === path
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-surface-hover hover:text-gray-200'
              )}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border text-xs text-gray-500">
          <p>4,055 documents</p>
          <p className="mt-1">DOJ Release Dec 2025</p>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
