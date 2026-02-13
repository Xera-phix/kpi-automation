import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Diamond,
  Plus,
  X,
  Calendar,
  Users,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Milestone,
  Layers,
} from 'lucide-react'

const API = '/api'
import { cn } from '@/lib/utils'

// Date helpers
const parseDate = (dateStr) => {
  if (!dateStr) return null
  // Try MM/DD/YYYY first
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
  }
  return new Date(dateStr)
}

const daysBetween = (d1, d2) => Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`

const ZOOM_LEVELS = [
  { key: 'month', label: 'Month', dayWidth: 4 },
  { key: 'quarter', label: 'Quarter', dayWidth: 1.5 },
  { key: 'year', label: 'Year', dayWidth: 0.5 },
]

const BAR_HEIGHT = 22
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 56

export default function TimelinePage() {
  const [tasks, setTasks] = useState([])
  const [milestones, setMilestones] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [forecast, setForecast] = useState(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [groupBy, setGroupBy] = useState('hierarchy') // 'hierarchy' | 'resource'
  const [showForecast, setShowForecast] = useState(true)
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [newMs, setNewMs] = useState({ name: '', date: '', color: '#9333ea' })
  const [collapsedParents, setCollapsedParents] = useState(new Set())
  const scrollRef = useRef(null)
  const leftPanelRef = useRef(null)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const [timelineRes, forecastRes] = await Promise.all([
      fetch(`${API}/timeline`).then(r => r.json()),
      fetch(`${API}/labor-forecast?months=12`).then(r => r.json()),
    ])
    setTasks(timelineRes.tasks || [])
    setMilestones(timelineRes.milestones || [])
    setDependencies(timelineRes.dependencies || [])
    setForecast(forecastRes)
  }

  const zoom = ZOOM_LEVELS[zoomIdx]

  // Calculate time range from task data
  const { timelineStart, timelineEnd, totalDays, months } = useMemo(() => {
    const dates = tasks
      .map(t => [parseDate(t.start_date), parseDate(t.finish_date)])
      .flat()
      .filter(Boolean)

    if (dates.length === 0) {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 13, 0)
      return { timelineStart: start, timelineEnd: end, totalDays: daysBetween(start, end), months: [] }
    }

    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    // Add padding
    const start = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1)
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0)
    const total = daysBetween(start, end)

    // Generate month headers
    const monthHeaders = []
    let cursor = new Date(start)
    while (cursor <= end) {
      const monthStart = new Date(cursor)
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const daysInMonth = daysBetween(monthStart, nextMonth)
      monthHeaders.push({
        label: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        fullLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        offset: daysBetween(start, monthStart),
        width: daysInMonth,
        isCurrentMonth: monthStart.getMonth() === new Date().getMonth() && monthStart.getFullYear() === new Date().getFullYear(),
      })
      cursor = nextMonth
    }

    return { timelineStart: start, timelineEnd: end, totalDays: total, months: monthHeaders }
  }, [tasks])

  const totalWidth = totalDays * zoom.dayWidth
  const today = new Date()
  const todayOffset = timelineStart ? daysBetween(timelineStart, today) * zoom.dayWidth : 0

  // Group and filter tasks
  const displayTasks = useMemo(() => {
    let ordered = []
    if (groupBy === 'hierarchy') {
      // Parent tasks first, then children nested under them
      const parents = tasks.filter(t => !t.parent_task || t.parent_task === '')
      const children = tasks.filter(t => t.parent_task && t.parent_task !== '')

      parents.forEach(parent => {
        const isParent = children.some(c => c.parent_task === parent.task)
        ordered.push({ ...parent, _isParent: isParent, _depth: 0 })
        if (isParent && !collapsedParents.has(parent.task)) {
          children
            .filter(c => c.parent_task === parent.task)
            .forEach(child => {
              ordered.push({ ...child, _isParent: false, _depth: 1 })
            })
        }
      })
    } else {
      // Group by resource
      const byResource = {}
      tasks.forEach(t => {
        const res = t.resource || 'Unassigned'
        if (!byResource[res]) byResource[res] = []
        byResource[res].push(t)
      })
      Object.entries(byResource).forEach(([resource, rTasks]) => {
        ordered.push({ _isSwimlane: true, _label: resource, _count: rTasks.length })
        rTasks.forEach(t => ordered.push({ ...t, _depth: 0 }))
      })
    }
    return ordered
  }, [tasks, groupBy, collapsedParents])

  // Bar positioning
  const getBarProps = (task) => {
    const start = parseDate(task.start_date)
    const end = parseDate(task.finish_date)
    if (!start || !end || !timelineStart) return null

    const x = daysBetween(timelineStart, start) * zoom.dayWidth
    const width = Math.max(daysBetween(start, end) * zoom.dayWidth, 4)
    const progress = (task.percent_complete || 0) / 100

    return { x, width, progress }
  }

  // Scroll sync
  const handleScroll = (e) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.target.scrollTop
    }
  }

  const toggleParent = (taskName) => {
    setCollapsedParents(prev => {
      const next = new Set(prev)
      if (next.has(taskName)) next.delete(taskName)
      else next.add(taskName)
      return next
    })
  }

  const addMilestone = async () => {
    if (!newMs.name || !newMs.date) return
    await fetch(`${API}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMs),
    })
    setNewMs({ name: '', date: '', color: '#9333ea' })
    setShowMilestoneForm(false)
    fetchAll()
  }

  const removeMilestone = async (id) => {
    await fetch(`${API}/milestones/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // Milestone positions
  const milestonePositions = milestones.map(ms => {
    const d = parseDate(ms.date)
    if (!d || !timelineStart) return null
    return {
      ...ms,
      x: daysBetween(timelineStart, d) * zoom.dayWidth,
    }
  }).filter(Boolean)

  // Get bar color based on status
  const getBarColor = (task) => {
    if (task._isParent) return { bg: '#475569', fill: '#334155' } // slate-600
    const pct = task.percent_complete || 0
    if (pct >= 100) return { bg: '#22c55e', fill: '#16a34a' }
    const variance = task.variance || 0
    if (variance > 50) return { bg: '#ef4444', fill: '#dc2626' }
    if (variance > 0) return { bg: '#f59e0b', fill: '#d97706' }
    return { bg: '#3b82f6', fill: '#2563eb' }
  }

  // Labor forecast heatmap colors
  const getLoadColor = (hours, capacity = 160) => {
    if (hours === 0) return 'bg-white/[0.03] text-white/20'
    const ratio = hours / capacity
    if (ratio <= 0.5) return 'bg-green-500/15 text-green-400'
    if (ratio <= 0.8) return 'bg-green-500/25 text-green-300'
    if (ratio <= 1.0) return 'bg-amber-500/20 text-amber-400'
    return 'bg-red-500/25 text-red-400 font-bold'
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
            <Calendar className="w-5 h-5 text-white/40" />
            <h1 className="text-lg font-semibold">Timeline & Gantt</h1>
            <span className="ml-2 px-2 py-0.5 bg-amber-400/20 text-amber-300 text-xs rounded-full font-medium">POC</span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Group By Toggle */}
            <div className="flex bg-white/[0.06] rounded-lg p-0.5">
              <button
                className={cn("px-3 py-1.5 text-xs rounded-md transition-all font-medium",
                  groupBy === 'hierarchy' ? "bg-white/15 text-white" : "text-white/50 hover:text-white")}
                onClick={() => setGroupBy('hierarchy')}
              >
                <Layers className="w-3 h-3 inline mr-1" /> Hierarchy
              </button>
              <button
                className={cn("px-3 py-1.5 text-xs rounded-md transition-all font-medium",
                  groupBy === 'resource' ? "bg-white/15 text-white" : "text-white/50 hover:text-white")}
                onClick={() => setGroupBy('resource')}
              >
                <Users className="w-3 h-3 inline mr-1" /> Resource
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white/[0.06] rounded-lg p-0.5">
              <button
                className="p-1.5 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30"
                onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))}
                disabled={zoomIdx === 0}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-medium">{zoom.label}</span>
              <button
                className="p-1.5 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30"
                onClick={() => setZoomIdx(Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1))}
                disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            {/* Add Milestone */}
            <button
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
              onClick={() => setShowMilestoneForm(!showMilestoneForm)}
            >
              <Diamond className="w-3 h-3" /> Milestone
            </button>
          </div>
        </div>
      </header>

      {/* Milestone Form */}
      {showMilestoneForm && (
        <div className="bg-[#111111] border-b border-white/[0.06] px-6 py-3 flex items-center gap-3">
          <input
            className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white w-48 placeholder-white/30"
            placeholder="Milestone name"
            value={newMs.name}
            onChange={e => setNewMs({ ...newMs, name: e.target.value })}
          />
          <input
            type="date"
            className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white"
            value={newMs.date}
            onChange={e => setNewMs({ ...newMs, date: e.target.value })}
          />
          <input
            type="color"
            className="w-8 h-8 rounded cursor-pointer"
            value={newMs.color}
            onChange={e => setNewMs({ ...newMs, color: e.target.value })}
          />
          <button className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600" onClick={addMilestone}>Add</button>
          <button className="p-1.5 hover:bg-white/10 rounded-lg text-white/50" onClick={() => setShowMilestoneForm(false)}><X className="w-4 h-4" /></button>

          {milestones.length > 0 && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l">
              {milestones.map(ms => (
                <span key={ms.id} className="flex items-center gap-1 text-xs bg-white/[0.06] text-white/60 px-2 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: ms.color, transform: 'rotate(45deg)' }} />
                  {ms.name}
                  <button className="hover:text-red-400 ml-0.5" onClick={() => removeMilestone(ms.id)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Gantt Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Task List */}
        <div className="w-80 bg-[#111111] border-r border-white/[0.06] flex flex-col shrink-0">
          {/* Header */}
          <div className="flex items-center bg-white/[0.03] border-b border-white/[0.06] px-3 text-xs font-semibold text-white/40 uppercase tracking-wider" style={{ height: HEADER_HEIGHT }}>
            <span className="flex-1">Task</span>
            <span className="w-16 text-right">Work</span>
            <span className="w-12 text-right">%</span>
          </div>
          {/* Task Rows */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={leftPanelRef}>
            {displayTasks.map((task, i) => {
              if (task._isSwimlane) {
                return (
                  <div key={`swim-${task._label}`} className="flex items-center px-3 bg-blue-500/10 border-b border-blue-500/10 font-semibold text-blue-400 text-xs uppercase tracking-wider" style={{ height: ROW_HEIGHT }}>
                    <Users className="w-3 h-3 mr-2" />
                    {task._label} ({task._count})
                  </div>
                )
              }
              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-center px-3 border-b border-white/[0.04] text-sm hover:bg-white/[0.04] transition-colors",
                    task._isParent && "bg-white/[0.03]"
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="flex-1 flex items-center gap-1 truncate" style={{ paddingLeft: task._depth ? 16 : 0 }}>
                    {task._isParent && (
                      <button className="p-0.5 hover:bg-white/10 rounded" onClick={() => toggleParent(task.task)}>
                        {collapsedParents.has(task.task) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                    {task._depth > 0 && <span className="text-white/20 text-xs mr-0.5">└</span>}
                    <span className={cn("truncate", task._isParent ? "font-semibold text-white" : "text-white/60")} title={task.task}>
                      {task.task}
                    </span>
                  </div>
                  <span className="w-16 text-right text-xs text-white/40">{Math.round(task.work_hours || 0)}</span>
                  <span className={cn("w-12 text-right text-xs font-medium",
                    (task.percent_complete || 0) >= 100 ? "text-green-400" : "text-white/40"
                  )}>
                    {task.percent_complete || 0}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Panel - Timeline */}
        <div className="flex-1 overflow-x-auto overflow-y-auto" ref={scrollRef} onScroll={handleScroll}>
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* Month Headers */}
            <div className="sticky top-0 z-10 bg-[#111111] border-b border-white/[0.06]" style={{ height: HEADER_HEIGHT }}>
              <div className="relative h-full">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "absolute top-0 h-full border-r border-white/[0.06] flex items-end pb-2 px-2",
                      m.isCurrentMonth && "bg-blue-500/10"
                    )}
                    style={{ left: m.offset * zoom.dayWidth, width: m.width * zoom.dayWidth }}
                  >
                    <span className={cn("text-xs font-medium whitespace-nowrap",
                      m.isCurrentMonth ? "text-blue-400" : "text-white/40"
                    )}>
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* SVG Gantt Bars */}
            <svg
              width={totalWidth}
              height={displayTasks.length * ROW_HEIGHT + 20}
              className="block"
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
                {/* Gradient for bars */}
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
                </linearGradient>
              </defs>

              {/* Month grid lines */}
              {months.map((m, i) => (
                <line
                  key={i}
                  x1={m.offset * zoom.dayWidth}
                  y1={0}
                  x2={m.offset * zoom.dayWidth}
                  y2={displayTasks.length * ROW_HEIGHT + 20}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              ))}

              {/* Today marker */}
              {todayOffset > 0 && todayOffset < totalWidth && (
                <g>
                  <line
                    x1={todayOffset} y1={0}
                    x2={todayOffset} y2={displayTasks.length * ROW_HEIGHT + 20}
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="6 3"
                    opacity="0.7"
                  />
                  <rect x={todayOffset - 22} y={0} width={44} height={16} rx={4} fill="#ef4444" />
                  <text x={todayOffset} y={12} textAnchor="middle" fill="white" fontSize="9" fontWeight="600">Today</text>
                </g>
              )}

              {/* Milestone diamonds */}
              {milestonePositions.map((ms, i) => (
                <g key={`ms-${i}`}>
                  <line
                    x1={ms.x} y1={18}
                    x2={ms.x} y2={displayTasks.length * ROW_HEIGHT + 20}
                    stroke={ms.color}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    opacity="0.4"
                  />
                  <rect
                    x={ms.x - 6} y={22}
                    width={12} height={12}
                    rx={2}
                    fill={ms.color}
                    transform={`rotate(45 ${ms.x} ${28})`}
                  />
                  <text x={ms.x + 12} y={32} fill={ms.color} fontSize="10" fontWeight="600">{ms.name}</text>
                </g>
              ))}

              {/* Task Bars */}
              {displayTasks.map((task, i) => {
                if (task._isSwimlane) {
                  return (
                    <rect
                      key={`swim-${i}`}
                      x={0} y={i * ROW_HEIGHT}
                      width={totalWidth} height={ROW_HEIGHT}
                      fill="rgba(59,130,246,0.08)"
                      opacity="0.5"
                    />
                  )
                }

                const bar = getBarProps(task)
                if (!bar) return null

                const yCenter = i * ROW_HEIGHT + ROW_HEIGHT / 2
                const yTop = yCenter - BAR_HEIGHT / 2
                const colors = getBarColor(task)

                if (task._isParent) {
                  // Summary bar - thinner with end caps
                  return (
                    <g key={task.id}>
                      <rect x={bar.x} y={yCenter - 4} width={bar.width} height={8} rx={1} fill={colors.bg} />
                      {/* Left cap */}
                      <polygon points={`${bar.x},${yCenter - 4} ${bar.x},${yCenter + 8} ${bar.x + 5},${yCenter + 4}`} fill={colors.bg} />
                      {/* Right cap */}
                      <polygon points={`${bar.x + bar.width},${yCenter - 4} ${bar.x + bar.width},${yCenter + 8} ${bar.x + bar.width - 5},${yCenter + 4}`} fill={colors.bg} />
                      {/* Progress */}
                      {bar.progress > 0 && (
                        <rect x={bar.x} y={yCenter - 4} width={bar.width * bar.progress} height={8} rx={1} fill={colors.fill} />
                      )}
                    </g>
                  )
                }

                return (
                  <g key={task.id}>
                    {/* Bar background */}
                    <rect
                      x={bar.x} y={yTop}
                      width={bar.width} height={BAR_HEIGHT}
                      rx={4}
                      fill={colors.bg}
                      opacity="0.8"
                    />
                    {/* Progress fill */}
                    {bar.progress > 0 && (
                      <rect
                        x={bar.x} y={yTop}
                        width={bar.width * bar.progress} height={BAR_HEIGHT}
                        rx={4}
                        fill={colors.fill}
                      />
                    )}
                    {/* Gradient overlay */}
                    <rect
                      x={bar.x} y={yTop}
                      width={bar.width} height={BAR_HEIGHT}
                      rx={4}
                      fill="url(#barGrad)"
                    />
                    {/* Label on bar (if wide enough) */}
                    {bar.width > 60 && (
                      <text
                        x={bar.x + 6} y={yCenter + 4}
                        fill="white"
                        fontSize="10"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {task.task?.substring(0, Math.floor(bar.width / 6))}
                      </text>
                    )}
                    {/* Resource label (right of bar) */}
                    {task.resource && bar.width < 200 && (
                      <text
                        x={bar.x + bar.width + 6} y={yCenter + 4}
                        fill="rgba(148,163,184,0.5)"
                        fontSize="9"
                        className="pointer-events-none"
                      >
                        {task.resource}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Dependency Arrows */}
              {dependencies.map((dep, i) => {
                const predIdx = displayTasks.findIndex(t => t.id === dep.predecessor_id)
                const succIdx = displayTasks.findIndex(t => t.id === dep.successor_id)
                if (predIdx < 0 || succIdx < 0) return null

                const predBar = getBarProps(displayTasks[predIdx])
                const succBar = getBarProps(displayTasks[succIdx])
                if (!predBar || !succBar) return null

                const startX = predBar.x + predBar.width + 2
                const startY = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2
                const endX = succBar.x - 8
                const endY = succIdx * ROW_HEIGHT + ROW_HEIGHT / 2
                const midX = startX + 12

                const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`

                return (
                  <path
                    key={`dep-${i}`}
                    d={path}
                    stroke="#94a3b8"
                    strokeWidth="1.5"
                    fill="none"
                    markerEnd="url(#arrow)"
                  />
                )
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Labor Forecast Heatmap */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#111111]">
        <button
          className="w-full px-6 py-2.5 flex items-center gap-2 hover:bg-white/[0.04] transition-colors"
          onClick={() => setShowForecast(!showForecast)}
        >
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">12-Month Labor Forecast</span>
          <span className="text-xs text-white/30 ml-2">hrs/person/month • capacity: 160h</span>
          {showForecast ? <ChevronDown className="w-4 h-4 text-white/30 ml-auto" /> : <ChevronRight className="w-4 h-4 text-white/30 ml-auto" />}
        </button>

        {showForecast && forecast && (
          <div className="px-6 pb-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-white/40 font-semibold bg-white/[0.03] rounded-tl-lg sticky left-0 z-10 w-32">Resource</th>
                  {forecast.months.map((m, i) => (
                    <th key={i} className="py-2 px-2 text-center text-white/40 font-medium bg-white/[0.03] whitespace-nowrap min-w-[64px]">{m}</th>
                  ))}
                  <th className="py-2 px-3 text-right text-white/40 font-semibold bg-white/[0.03] rounded-tr-lg">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(forecast.forecast).map(([resource, hours]) => {
                  const total = hours.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={resource} className="border-b border-white/[0.04] last:border-0">
                      <td className="py-1.5 px-3 font-medium text-white/70 sticky left-0 bg-[#111111] z-10">{resource}</td>
                      {hours.map((h, i) => (
                        <td key={i} className={cn("py-1.5 px-2 text-center rounded-sm", getLoadColor(h, forecast.capacity_per_month))}>
                          {h > 0 ? Math.round(h) : '–'}
                        </td>
                      ))}
                      <td className="py-1.5 px-3 text-right font-semibold text-white/70">{Math.round(total)}</td>
                    </tr>
                  )
                })}
                {/* Total row */}
                <tr className="bg-white/[0.03] font-semibold">
                  <td className="py-1.5 px-3 text-white/70 sticky left-0 bg-white/[0.03] z-10">TOTAL</td>
                  {forecast.months.map((_, i) => {
                    const monthTotal = Object.values(forecast.forecast).reduce((sum, hours) => sum + (hours[i] || 0), 0)
                    return (
                      <td key={i} className="py-1.5 px-2 text-center text-white/60">
                        {Math.round(monthTotal)}
                      </td>
                    )
                  })}
                  <td className="py-1.5 px-3 text-right text-white">
                    {Math.round(Object.values(forecast.forecast).reduce((sum, hours) => sum + hours.reduce((a, b) => a + b, 0), 0))}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/15" /> ≤50%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/25" /> 50-80%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500/20" /> 80-100%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/25" /> Overloaded (&gt;100%)</span>
              <span className="ml-auto text-white/30">Capacity: {forecast.capacity_per_month}h/month (8h × 20 days)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
