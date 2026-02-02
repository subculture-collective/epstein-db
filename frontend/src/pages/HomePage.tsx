import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getStats, getNetworkByLayer } from '@/api'
import { Users, FileText, Network, Lightbulb, DollarSign, Vote, Building } from 'lucide-react'

export function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: layersData, isLoading: layersLoading } = useQuery({
    queryKey: ['network-layers'],
    queryFn: getNetworkByLayer,
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Epstein Files Database</h1>
        <p className="text-gray-400">
          Searchable database and network analysis tool for the DOJ Epstein Files release
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={FileText}
          label="Documents"
          value={stats?.documents ?? 0}
          loading={statsLoading}
        />
        <StatCard
          icon={Users}
          label="Entities"
          value={stats?.entities ?? 0}
          loading={statsLoading}
        />
        <StatCard
          icon={Network}
          label="Relationships"
          value={stats?.triples ?? 0}
          loading={statsLoading}
        />
        <StatCard
          icon={Lightbulb}
          label="Patterns"
          value={stats?.patterns ?? 0}
          loading={statsLoading}
        />
      </div>

      {/* Cross-Reference Stats */}
      <div className="card p-4 mb-8">
        <h2 className="text-lg font-semibold mb-4">Cross-Reference Data</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">PPP Loans</p>
              <p className="font-semibold">{stats?.pppLoans?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Vote className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">FEC Records</p>
              <p className="font-semibold">{stats?.fecRecords?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Building className="text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Federal Grants</p>
              <p className="font-semibold">{stats?.grants?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Layer Overview */}
      <div className="card p-4 mb-8">
        <h2 className="text-lg font-semibold mb-4">Network Layers</h2>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((layer) => {
            const layerData = layersData?.layers?.find((l) => l.layer === layer)
            return (
              <div key={layer} className="flex items-center gap-4">
                <span className={`layer-badge layer-${layer}`}>L{layer}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-300">
                      {layer === 0 && 'Jeffrey Epstein'}
                      {layer === 1 && 'Direct Associates'}
                      {layer === 2 && 'One Degree Removed'}
                      {layer === 3 && 'Two Degrees Removed'}
                    </span>
                    <span className="text-sm text-gray-500">
                      {layerData?.count ?? 0} entities
                    </span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        layer === 0 ? 'bg-red-500' :
                        layer === 1 ? 'bg-orange-500' :
                        layer === 2 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (layerData?.count ?? 0) / 10)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Link to="/network" className="card p-4 hover:bg-surface-hover transition-colors">
          <Network className="text-blue-400 mb-2" size={24} />
          <h3 className="font-semibold mb-1">Explore Network</h3>
          <p className="text-sm text-gray-400">Interactive visualization of entity connections</p>
        </Link>
        <Link to="/search" className="card p-4 hover:bg-surface-hover transition-colors">
          <FileText className="text-green-400 mb-2" size={24} />
          <h3 className="font-semibold mb-1">Search Documents</h3>
          <p className="text-sm text-gray-400">Full-text search across all documents</p>
        </Link>
        <Link to="/patterns" className="card p-4 hover:bg-surface-hover transition-colors">
          <Lightbulb className="text-yellow-400 mb-2" size={24} />
          <h3 className="font-semibold mb-1">View Patterns</h3>
          <p className="text-sm text-gray-400">AI-discovered connections and insights</p>
        </Link>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <h3 className="font-semibold text-yellow-400 mb-1">Disclaimer</h3>
        <p className="text-sm text-gray-300">
          This is an independent research tool. It surfaces connections from public documents — 
          it does not assert guilt, criminality, or wrongdoing. Always verify claims against primary sources.
        </p>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: any
  label: string
  value: number
  loading: boolean
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-surface-hover rounded-lg">
          <Icon className="text-gray-400" size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-xl font-semibold">
            {loading ? '—' : value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
