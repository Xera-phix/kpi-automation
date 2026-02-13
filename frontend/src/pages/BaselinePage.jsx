import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Trash2, GitCompare, Plus, Calendar, Database } from 'lucide-react'

const API_BASE = '/api'
const cn = (...classes) => classes.filter(Boolean).join(' ')

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2 bg-white/10 rounded-lg">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Baseline Snapshots</h1>
            <p className="text-blue-200 text-sm">Save & compare project state over time</p>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Create New */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-500" /> Save New Baseline
          </h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Snapshot Name</label>
              <input
                type="text"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Sprint 3 Start, Monthly June..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createBaseline()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Type</label>
              <select
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
              )}
              onClick={createBaseline}
              disabled={!newName.trim() || loading}
            >
              <Plus className="w-4 h-4" /> Save Snapshot
            </button>
          </div>
        </div>

        {/* Baselines List */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" /> Saved Baselines ({baselines.length})
          </h2>
          {baselines.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">No baselines saved yet. Create one above to track project state over time.</p>
          ) : (
            <div className="space-y-2">
              {baselines.map(b => (
                <div key={b.id} className="flex items-center gap-4 px-4 py-3 bg-slate-50 rounded-xl hover:bg-blue-50/50 transition-colors">
                  <div className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider",
                    b.snapshot_type === 'initial' ? "bg-green-100 text-green-700" :
                    b.snapshot_type === 'monthly' ? "bg-blue-100 text-blue-700" :
                    "bg-slate-200 text-slate-600"
                  )}>
                    {b.snapshot_type}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-800">{b.snapshot_name}</div>
                    <div className="text-xs text-slate-400">{b.snapshot_date} • {b.created_at}</div>
                  </div>
                  <button
                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                    onClick={() => compareBaseline(b.id)}
                  >
                    <GitCompare className="w-4 h-4" /> Compare
                  </button>
                  <button
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-purple-500" /> Comparison: {comparison.snapshot_name}
            </h2>
            <p className="text-sm text-slate-400 mb-4">Baseline from {comparison.snapshot_date} ({comparison.snapshot_type}) vs. current state</p>
            
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">{comparison.summary?.tasks_changed || 0}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Tasks Changed</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">{Math.round(comparison.summary?.total_current_hours || 0)}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Current Hours</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className={cn(
                  "text-2xl font-bold",
                  (comparison.summary?.total_current_hours || 0) > (comparison.summary?.total_baseline_hours || 0) ? "text-red-500" : "text-green-500"
                )}>
                  {Math.round((comparison.summary?.total_current_hours || 0) - (comparison.summary?.total_baseline_hours || 0))}h
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Hours Delta</div>
              </div>
            </div>

            {/* Delta Table */}
            {comparison.deltas?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Task</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Resource</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Hours Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">% Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Variance Δ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Schedule Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {comparison.deltas.map((d, i) => (
                    <tr key={i} className="hover:bg-blue-50/30">
                      <td className="px-3 py-2 font-medium text-slate-700">{d.task}</td>
                      <td className="px-3 py-2 text-slate-500">{d.resource || d.change || '—'}</td>
                      <td className={cn("px-3 py-2 text-right font-medium", d.hours_delta > 0 ? "text-red-500" : d.hours_delta < 0 ? "text-green-500" : "text-slate-400")}>
                        {d.hours_delta != null ? `${d.hours_delta > 0 ? '+' : ''}${d.hours_delta}` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.pct_delta > 0 ? "text-green-500" : d.pct_delta < 0 ? "text-red-500" : "text-slate-400")}>
                        {d.pct_delta != null ? `${d.pct_delta > 0 ? '+' : ''}${d.pct_delta}%` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.variance_delta > 0 ? "text-red-500" : "text-slate-400")}>
                        {d.variance_delta != null ? `${d.variance_delta > 0 ? '+' : ''}${d.variance_delta}` : '—'}
                      </td>
                      <td className={cn("px-3 py-2 text-right", d.schedule_slip_days > 0 ? "text-amber-500" : "text-slate-400")}>
                        {d.schedule_slip_days != null ? `${d.schedule_slip_days}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-400 text-sm text-center py-4">No changes detected since baseline.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
