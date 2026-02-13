import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Trash2, GitCompare, Plus, Calendar, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = '/api'

export default function BaselinePage() {
  const [baselines, setBaselines] = useState([])
  const [comparison, setComparison] = useState(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('manual')
  const [loading, setLoading] = useState(false)

  const fetchBaselines = async () => {
    const res = await fetch(`${API_BASE}/baselines`)
    setBaselines(await res.json())
  }

  useEffect(() => { fetchBaselines() }, [])

  const createBaseline = async () => {
    if (!newName.trim()) return
    setLoading(true)
    await fetch(`${API_BASE}/baselines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, snapshot_type: newType })
    })
    setNewName('')
    await fetchBaselines()
    setLoading(false)
  }

  const deleteBaseline = async (id) => {
    await fetch(`${API_BASE}/baselines/${id}`, { method: 'DELETE' })
    if (comparison?.snapshot_id === id) setComparison(null)
    fetchBaselines()
  }

  const compareBaseline = async (id) => {
    setLoading(true)
    const res = await fetch(`${API_BASE}/baselines/${id}/compare`)
    const data = await res.json()
    data.snapshot_id = id
    setComparison(data)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="bg-[#11111198] backdrop-blur-xl border-b border-white/[0.08] text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2 bg-white/10 rounded-lg">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Baseline Snapshots</h1>
            <p className="text-white/40 text-sm">Save & compare project state over time</p>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Create New */}
        <div className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" /> Save New Baseline
          </h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-white/60 mb-1">Snapshot Name</label>
              <input
                type="text"
                className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-white/30"
                placeholder="e.g. Sprint 3 Start, Monthly June..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createBaseline()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Type</label>
              <select
                className="px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                <option value="initial">Initial</option>
                <option value="monthly">Monthly</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <button
              className={cn(
                "px-6 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2",
                !newName.trim() || loading
                  ? "bg-white/[0.06] text-white/30 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
              )}
              onClick={createBaseline}
              disabled={!newName.trim() || loading}
            >
              <Plus className="w-4 h-4" /> Save Snapshot
            </button>
          </div>
        </div>

        {/* Baselines List */}
        <div className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" /> Saved Baselines ({baselines.length})
          </h2>
          {baselines.length === 0 ? (
            <p className="text-white/30 text-sm py-8 text-center">No baselines saved yet. Create one above to track project state over time.</p>
          ) : (
            <div className="space-y-2">
              {baselines.map(b => (
                <div key={b.id} className="flex items-center gap-4 px-4 py-3 bg-white/[0.04] rounded-xl hover:bg-white/[0.08] transition-colors">
                  <div className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider",
                    b.snapshot_type === 'initial' ? "bg-green-500/20 text-green-400" :
                    b.snapshot_type === 'monthly' ? "bg-blue-500/20 text-blue-400" :
                    "bg-white/10 text-white/50"
                  )}>
                    {b.snapshot_type}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">{b.snapshot_name}</div>
                    <div className="text-xs text-white/30">{b.snapshot_date} • {b.created_at}</div>
                  </div>
                  <button
                    className="px-4 py-2 bg-blue-500/15 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/25 transition-colors flex items-center gap-1.5"
                    onClick={() => compareBaseline(b.id)}
                  >
                    <GitCompare className="w-4 h-4" /> Compare
                  </button>
                  <button
                    className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/15 rounded-lg transition-colors"
                    onClick={() => deleteBaseline(b.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comparison View */}
        {comparison && (
          <div className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-purple-400" /> Comparison: {comparison.snapshot_name}
            </h2>
            <p className="text-sm text-white/30 mb-4">Baseline from {comparison.snapshot_date} ({comparison.snapshot_type}) vs. current state</p>
            
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white/[0.04] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{comparison.summary?.tasks_changed || 0}</div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Tasks Changed</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{Math.round(comparison.summary?.total_current_hours || 0)}</div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Current Hours</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-4 text-center">
                <div className={cn(
                  "text-2xl font-bold",
                  (comparison.summary?.total_current_hours || 0) > (comparison.summary?.total_baseline_hours || 0) ? "text-red-400" : "text-green-400"
                )}>
                  {Math.round((comparison.summary?.total_current_hours || 0) - (comparison.summary?.total_baseline_hours || 0))}h
                </div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Hours Delta</div>
              </div>
            </div>

            {/* Delta Table */}
            {comparison.deltas?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/40 uppercase">Task</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/40 uppercase">Resource</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">Hours Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">% Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">Variance Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">Schedule Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {comparison.deltas.map((d, i) => (
                    <tr key={i} className="hover:bg-white/[0.04]">
                      <td className="px-3 py-2 font-medium text-white/80">{d.task}</td>
                      <td className="px-3 py-2 text-white/40">{d.resource || d.change || '—'}</td>
                      <td className={cn("px-3 py-2 text-right font-medium", d.hours_delta > 0 ? "text-red-400" : d.hours_delta < 0 ? "text-green-400" : "text-white/30")}>
                        {d.hours_delta != null ? `${d.hours_delta > 0 ? '+' : ''}${d.hours_delta}` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.pct_delta > 0 ? "text-green-400" : d.pct_delta < 0 ? "text-red-400" : "text-white/30")}>
                        {d.pct_delta != null ? `${d.pct_delta > 0 ? '+' : ''}${d.pct_delta}%` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.variance_delta > 0 ? "text-red-400" : "text-white/30")}>
                        {d.variance_delta != null ? `${d.variance_delta > 0 ? '+' : ''}${d.variance_delta}` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.schedule_slip_days > 0 ? "text-amber-400" : "text-white/30")}>
                        {d.schedule_slip_days != null ? `${d.schedule_slip_days}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-white/30 text-sm text-center py-4">No changes detected since baseline.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
