import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  GitBranch,
  Users,
  AlertTriangle,
  Plus,
  X,
  Trash2,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
  Zap,
  Search,
} from 'lucide-react'

const API = '/api'
import { cn } from '@/lib/utils'

export default function DependenciesPage() {
  const [tasks, setTasks] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [resourceLoad, setResourceLoad] = useState(null)
  const [selectedResource, setSelectedResource] = useState(null)
  const [showAddDep, setShowAddDep] = useState(false)
  const [newDep, setNewDep] = useState({ predecessor_id: '', successor_id: '', dependency_type: 'FS', lag_days: 0 })
  const [searchPred, setSearchPred] = useState('')
  const [searchSucc, setSearchSucc] = useState('')
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'blockers' | 'load'

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const [tasksRes, depsRes, loadRes] = await Promise.all([
      fetch(`${API}/tasks`).then(r => r.json()),
      fetch(`${API}/dependencies`).then(r => r.json()),
      fetch(`${API}/resource-load?weeks=8`).then(r => r.json()),
    ])
    setTasks(tasksRes)
    setDependencies(depsRes)
    setResourceLoad(loadRes)
  }

  // Resources from load data
  const resources = useMemo(() => {
    if (!resourceLoad) return []
    return Object.entries(resourceLoad.load).map(([name, data]) => {
      const totalHours = data.weeks.reduce((a, b) => a + b, 0)
      const maxWeek = Math.max(...data.weeks)
      const avgWeek = totalHours / (data.weeks.length || 1)
      const overloaded = data.weeks.some(w => w > resourceLoad.capacity_per_week)
      return { name, totalHours, maxWeek, avgWeek, overloaded, ...data }
    }).sort((a, b) => b.totalHours - a.totalHours)
  }, [resourceLoad])

  // Tasks grouped by blocker status
  const blockerStats = useMemo(() => {
    const blocked = new Set(dependencies.map(d => d.successor_id))
    const blocking = new Set(dependencies.map(d => d.predecessor_id))
    return {
      totalDeps: dependencies.length,
      blockedTasks: blocked.size,
      blockingTasks: blocking.size,
    }
  }, [dependencies])

  const addDependency = async () => {
    if (!newDep.predecessor_id || !newDep.successor_id) return
    if (newDep.predecessor_id === newDep.successor_id) return

    await fetch(`${API}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predecessor_id: parseInt(newDep.predecessor_id),
        successor_id: parseInt(newDep.successor_id),
        dependency_type: newDep.dependency_type,
        lag_days: parseInt(newDep.lag_days) || 0,
      }),
    })
    setNewDep({ predecessor_id: '', successor_id: '', dependency_type: 'FS', lag_days: 0 })
    setShowAddDep(false)
    fetchAll()
  }

  const removeDep = async (id) => {
    await fetch(`${API}/dependencies/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // Filtered tasks for search
  const filteredPred = tasks.filter(t =>
    t.task.toLowerCase().includes(searchPred.toLowerCase()) ||
    String(t.id).includes(searchPred)
  ).slice(0, 8)

  const filteredSucc = tasks.filter(t =>
    t.task.toLowerCase().includes(searchSucc.toLowerCase()) ||
    String(t.id).includes(searchSucc)
  ).slice(0, 8)

  const getLoadBarColor = (hours, capacity) => {
    if (hours === 0) return 'bg-white/10'
    const ratio = hours / capacity
    if (ratio <= 0.8) return 'bg-green-400'
    if (ratio <= 1.0) return 'bg-amber-400'
    return 'bg-red-500'
  }

  const getLoadBadge = (hours, capacity) => {
    const ratio = hours / capacity
    if (ratio <= 0.5) return { text: 'Light', color: 'bg-green-500/20 text-green-400' }
    if (ratio <= 0.8) return { text: 'Normal', color: 'bg-blue-500/20 text-blue-400' }
    if (ratio <= 1.0) return { text: 'Heavy', color: 'bg-amber-500/20 text-amber-400' }
    return { text: 'OVERLOADED', color: 'bg-red-500/20 text-red-400 font-bold' }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="bg-[#11111198] backdrop-blur-xl border-b border-white/[0.08] text-white shrink-0">
        <div className="max-w-[1920px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-white/40" />
            <h1 className="text-lg font-semibold">Dependencies & Resource Load</h1>
            <span className="ml-2 px-2 py-0.5 bg-amber-400/20 text-amber-300 text-xs rounded-full font-medium">POC</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Tab Toggle */}
            <div className="flex bg-white/[0.06] rounded-lg p-0.5">
              {[
                { key: 'overview', icon: Shield, label: 'Overview' },
                { key: 'blockers', icon: GitBranch, label: 'Blockers' },
                { key: 'load', icon: Users, label: 'Resource Load' },
              ].map(tab => (
                <button
                  key={tab.key}
                  className={cn("px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1",
                    activeTab === tab.key ? "bg-white/15 text-white" : "text-white/50 hover:text-white")}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <tab.icon className="w-3 h-3" /> {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 overflow-auto">

        {/* =================== OVERVIEW TAB =================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl p-5 shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-teal-500/15 rounded-lg"><GitBranch className="w-5 h-5 text-teal-400" /></div>
                  <div>
                    <div className="text-2xl font-bold text-white">{blockerStats.totalDeps}</div>
                    <div className="text-xs text-white/40 uppercase tracking-wide">Dependencies</div>
                  </div>
                </div>
              </div>
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl p-5 shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/15 rounded-lg"><Shield className="w-5 h-5 text-amber-400" /></div>
                  <div>
                    <div className="text-2xl font-bold text-white">{blockerStats.blockedTasks}</div>
                    <div className="text-xs text-white/40 uppercase tracking-wide">Blocked Tasks</div>
                  </div>
                </div>
              </div>
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl p-5 shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/15 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {resources.filter(r => r.overloaded).length}
                    </div>
                    <div className="text-xs text-white/40 uppercase tracking-wide">Overloaded People</div>
                  </div>
                </div>
              </div>
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl p-5 shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/15 rounded-lg"><Users className="w-5 h-5 text-blue-400" /></div>
                  <div>
                    <div className="text-2xl font-bold text-white">{resources.length}</div>
                    <div className="text-xs text-white/40 uppercase tracking-wide">Team Members</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Split view: Dependencies + Resource Summary */}
            <div className="grid grid-cols-2 gap-6">
              {/* Dependencies List */}
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-teal-400" /> Active Blockers
                  </span>
                  <button
                    className="flex items-center gap-1 px-3 py-1 bg-teal-500/15 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-500/25 transition-colors"
                    onClick={() => setShowAddDep(true)}
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
                  {dependencies.length === 0 ? (
                    <div className="px-5 py-8 text-center text-white/30 text-sm">
                      <GitBranch className="w-8 h-8 mx-auto mb-2 text-white/10" />
                      No blockers defined yet.<br />
                      <span className="text-xs">Add dependencies only for tasks that genuinely block others.</span>
                    </div>
                  ) : (
                    dependencies.map(dep => (
                      <div key={dep.id} className="px-5 py-3 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium text-white/80 truncate" title={dep.predecessor_name}>
                                #{dep.predecessor_id} {dep.predecessor_name}
                              </span>
                              <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
                              <span className="text-white/50 truncate" title={dep.successor_name}>
                                #{dep.successor_id} {dep.successor_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-1.5 py-0.5 bg-white/[0.06] rounded text-white/40">
                                {dep.dependency_type === 'FS' ? 'Finish→Start' :
                                 dep.dependency_type === 'SS' ? 'Start→Start' :
                                 dep.dependency_type === 'FF' ? 'Finish→Finish' : dep.dependency_type}
                              </span>
                              {dep.lag_days > 0 && (
                                <span className="text-xs text-white/30">+{dep.lag_days}d lag</span>
                              )}
                              {dep.predecessor_resource && (
                                <span className="text-xs text-white/30">{dep.predecessor_resource}</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="p-1.5 hover:bg-red-500/15 text-white/20 hover:text-red-400 rounded-lg transition-colors"
                            onClick={() => removeDep(dep.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Resource Load Summary */}
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06]">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" /> Resource Load (8 weeks)
                  </span>
                </div>
                <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
                  {resources.map(res => {
                    const badge = getLoadBadge(res.avgWeek, resourceLoad?.capacity_per_week || 40)
                    return (
                      <button
                        key={res.name}
                        className={cn(
                          "w-full px-5 py-3 hover:bg-white/[0.04] transition-colors text-left",
                          selectedResource === res.name && "bg-blue-500/10"
                        )}
                        onClick={() => setSelectedResource(selectedResource === res.name ? null : res.name)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-white">{res.name}</span>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", badge.color)}>{badge.text}</span>
                        </div>
                        {/* Weekly bars */}
                        <div className="flex items-end gap-1 h-8">
                          {res.weeks.map((h, i) => {
                            const ratio = h / (resourceLoad?.capacity_per_week || 40)
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center" title={`${resourceLoad?.weeks[i]}: ${Math.round(h)}h`}>
                                <div
                                  className={cn("w-full rounded-t-sm transition-all", getLoadBarColor(h, resourceLoad?.capacity_per_week || 40))}
                                  style={{ height: `${Math.min(ratio * 32, 32)}px` }}
                                />
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex justify-between text-xs text-white/30 mt-1">
                          <span>{Math.round(res.totalHours)}h total</span>
                          <span>Peak: {Math.round(res.maxWeek)}h/wk</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Selected Resource Detail */}
            {selectedResource && resourceLoad && (
              <div className="bg-[#11111198] backdrop-blur-sm rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="font-semibold text-white">
                    📋 {selectedResource}'s Tasks
                  </span>
                  <button onClick={() => setSelectedResource(null)} className="p-1 hover:bg-white/10 rounded">
                    <X className="w-4 h-4 text-white/30" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.03] text-xs text-white/40 uppercase tracking-wider">
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">Task</th>
                        <th className="px-4 py-2 text-right">Hours</th>
                        <th className="px-4 py-2 text-right">Remaining</th>
                        <th className="px-4 py-2 text-right">%</th>
                        <th className="px-4 py-2 text-left">Start</th>
                        <th className="px-4 py-2 text-left">End</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {(resourceLoad.load[selectedResource]?.tasks || []).map(t => (
                        <tr key={t.id} className="hover:bg-white/[0.04]">
                          <td className="px-4 py-2 text-white/30">{t.id}</td>
                          <td className="px-4 py-2 text-white/80 font-medium">{t.name}</td>
                          <td className="px-4 py-2 text-right text-white/50">{Math.round(t.hours)}</td>
                          <td className="px-4 py-2 text-right text-blue-400">{Math.round(t.remaining || 0)}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={cn("font-medium",
                              t.percent >= 100 ? "text-green-400" : "text-white/40"
                            )}>
                              {t.percent}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-white/30 text-xs">{t.start}</td>
                          <td className="px-4 py-2 text-white/30 text-xs">{t.end}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================== BLOCKERS TAB =================== */}
        {activeTab === 'blockers' && (
          <div className="space-y-6">
            {/* Visual Dependency Graph */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-teal-500" /> Dependency Chain Visualization
                </span>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-medium hover:bg-teal-600 transition-colors"
                  onClick={() => setShowAddDep(true)}
                >
                  <Plus className="w-3 h-3" /> Add Blocker
                </button>
              </div>

              {dependencies.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <GitBranch className="w-12 h-12 mx-auto mb-3 text-white/10" />
                  <h3 className="text-lg font-semibold text-white/30 mb-1">No Blockers Yet</h3>
                  <p className="text-sm text-white/20 max-w-md mx-auto">
                    Dependencies are optional — only add them when one task genuinely blocks another.
                    Most tasks on this team don't have strict predecessors.
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  {/* Dependency chain cards */}
                  <div className="space-y-3">
                    {dependencies.map(dep => {
                      const pred = tasks.find(t => t.id === dep.predecessor_id)
                      const succ = tasks.find(t => t.id === dep.successor_id)
                      if (!pred || !succ) return null

                      return (
                        <div key={dep.id} className="flex items-center gap-3 group">
                          {/* Predecessor Card */}
                          <div className={cn(
                            "flex-1 p-3 rounded-xl border-2 transition-colors",
                            pred.percent_complete >= 100
                              ? "border-green-500/30 bg-green-500/10"
                              : "border-amber-500/30 bg-amber-500/10"
                          )}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs text-white/30">#{pred.id}</span>
                                <h4 className="font-semibold text-sm text-white">{pred.task}</h4>
                                <span className="text-xs text-white/40">{pred.resource}</span>
                              </div>
                              <div className="text-right">
                                <div className={cn(
                                  "text-lg font-bold",
                                  pred.percent_complete >= 100 ? "text-green-400" : "text-amber-400"
                                )}>
                                  {pred.percent_complete}%
                                </div>
                                <div className="text-xs text-white/30">{Math.round(pred.work_hours)}h</div>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full",
                                  pred.percent_complete >= 100 ? "bg-green-500" : "bg-amber-400"
                                )}
                                style={{ width: `${pred.percent_complete}%` }}
                              />
                            </div>
                          </div>

                          {/* Arrow */}
                          <div className="flex flex-col items-center shrink-0">
                            <span className="text-xs text-white/30 mb-0.5">
                              {dep.dependency_type === 'FS' ? 'finish → start' : dep.dependency_type}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <div className="w-8 h-0.5 bg-teal-400/50 rounded" />
                              <ArrowRight className="w-4 h-4 text-teal-400" />
                            </div>
                            {dep.lag_days > 0 && (
                              <span className="text-xs text-white/30 mt-0.5">+{dep.lag_days}d</span>
                            )}
                          </div>

                          {/* Successor Card */}
                          <div className={cn(
                            "flex-1 p-3 rounded-xl border-2 transition-colors",
                            pred.percent_complete >= 100
                              ? "border-blue-500/30 bg-blue-500/10"
                              : "border-white/10 bg-white/[0.04]"
                          )}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs text-white/30">#{succ.id}</span>
                                <h4 className="font-semibold text-sm text-white">{succ.task}</h4>
                                <span className="text-xs text-white/40">{succ.resource}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-white/60">
                                  {succ.percent_complete}%
                                </div>
                                <div className="text-xs text-white/30">{Math.round(succ.work_hours)}h</div>
                              </div>
                            </div>
                            {pred.percent_complete < 100 && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-amber-400 bg-amber-500/15 px-2 py-1 rounded-lg">
                                <Shield className="w-3 h-3" /> Blocked until predecessor completes
                              </div>
                            )}
                          </div>

                          {/* Delete */}
                          <button
                            className="p-2 hover:bg-red-500/15 text-white/20 hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            onClick={() => removeDep(dep.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================== RESOURCE LOAD TAB =================== */}
        {activeTab === 'load' && resourceLoad && (
          <div className="space-y-6">
            {/* Weekly Load Heatmap */}
            <div className="bg-[#11111198] backdrop-blur-sm rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <span className="font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" /> Weekly Resource Load
                </span>
                <p className="text-xs text-white/30 mt-0.5">Capacity: {resourceLoad.capacity_per_week}h/week per person. Red = overloaded.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.03]">
                      <th className="text-left py-2.5 px-4 text-xs text-white/40 font-semibold uppercase sticky left-0 bg-[#111111] z-10 w-36">Resource</th>
                      {resourceLoad.weeks.map((w, i) => (
                        <th key={i} className="py-2.5 px-3 text-center text-xs text-white/40 font-medium whitespace-nowrap">{w}</th>
                      ))}
                      <th className="py-2.5 px-4 text-right text-xs text-white/40 font-semibold uppercase">Avg/Wk</th>
                      <th className="py-2.5 px-4 text-center text-xs text-white/40 font-semibold uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {resources.map(res => {
                      const badge = getLoadBadge(res.avgWeek, resourceLoad.capacity_per_week)
                      return (
                        <tr key={res.name} className="hover:bg-white/[0.04]">
                          <td className="py-2 px-4 font-medium text-white/80 sticky left-0 bg-[#111111] z-10">
                            <button
                              className="hover:text-blue-400 transition-colors text-left"
                              onClick={() => { setSelectedResource(res.name); setActiveTab('overview') }}
                            >
                              {res.name}
                            </button>
                          </td>
                          {res.weeks.map((h, i) => {
                            const ratio = h / resourceLoad.capacity_per_week
                            const cellColor = h === 0 ? 'bg-white/[0.03] text-white/20'
                              : ratio <= 0.5 ? 'bg-green-500/10 text-green-400'
                              : ratio <= 0.8 ? 'bg-green-500/15 text-green-300'
                              : ratio <= 1.0 ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-red-500/20 text-red-300 font-bold'
                            return (
                              <td key={i} className={cn("py-2 px-3 text-center text-xs rounded-sm", cellColor)}>
                                {h > 0 ? Math.round(h) : '–'}
                              </td>
                            )
                          })}
                          <td className="py-2 px-4 text-right text-xs font-semibold text-white/60">
                            {Math.round(res.avgWeek)}h
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full", badge.color)}>{badge.text}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overload Alerts */}
            {resources.filter(r => r.overloaded).length > 0 && (
              <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-5">
                <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5" /> Overload Alerts
                </h3>
                <div className="space-y-2">
                  {resources.filter(r => r.overloaded).map(res => (
                    <div key={res.name} className="bg-white/[0.04] rounded-lg p-3 border border-red-500/15">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-red-300">{res.name}</span>
                        <span className="text-xs text-red-400">Peak: {Math.round(res.maxWeek)}h/week ({Math.round(res.maxWeek / resourceLoad.capacity_per_week * 100)}% capacity)</span>
                      </div>
                      <div className="flex gap-1">
                        {res.weeks.map((h, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 h-6 rounded flex items-center justify-center text-xs",
                              h > resourceLoad.capacity_per_week ? "bg-red-500/20 text-red-300 font-bold" :
                              h > resourceLoad.capacity_per_week * 0.8 ? "bg-amber-500/15 text-amber-300" :
                              "bg-green-500/15 text-green-400"
                            )}
                          >
                            {Math.round(h)}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-white/30">
                        {resourceLoad.weeks.map((w, i) => (
                          <span key={i} className="flex-1 text-center">{w}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Dependency Modal */}
      {showAddDep && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddDep(false)}>
          <div className="bg-[#111111] rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-white/[0.08] w-[540px] max-h-[600px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-teal-400" /> Add Blocker Dependency
              </h3>
              <button className="p-1.5 hover:bg-white/10 rounded-lg" onClick={() => setShowAddDep(false)}>
                <X className="w-5 h-5 text-white/30" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-white/40">
                Only add a dependency when one task <strong className="text-white/60">must</strong> complete before another can start.
                This is mainly to prevent resource overloading, not for typical task ordering.
              </p>

              {/* Predecessor */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1 block">
                  Predecessor (must finish first)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/30" />
                  <input
                    className="w-full pl-9 pr-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white placeholder-white/30"
                    placeholder="Search by task name or ID..."
                    value={searchPred}
                    onChange={e => { setSearchPred(e.target.value); setNewDep({ ...newDep, predecessor_id: '' }) }}
                  />
                </div>
                {searchPred && !newDep.predecessor_id && (
                  <div className="mt-1 border border-white/10 bg-[#111111] rounded-lg max-h-32 overflow-y-auto">
                    {filteredPred.map(t => (
                      <button
                        key={t.id}
                        className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/[0.06] transition-colors"
                        onClick={() => { setNewDep({ ...newDep, predecessor_id: t.id }); setSearchPred(`#${t.id} ${t.task}`) }}
                      >
                        <span className="text-white/30">#{t.id}</span> {t.task}
                        <span className="text-xs text-white/30 ml-2">{t.resource}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Successor */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1 block">
                  Successor (blocked until predecessor finishes)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/30" />
                  <input
                    className="w-full pl-9 pr-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white placeholder-white/30"
                    placeholder="Search by task name or ID..."
                    value={searchSucc}
                    onChange={e => { setSearchSucc(e.target.value); setNewDep({ ...newDep, successor_id: '' }) }}
                  />
                </div>
                {searchSucc && !newDep.successor_id && (
                  <div className="mt-1 border border-white/10 bg-[#111111] rounded-lg max-h-32 overflow-y-auto">
                    {filteredSucc.map(t => (
                      <button
                        key={t.id}
                        className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/[0.06] transition-colors"
                        onClick={() => { setNewDep({ ...newDep, successor_id: t.id }); setSearchSucc(`#${t.id} ${t.task}`) }}
                      >
                        <span className="text-white/30">#{t.id}</span> {t.task}
                        <span className="text-xs text-white/30 ml-2">{t.resource}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Type + Lag */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1 block">Type</label>
                  <select
                    className="w-full px-3 py-2 bg-[#111111] border border-white/10 rounded-lg text-sm text-white"
                    value={newDep.dependency_type}
                    onChange={e => setNewDep({ ...newDep, dependency_type: e.target.value })}
                  >
                    <option value="FS">Finish → Start (most common)</option>
                    <option value="SS">Start → Start</option>
                    <option value="FF">Finish → Finish</option>
                    <option value="SF">Start → Finish</option>
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1 block">Lag (days)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white"
                    value={newDep.lag_days}
                    onChange={e => setNewDep({ ...newDep, lag_days: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-white/50 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => setShowAddDep(false)}
              >
                Cancel
              </button>
              <button
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  newDep.predecessor_id && newDep.successor_id
                    ? "bg-teal-500 text-white hover:bg-teal-600 shadow-[0_0_15px_rgba(20,184,166,0.3)]"
                    : "bg-white/[0.06] text-white/20 cursor-not-allowed"
                )}
                onClick={addDependency}
                disabled={!newDep.predecessor_id || !newDep.successor_id}
              >
                Add Dependency
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
