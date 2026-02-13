import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FlaskConical, UserMinus, CalendarClock, PlusCircle, Play, RotateCcw } from 'lucide-react'

const API_BASE = '/api'
const cn = (...classes) => classes.filter(Boolean).join(' ')

export default function WhatIfPage() {
  const [resources, setResources] = useState([])
  const [tasks, setTasks] = useState([])
  const [mode, setMode] = useState('remove-resource') // remove-resource | slip-schedule | add-hours
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  // Form state
  const [selectedResource, setSelectedResource] = useState('')
  const [redistribute, setRedistribute] = useState(true)
  const [slipWeeks, setSlipWeeks] = useState(2)
  const [selectedTask, setSelectedTask] = useState('')
  const [extraHours, setExtraHours] = useState(20)

  useEffect(() => {
    const load = async () => {
      const [rRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/resources`),
        fetch(`${API_BASE}/tasks`)
      ])
      const r = await rRes.json()
      const t = await tRes.json()
      setResources(r)
      setTasks(t)
      if (r.length) setSelectedResource(r[0].name)
      if (t.length) setSelectedTask(t[0].id)
    }
    load()
  }, [])

  const runScenario = async () => {
    setLoading(true)
    setResult(null)
    let res
    if (mode === 'remove-resource') {
      res = await fetch(`${API_BASE}/what-if/remove-resource`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: selectedResource, redistribute })
      })
    } else if (mode === 'slip-schedule') {
      res = await fetch(`${API_BASE}/what-if/slip-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: slipWeeks })
      })
    } else {
      res = await fetch(`${API_BASE}/what-if/add-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: parseInt(selectedTask), extra_hours: extraHours })
      })
    }
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2 bg-white/10 rounded-lg">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">What-If Scenarios</h1>
            <p className="text-blue-200 text-sm">Simulate changes without affecting real data</p>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Controls */}
          <div className="w-80 space-y-4">
            {/* Mode Selector */}
            <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-5 space-y-3">
              <h3 className="font-semibold text-slate-800">Scenario Type</h3>
              {[
                { id: 'remove-resource', label: 'Remove Resource', icon: UserMinus, desc: 'What if someone leaves?' },
                { id: 'slip-schedule', label: 'Slip Schedule', icon: CalendarClock, desc: 'Push all dates by N weeks' },
                { id: 'add-hours', label: 'Add Hours to Task', icon: PlusCircle, desc: 'What if a task grows?' },
              ].map(s => (
                <button
                  key={s.id}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center gap-3",
                    mode === s.id ? "bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-200" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  )}
                  onClick={() => { setMode(s.id); setResult(null) }}
                >
                  <s.icon className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-slate-400">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Parameters */}
            <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">Parameters</h3>

              {mode === 'remove-resource' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Resource to Remove</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={selectedResource} onChange={e => setSelectedResource(e.target.value)}>
                      {resources.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={redistribute} onChange={e => setRedistribute(e.target.checked)} className="accent-blue-500" />
                    Redistribute tasks to others
                  </label>
                </>
              )}

              {mode === 'slip-schedule' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Weeks to Slip</label>
                  <input type="number" min={1} max={26} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={slipWeeks} onChange={e => setSlipWeeks(parseInt(e.target.value) || 1)} />
                </div>
              )}

              {mode === 'add-hours' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Task</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={selectedTask} onChange={e => setSelectedTask(e.target.value)}>
                      {tasks.filter(t => !tasks.some(x => x.parent_task === t.task)).map(t => (
                        <option key={t.id} value={t.id}>{t.task} ({t.resource})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Extra Hours</label>
                    <input type="number" min={1} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={extraHours} onChange={e => setExtraHours(parseFloat(e.target.value) || 0)} />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2",
                    loading ? "bg-slate-100 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                  )}
                  onClick={runScenario}
                  disabled={loading}
                >
                  <Play className="w-4 h-4" /> Run Scenario
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  onClick={() => setResult(null)}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1">
            {!result ? (
              <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-12 text-center">
                <FlaskConical className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-400">No scenario run yet</h3>
                <p className="text-sm text-slate-300 mt-1">Select a scenario type and click Run to see projected impact.</p>
              </div>
            ) : mode === 'remove-resource' ? (
              <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-800">
                  Impact: Removing <span className="text-red-500">{result.removed_resource}</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-red-600">{result.affected_tasks}</div>
                    <div className="text-xs text-red-400 uppercase">Tasks Affected</div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-amber-600">{Math.round(result.orphaned_hours)}h</div>
                    <div className="text-xs text-amber-400 uppercase">Orphaned Hours</div>
                  </div>
                </div>
                {result.redistribution?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Proposed Redistribution</h4>
                    <div className="space-y-1">
                      {result.redistribution.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-sm">
                          <span className="text-slate-600 flex-1">{r.task}</span>
                          <span className="text-red-400 line-through">{r.from}</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-green-600 font-semibold">{r.to}</span>
                          <span className="text-slate-400 text-xs">{Math.round(r.hours)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : mode === 'slip-schedule' ? (
              <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-800">
                  Impact: Slipping by <span className="text-amber-500">{result.weeks_slipped} weeks</span>
                </h3>
                <div className="bg-amber-50 rounded-xl p-4 text-center mb-4">
                  <div className="text-3xl font-bold text-amber-600">{result.tasks_affected}</div>
                  <div className="text-xs text-amber-400 uppercase">Tasks Pushed</div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Task</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Resource</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase">%</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Old Finish</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">New Finish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {result.changes?.map((c, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-3 py-2 font-medium text-slate-700">{c.task}</td>
                        <td className="px-3 py-2 text-slate-500">{c.resource}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{c.percent_complete}%</td>
                        <td className="px-3 py-2 text-slate-400">{c.old_finish}</td>
                        <td className="px-3 py-2 text-amber-600 font-semibold">{c.new_finish}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-800">
                  Impact: Adding <span className="text-blue-500">+{extraHours}h</span> to {result.task}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Work Hours', old: result.current_work_hours, new: result.projected_work_hours, unit: 'h' },
                    { label: 'Variance', old: result.current_variance, new: result.projected_variance, unit: 'h' },
                    { label: 'Remaining', old: null, new: result.projected_remaining, unit: 'h' },
                    { label: 'Finish Date', old: result.current_finish, new: result.projected_finish, unit: '' },
                  ].map((m, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400 uppercase mb-1">{m.label}</div>
                      {m.old != null && <div className="text-sm text-slate-400 line-through">{m.old}{m.unit}</div>}
                      <div className="text-xl font-bold text-slate-800">{m.new}{m.unit}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
