import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Briefcase, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE = '/api'

const healthColors = {
  'on-track': { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
  'over-budget': { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  'behind-schedule': { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
}

const statusColors = {
  'complete': 'bg-green-500',
  'in-progress': 'bg-blue-500',
  'not-started': 'bg-white/20',
}

export default function ManagementPage() {
  const [timeline, setTimeline] = useState([])
  const [mismatchWarnings, setMismatchWarnings] = useState([])

  useEffect(() => {
    const load = async () => {
      const [tRes, mRes] = await Promise.all([
        fetch(`${API_BASE}/management-timeline`),
        fetch(`${API_BASE}/mismatch-warnings`)
      ])
      setTimeline(await tRes.json())
      setMismatchWarnings(await mRes.json())
    }
    load()
  }, [])

  // Find date range for the bar chart
  const allDates = timeline.flatMap(p => [p.start_date, p.finish_date]).filter(Boolean)
  const minDate = allDates.length ? new Date(Math.min(...allDates.map(d => new Date(d)))) : new Date()
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map(d => new Date(d)))) : new Date()
  const totalDays = Math.max((maxDate - minDate) / (1000 * 60 * 60 * 24), 1)

  const getBarStyle = (start, end) => {
    if (!start || !end) return { left: '0%', width: '100%' }
    const s = new Date(start)
    const e = new Date(end)
    const left = ((s - minDate) / (1000 * 60 * 60 * 24)) / totalDays * 100
    const width = ((e - s) / (1000 * 60 * 60 * 24)) / totalDays * 100
    return { left: `${Math.max(left, 0)}%`, width: `${Math.max(width, 2)}%` }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="bg-[#11111198] backdrop-blur-xl border-b border-white/[0.08] text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2 bg-white/10 rounded-lg">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Management Timeline</h1>
            <p className="text-white/40 text-sm">High-level project overview for stakeholders</p>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Project Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {timeline.map(proj => {
            const hc = healthColors[proj.health] || healthColors['on-track']
            return (
              <div key={proj.project} className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] p-5 hover:shadow-[0_0_30px_rgba(0,0,0,0.4)] transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-white text-lg">{proj.project}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold uppercase", hc.bg, hc.text)}>
                        {proj.health}
                      </span>
                      <span className="text-xs text-white/30">{proj.task_count} tasks</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{Math.round(proj.percent_complete)}%</div>
                    <div className="text-xs text-white/30">{proj.start_date} → {proj.finish_date}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                  <div
                    className={cn("h-full rounded-full transition-all", statusColors[proj.status] || 'bg-blue-500')}
                    style={{ width: `${proj.percent_complete}%` }}
                  />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span>Hours: <b className="text-white/70">{Math.round(proj.total_hours)}</b></span>
                  <span>Remaining: <b className="text-blue-400">{Math.round(proj.hours_remaining)}</b></span>
                  <span className={proj.variance > 0 ? "text-red-400" : "text-green-400"}>
                    Variance: <b>{proj.variance > 0 ? '+' : ''}{Math.round(proj.variance)}h</b>
                  </span>
                  <span className="ml-auto">{proj.resources?.join(', ')}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Gantt-style timeline bars */}
        <div className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/[0.08] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Timeline View</h2>
          <div className="space-y-3">
            {timeline.map(proj => {
              const bar = getBarStyle(proj.start_date, proj.finish_date)
              const hc = healthColors[proj.health] || healthColors['on-track']
              return (
                <div key={proj.project} className="flex items-center gap-4">
                  <div className="w-52 text-sm font-medium text-white/70 truncate shrink-0">{proj.project}</div>
                  <div className="flex-1 relative h-8 bg-white/[0.04] rounded-lg overflow-hidden">
                    {/* Full bar */}
                    <div
                      className="absolute top-0 h-full rounded-lg bg-white/10 opacity-50"
                      style={bar}
                    />
                    {/* Progress fill */}
                    <div
                      className={cn("absolute top-0 h-full rounded-lg", statusColors[proj.status])}
                      style={{
                        left: bar.left,
                        width: `${parseFloat(bar.width) * proj.percent_complete / 100}%`
                      }}
                    />
                    {/* Label */}
                    <div
                      className="absolute top-0 h-full flex items-center px-2 text-xs font-semibold text-white drop-shadow-sm"
                      style={{ left: bar.left }}
                    >
                      {Math.round(proj.percent_complete)}%
                    </div>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded text-xs font-bold shrink-0", hc.bg, hc.text)}>
                    {proj.health}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Date axis */}
          <div className="flex justify-between mt-3 ml-56 text-xs text-white/30">
            <span>{minDate.toLocaleDateString()}</span>
            <span>{maxDate.toLocaleDateString()}</span>
          </div>
        </div>

        {/* Mismatch Warnings */}
        {mismatchWarnings.length > 0 && (
          <div className="bg-[#11111198] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-amber-500/20 p-6">
            <h2 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
              ⚠️ Hours vs Progress Mismatches ({mismatchWarnings.length})
            </h2>
            <div className="space-y-2">
              {mismatchWarnings.map(w => (
                <div key={w.task_id} className="flex items-center gap-4 px-4 py-3 bg-amber-500/5 rounded-xl text-sm">
                  <div className="flex-1">
                    <span className="font-semibold text-white">{w.task}</span>
                    <span className="text-white/30 ml-2">({w.resource})</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white/40">Hours imply <b>{w.hours_implied_pct}%</b></span>
                    <ChevronRight className="inline w-4 h-4 text-white/20 mx-1" />
                    <span className="text-white/40">Reported <b>{w.percent_complete}%</b></span>
                    <span className={cn(
                      "ml-2 px-2 py-0.5 rounded-full text-xs font-bold",
                      w.direction === 'ahead' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {w.gap} pts {w.direction}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
