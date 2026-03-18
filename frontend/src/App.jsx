import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  BarChart3,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Sparkles,
  TrendingUp,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const API_BASE = '/api'
const PREMIUM_EASE = [0.22, 1, 0.36, 1]
const BASELINE_DATASET_INDEX = 0
const SCHEDULED_DATASET_INDEX = 1
const EARNED_DATASET_INDEX = 2

// Utility for combining classes
import { cn } from '@/lib/utils'

function App() {
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState({})
  const [scurveData, setScurveData] = useState({ labels: [], baseline: [], actual: [] })
  const [resources, setResources] = useState([])
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can help update tasks. Try "Add 20 hours to Build 2" or "Set task 108 to 50% complete".' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectScurve, setProjectScurve] = useState(null)
  const [showCharts, setShowCharts] = useState(true)
  const [resourceAllocation, setResourceAllocation] = useState([])
  const [mismatchWarnings, setMismatchWarnings] = useState([])
  const [crStages, setCrStages] = useState({})
  const [bootProgress, setBootProgress] = useState(0)
  const [showBootLoader, setShowBootLoader] = useState(true)
  const chatRef = useRef(null)
  const tableContainerRef = useRef(null)

  useEffect(() => {
    let frame
    let startedAt
    const duration = 1200

    const animateLoader = timestamp => {
      if (!startedAt) startedAt = timestamp
      const elapsed = timestamp - startedAt
      const progressPercentage = Math.min(100, Math.round((elapsed / duration) * 100))
      setBootProgress(progressPercentage)

      if (progressPercentage < 100) {
        frame = requestAnimationFrame(animateLoader)
      } else {
        setTimeout(() => setShowBootLoader(false), 120)
      }
    }

    frame = requestAnimationFrame(animateLoader)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Fetch all data
  const fetchData = async () => {
    try {
      const [tasksRes, summaryRes, scurveRes, resourcesRes, allocRes, mismatchRes, stagesRes] = await Promise.all([
        fetch(`${API_BASE}/tasks`),
        fetch(`${API_BASE}/summary`),
        fetch(`${API_BASE}/scurve`),
        fetch(`${API_BASE}/resources`),
        fetch(`${API_BASE}/resource-allocation`),
        fetch(`${API_BASE}/mismatch-warnings`),
        fetch(`${API_BASE}/cr-stages`)
      ])
      setTasks(await tasksRes.json())
      setSummary(await summaryRes.json())
      setScurveData(await scurveRes.json())
      setResources(await resourcesRes.json())
      setResourceAllocation(await allocRes.json())
      setMismatchWarnings(await mismatchRes.json())
      setCrStages(await stagesRes.json())
    } catch (err) {
      showToast('Failed to load data', 'error')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Fetch project-specific S-curve when selected
  useEffect(() => {
    const fetchProjectScurve = async () => {
      if (selectedProject) {
        try {
          const res = await fetch(`${API_BASE}/scurve/${encodeURIComponent(selectedProject)}`)
          if (res.ok) {
            setProjectScurve(await res.json())
          }
        } catch (err) {
          console.error('Failed to fetch project S-curve')
        }
      } else {
        setProjectScurve(null)
      }
    }
    fetchProjectScurve()
  }, [selectedProject])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateTask = async (taskId, field, value) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) {
        showToast('Saved!')
        fetchData()
      }
    } catch (err) {
      showToast('Save failed', 'error')
    }
  }

  // Build conversation history for context from non-transient messages
  const buildHistory = () => {
    // Excludes temporary loading placeholders and keeps user/assistant turns
    return messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.content
      }))
  }

  // Handle chat send
  const sendChat = async () => {
    if (!chatInput.trim() || loading) return
    
    const userMsg = chatInput.trim()
    const newUserMessage = { role: 'user', content: userMsg }
    setMessages(m => [...m, newUserMessage])
    setChatInput('')
    setLoading(true)
    setMessages(m => [...m, { role: 'assistant', content: 'Thinking...', loading: true }])

    try {
      // Send with conversation history
      const history = buildHistory()
      
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: userMsg,
          history: history
        })
      })
      
      setMessages(m => m.filter(msg => !msg.loading))
      
      if (res.ok) {
        const data = await res.json()
        setMessages(m => [...m, { role: 'assistant', content: data.reply }])
        
        if (data.needs_confirmation && data.options) {
          setPendingAction({
            id: data.pending_action_id,
            options: data.options
          })
        } else if (data.changes_count > 0) {
          showToast(`✨ ${data.changes_count} changes applied!`)
          fetchData()
        }
      } else {
        const err = await res.json()
        setMessages(m => [...m, { role: 'assistant', content: `❌ ${err.detail || 'Error'}` }])
      }
    } catch (err) {
      setMessages(m => m.filter(msg => !msg.loading))
      setMessages(m => [...m, { role: 'assistant', content: '❌ Connection failed' }])
    }
    setLoading(false)
  }

  const confirmAction = async (optionNumber) => {
    if (!pendingAction) return
    
    setLoading(true)
    const chosenOption = pendingAction.options.find(o => o.option === optionNumber)
    setMessages(m => [...m, { role: 'user', content: `Option ${optionNumber}: ${chosenOption?.label || 'Selected'}` }])
    
    try {
      const res = await fetch(`${API_BASE}/confirm-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action_id: pendingAction.id, 
          chosen_option: optionNumber 
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        setMessages(m => [...m, { role: 'assistant', content: data.message || '✅ Done!' }])
        if (data.success) {
          showToast('✨ Changes applied!')
          fetchData()
        }
      } else {
        const err = await res.json()
        setMessages(m => [...m, { role: 'assistant', content: `❌ ${err.detail || 'Failed'}` }])
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: '❌ Connection failed' }])
    }
    
    setPendingAction(null)
    setLoading(false)
  }

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  const parentTasks = tasks.filter(t => !t.parent_task && tasks.some(st => st.parent_task === t.task))

  // Chart configurations
  const chartData = {
    labels: scurveData.labels || [],
    datasets: [
      {
        label: 'Baseline (Planned)',
        data: scurveData.baseline || [],
        borderColor: 'rgb(156, 163, 175)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      },
      {
        label: 'Scheduled (Current)',
        data: scurveData.scheduled || scurveData.actual || [],
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2.5,
        pointRadius: 0,
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Earned Value',
        data: scurveData.earned || [],
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 2.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      }
    ]
  }

  const fullScurveOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 6,
          padding: 16,
          font: { size: 11, weight: '500' },
          color: 'rgba(31,27,22,0.68)'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#1b1814',
        titleColor: '#f8f7f3',
        bodyColor: 'rgba(248,247,243,0.88)',
        borderColor: 'rgba(248, 247, 243, 0.18)',
        borderWidth: 1,
        padding: 12,
        boxPadding: 4,
        cornerRadius: 2,
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(39,30,22,0.08)' },
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: 'rgba(31,27,22,0.55)' }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(39,30,22,0.08)' },
        ticks: { font: { size: 10 }, color: 'rgba(31,27,22,0.55)' }
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  }

  const maxCapacity = Math.max(...resourceAllocation.map(r => r.capacity), 1)
  
  const resourceChartData = {
    labels: resourceAllocation.map(r => r.name),
    datasets: [
      {
        label: 'Completed',
        data: resourceAllocation.map(r => (r.completed / maxCapacity) * 100),
        backgroundColor: 'rgb(34, 197, 94)',
        borderRadius: 4
      },
      {
        label: 'Remaining',
        data: resourceAllocation.map(r => (r.remaining / maxCapacity) * 100),
        backgroundColor: 'rgb(59, 130, 246)',
        borderRadius: 4
      },
      {
        label: 'Available',
        data: resourceAllocation.map(r => (r.available / maxCapacity) * 100),
        backgroundColor: 'rgba(156, 163, 175, 0.2)',
        borderRadius: 4
      }
    ]
  }

  const resourceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { 
      legend: {
        position: 'top',
        labels: { usePointStyle: true, boxWidth: 6, padding: 12, font: { size: 11 }, color: 'rgba(31,27,22,0.68)' }
      },
      tooltip: {
        backgroundColor: '#1b1814',
        titleColor: '#f8f7f3',
        bodyColor: 'rgba(248,247,243,0.88)',
        borderColor: 'rgba(248, 247, 243, 0.18)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 2,
        callbacks: {
          label: (context) => {
            const r = resourceAllocation[context.dataIndex]
            if (!r) return ''
            const label = context.dataset.label
            if (label === 'Completed') return `Completed: ${r.completed}h`
            if (label === 'Remaining') return `Remaining: ${r.remaining}h`
            if (label === 'Available') return `Available: ${r.available}h`
            return ''
          }
        }
      }
    },
    scales: {
      x: { stacked: true, grid: { color: 'rgba(39,30,22,0.08)' }, max: 100, ticks: { callback: v => v + '%', font: { size: 10 }, color: 'rgba(31,27,22,0.55)' } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: 'rgba(31,27,22,0.7)' } }
    }
  }

  const totalDev = tasks.reduce((sum, t) => sum + (t.dev_hours || 0), 0)
  const totalTest = tasks.reduce((sum, t) => sum + (t.test_hours || 0), 0)
  const totalReview = tasks.reduce((sum, t) => sum + (t.review_hours || 0), 0)

  const phaseChartData = {
    labels: ['Development', 'Testing', 'Review'],
    datasets: [{
      data: [totalDev, totalTest, totalReview],
      backgroundColor: ['rgb(59, 130, 246)', 'rgb(245, 158, 11)', 'rgb(34, 197, 94)'],
      borderWidth: 0,
      spacing: 2
    }]
  }

  const phaseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 6, padding: 16, font: { size: 11 }, color: 'rgba(31,27,22,0.68)' }
      }
    }
  }

  const variance = summary.total_variance || 0
  const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1)

  // Virtualizer for the task table
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 8,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0

  return (
    <div className="flex flex-col h-full relative">
      <AnimatePresence>
        {showBootLoader && (
          <motion.div
            className="fixed inset-0 z-50 bg-[var(--theme-bg-base)] border-b border-[var(--theme-border-subtle)] flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
            role="status"
            aria-live="polite"
            aria-label="Loading dashboard"
          >
            <div className="text-center">
              <p className="font-data text-[11px] tracking-[0.24em] uppercase text-[var(--theme-text-muted)]">KPI Automation</p>
              <p className="font-data text-[52px] leading-none mt-3 text-[var(--theme-text-heading)]">{bootProgress}%</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Bar - sticky inside the scrolling layout main */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: PREMIUM_EASE, delay: 0.2 }}
        className="theme-glass-surface border-b border-[var(--theme-border-surface)] sticky top-0 z-10 shrink-0"
      >
        <div className="px-5 py-3">
          {dataLoading ? (
            <div className="flex items-center gap-8">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-sm bg-[rgba(31,27,22,0.08)] animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="w-16 h-4 rounded-sm bg-[rgba(31,27,22,0.08)] animate-pulse" />
                    <div className="w-12 h-3 rounded-sm bg-[rgba(31,27,22,0.06)] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-8">
              <StatCard icon={<CheckCircle2 className="w-5 h-5" />} value={summary.total_tasks || 0} label="Tasks" />
              <StatCard icon={<Clock className="w-5 h-5" />} value={`${Math.round(summary.total_completed || 0).toLocaleString()}h`} label="Completed" color="green" />
              <StatCard icon={<TrendingUp className="w-5 h-5" />} value={`${Math.round(summary.total_remaining || 0).toLocaleString()}h`} label="Remaining" color="blue" />
              <StatCard
                icon={variance > 0 ? <AlertTriangle className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                value={`${variance > 0 ? '+' : ''}${Math.round(variance).toLocaleString()}h`}
                label="Variance"
                color={variance > 0 ? 'red' : variance < 0 ? 'green' : 'gray'}
              />
              <StatCard icon={<Sparkles className="w-5 h-5" />} value={`${Math.round(summary.total_earned_value || 0).toLocaleString()}h`} label="Earned Value" color="purple" />

              <div className="flex-1 max-w-xs h-14 ml-auto border border-[var(--theme-border-subtle)] px-2 py-1 bg-white">
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: PREMIUM_EASE, delay: 0.32 }}
        className="flex-1 px-5 py-4 flex gap-4 min-h-0"
      >
        {/* Task Table */}
        <div className="flex-1 theme-panel overflow-hidden flex flex-col min-w-0">
          {mismatchWarnings.length > 0 && (
            <div className="bg-[rgba(184,92,56,0.08)] border-b border-[rgba(184,92,56,0.3)] px-5 py-2.5 shrink-0">
              <div className="flex items-center gap-2 text-[#9b4f2f] text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {mismatchWarnings.length} Hours vs Progress Mismatch{mismatchWarnings.length > 1 ? 'es' : ''}:
                <span className="font-normal text-[#9b4f2f]/70">
                  {mismatchWarnings.slice(0, 3).map(w => `${w.task}: ${w.gap}pts ${w.direction}`).join(' • ')}
                  {mismatchWarnings.length > 3 && ' …'}
                </span>
              </div>
            </div>
          )}

          <div ref={tableContainerRef} className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="theme-table-header">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Task</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Resource</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Work</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Done</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Left</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Var</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Finish</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em]">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.12em] w-48">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-border-subtle)]">
                {dataLoading ? (
                  [...Array(12)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--theme-border-subtle)]">
                      {[...Array(10)].map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded-sm bg-[rgba(31,27,22,0.08)] animate-pulse" style={{ width: j === 1 ? '80%' : j === 2 ? '60%' : '50%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr><td colSpan={10} style={{ height: `${paddingTop}px`, padding: 0 }} /></tr>
                    )}
                    {virtualRows.map(virtualRow => {
                      const task = tasks[virtualRow.index]
                      const isParent = tasks.some(t => t.parent_task === task.task)
                      const isChild = !!task.parent_task
                      const taskVariance = task.variance || 0

                      return (
                        <tr
                          key={task.id}
                          className={cn(
                            'hover:bg-[rgba(31,27,22,0.04)] transition-colors',
                            isParent && 'bg-[rgba(31,27,22,0.03)] border-l-2 border-l-[rgba(95,122,100,0.65)]',
                          )}
                        >
                          <td className={cn('px-4 py-3 text-sm font-data', isParent ? 'text-[#4f6b56] font-semibold' : 'text-[var(--theme-text-muted)]')}>{task.id}</td>
                          <td className="px-4 py-3">
                            <span className={cn('text-sm flex items-center text-[var(--theme-text-heading)]', isChild && 'pl-6', isParent && 'font-semibold')}>
                              {isChild && <span className="text-[var(--theme-text-muted)] mr-1.5 text-xs">└─</span>}
                              {isParent && <span className="mr-1.5 text-[#4f6b56]">▸</span>}
                              <span className={isChild ? 'text-[var(--theme-text-body)]' : ''}>{task.task}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isParent ? (
                              <span className="text-xs text-[var(--theme-text-muted)] italic">auto</span>
                            ) : (
                              <select
                                className="text-sm bg-[var(--theme-bg-elevated)] border border-[var(--theme-border-subtle)] rounded-[var(--theme-radius-chip)] text-[var(--theme-text-body)] cursor-pointer hover:text-[var(--theme-accent-primary)] focus:outline-none px-1"
                                value={task.resource || ''}
                                onChange={(e) => updateTask(task.id, 'resource', e.target.value)}
                              >
                                {resources.map(r => (
                                  <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className={cn('px-4 py-3 text-sm text-right font-data font-medium', isParent ? 'text-[var(--theme-text-heading)]' : 'text-[var(--theme-text-body)]')}>{Math.round(task.work_hours)}</td>
                          <td className="px-4 py-3 text-sm text-right text-[#5f7a64] font-data font-medium">{Math.round(task.hours_completed || 0)}</td>
                          <td className="px-4 py-3 text-sm text-right text-[var(--theme-accent-info)] font-data">{Math.round(task.hours_remaining || task.work_hours)}</td>
                          <td className={cn(
                            'px-4 py-3 text-sm text-right font-data font-medium',
                            taskVariance > 0 && 'text-[#b85c38]',
                            taskVariance < 0 && 'text-[#5f7a64]',
                            taskVariance === 0 && 'text-[var(--theme-text-muted)]'
                          )}>
                            {taskVariance > 0 ? '+' : ''}{Math.round(taskVariance)}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--theme-text-muted)]">
                            {task.finish_date ? new Date(task.finish_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {isParent ? (
                              <span className="text-xs text-[var(--theme-text-muted)] italic">—</span>
                            ) : (
                              <select
                                className={cn(
                                  'text-xs px-2 py-1 rounded-[var(--theme-radius-chip)] font-semibold border border-[var(--theme-border-subtle)] cursor-pointer focus:outline-none bg-[var(--theme-bg-elevated)]',
                                  task.cr_stage === 'resolved' ? 'bg-[rgba(95,122,100,0.18)] text-[#4f6b56]' :
                                  task.cr_stage === 'review' ? 'bg-[rgba(31,77,122,0.14)] text-[#1f4d7a]' :
                                  task.cr_stage === 'implemented' ? 'bg-[rgba(31,77,122,0.14)] text-[#1f4d7a]' :
                                  task.cr_stage === 'analyzed' ? 'bg-[rgba(184,92,56,0.15)] text-[#9b4f2f]' :
                                  'bg-[rgba(31,27,22,0.08)] text-[var(--theme-text-muted)]'
                                )}
                                value={task.cr_stage || 'submitted'}
                                onChange={async (e) => {
                                  await fetch(`${API_BASE}/tasks/${task.id}/stage`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ stage: e.target.value })
                                  })
                                  fetchData()
                                }}
                              >
                                {Object.keys(crStages).map(s => (
                                  <option key={s} value={s}>{capitalize(s)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 relative">
                              {mismatchWarnings.some(w => w.task_id === task.id) && (
                                <span className="text-[#b85c38] text-xs" title={mismatchWarnings.find(w => w.task_id === task.id)?.message}>
                                  ⚠️
                                </span>
                              )}
                              <div className="flex-1 h-2 bg-[rgba(31,27,22,0.12)] rounded-sm overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-sm transition-all duration-300',
                                    task.percent_complete >= 100 ? 'bg-[#5f7a64]' :
                                    task.percent_complete >= 75 ? 'bg-[#4f6b56]' :
                                    task.percent_complete >= 50 ? 'bg-[#66876d]' :
                                    task.percent_complete >= 25 ? 'bg-[#b85c38]' : 'bg-[rgba(31,27,22,0.25)]'
                                  )}
                                  style={{ width: `${task.percent_complete}%` }}
                                />
                              </div>
                              {isParent ? (
                                <span className="text-xs font-semibold text-[var(--theme-text-body)] w-10 text-right font-data">{task.percent_complete}%</span>
                              ) : (
                                <>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={task.percent_complete}
                                    className="w-16 h-1 accent-[#4f6b56] cursor-pointer opacity-0 hover:opacity-100 absolute right-11"
                                    onChange={(e) => updateTask(task.id, 'percent_complete', parseInt(e.target.value))}
                                  />
                                  <span className="text-xs font-medium text-[var(--theme-text-muted)] w-10 text-right font-data">{task.percent_complete}%</span>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {paddingBottom > 0 && (
                      <tr><td colSpan={10} style={{ height: `${paddingBottom}px`, padding: 0 }} /></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel - Chat & Analytics */}
        <div className="w-96 flex flex-col gap-4 shrink-0" style={{ height: '100%' }}>
          <div className="theme-panel overflow-hidden flex flex-col" style={{ minHeight: '350px', flex: showCharts ? '1 1 350px' : '1 1 auto' }}>
            <div className="px-5 py-3 border-b border-[var(--theme-border-subtle)] flex items-center gap-2 shrink-0 bg-white">
              <div className="p-1.5 bg-[rgba(95,122,100,0.14)] rounded-[var(--theme-radius-chip)] border border-[rgba(95,122,100,0.35)]">
                <Bot className="w-4 h-4 text-[#4f6b56]" />
              </div>
              <span className="font-semibold text-[var(--theme-text-heading)]">AI Copilot</span>
              <span className="ml-auto text-xs text-[var(--theme-text-muted)] font-data">{messages.length - 1} messages</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatRef}>
              {messages.map((msg, i) => (
                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[85%] px-4 py-2.5 rounded-[var(--theme-radius-control)] text-sm leading-relaxed border',
                    msg.role === 'user'
                      ? 'bg-[var(--theme-accent-primary)] text-[#fffaf4] border-[var(--theme-accent-primary)]'
                      : 'bg-white text-[var(--theme-text-body)] border-[var(--theme-border-subtle)]',
                    msg.loading && 'animate-pulse'
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {pendingAction && pendingAction.options && (
                <div className="space-y-2 pt-2">
                  {pendingAction.options.map(opt => (
                    <button
                      key={opt.option}
                      className={cn(
                        'w-full text-left px-4 py-3 rounded-[var(--theme-radius-control)] text-sm transition-all border',
                        opt.label?.toLowerCase().includes('cancel')
                          ? 'bg-white text-[var(--theme-text-muted)] hover:bg-[rgba(31,27,22,0.04)] border-[var(--theme-border-subtle)]'
                          : 'bg-[rgba(95,122,100,0.14)] text-[#3f5846] hover:bg-[rgba(95,122,100,0.22)] border-[rgba(95,122,100,0.35)]'
                      )}
                      onClick={() => confirmAction(opt.option)}
                      disabled={loading}
                    >
                      <span className="font-semibold">{opt.option}.</span> {opt.label}
                      {opt.description && <span className="block text-xs text-[var(--theme-text-muted)] mt-0.5">{opt.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[var(--theme-border-subtle)] bg-[var(--theme-elevated-soft-alt)] shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-4 py-2.5 bg-white border border-[var(--theme-border-subtle)] rounded-[var(--theme-radius-control)] text-sm text-[var(--theme-text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] placeholder-[var(--theme-text-muted)]"
                  placeholder={pendingAction ? "Choose an option..." : "Type instructions..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChat()}
                  disabled={loading || pendingAction}
                />
                <button
                  className={cn(
                    'px-4 py-2.5 rounded-[var(--theme-radius-control)] font-medium text-sm transition-all flex items-center gap-2 border',
                    loading || pendingAction || !chatInput.trim()
                      ? 'bg-[rgba(31,27,22,0.07)] text-[var(--theme-text-muted)] border-[var(--theme-border-subtle)] cursor-not-allowed'
                      : 'bg-[var(--theme-accent-primary)] text-[#fffaf4] border-[var(--theme-accent-primary)] hover:bg-[#a95535] hover:shadow-[2px_2px_0_rgba(0,0,0,0.24)]'
                  )}
                  onClick={sendChat}
                  disabled={loading || pendingAction || !chatInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="theme-panel overflow-hidden" style={{ flex: showCharts ? '1 1 auto' : '0 0 auto' }}>
            <button
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-[rgba(31,27,22,0.04)] transition-colors border-b border-[var(--theme-border-subtle)]"
              onClick={() => setShowCharts(!showCharts)}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#4f6b56]" />
                <span className="font-semibold text-[var(--theme-text-heading)]">Analytics</span>
              </div>
              {showCharts ? <ChevronUp className="w-4 h-4 text-[var(--theme-text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--theme-text-muted)]" />}
            </button>

            {showCharts && (
              <div className="px-5 pb-5 space-y-5 overflow-y-auto" style={{ maxHeight: '500px' }}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--theme-text-body)]">S-Curve</span>
                    <select
                      className="text-xs border border-[var(--theme-border-subtle)] bg-[var(--theme-bg-elevated)] rounded-[var(--theme-radius-chip)] px-2 py-1 text-[var(--theme-text-body)] cursor-pointer focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                      value={selectedProject || ''}
                      onChange={(e) => setSelectedProject(e.target.value || null)}
                    >
                      <option value="">All Projects</option>
                      {parentTasks.map(t => (
                        <option key={t.id} value={t.task}>{t.task}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-44 -mx-2">
                    <Line
                        data={projectScurve ? {
                          labels: projectScurve.labels,
                          datasets: chartData.datasets.map((ds, i) => ({
                            ...ds,
                            data:
                              i === BASELINE_DATASET_INDEX
                                ? projectScurve.baseline
                                : i === SCHEDULED_DATASET_INDEX
                                  ? (projectScurve.scheduled || projectScurve.actual)
                                  : i === EARNED_DATASET_INDEX
                                    ? projectScurve.earned
                                    : []
                          }))
                        } : chartData}
                      options={fullScurveOptions}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--theme-text-body)]">Resource Workload</span>
                    {resourceAllocation.some(r => r.overallocated) && (
                      <span className="text-xs text-[#9b4f2f] bg-[rgba(184,92,56,0.12)] px-2 py-0.5 rounded-[var(--theme-radius-chip)] font-medium border border-[rgba(184,92,56,0.25)]">⚠ Overallocation</span>
                    )}
                  </div>
                  <div className="h-36 -mx-2">
                    <Bar data={resourceChartData} options={resourceChartOptions} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {resourceAllocation.map(r => (
                      <span
                        key={r.name}
                        className={cn(
                          'text-xs px-2 py-1 rounded-[var(--theme-radius-chip)] font-medium border',
                          r.overallocated ? 'bg-[rgba(184,92,56,0.12)] text-[#9b4f2f] border-[rgba(184,92,56,0.3)]' : 'bg-white text-[var(--theme-text-muted)] border-[var(--theme-border-subtle)]'
                        )}
                      >
                        {r.name} {r.utilization}%
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-sm font-medium text-[var(--theme-text-body)]">Phase Breakdown</span>
                  <div className="h-32">
                    {(totalDev + totalTest + totalReview) > 0 ? (
                      <Doughnut data={phaseChartData} options={phaseChartOptions} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[var(--theme-text-muted)] text-sm">No phase data</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 px-5 py-3 rounded-[var(--theme-radius-chip)] shadow-[2px_2px_0_rgba(0,0,0,0.24)] text-sm font-medium flex items-center gap-2 border',
          toast.type === 'error' ? 'bg-[rgba(184,92,56,0.12)] text-[#7d3b24] border-[rgba(184,92,56,0.35)]' : 'bg-[rgba(95,122,100,0.13)] text-[#3f5846] border-[rgba(95,122,100,0.35)]'
        )}>
          {toast.type === 'error' ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, value, label, color = 'blue' }) {
  const colorClasses = {
    blue: 'text-[#1f4d7a] bg-[rgba(31,77,122,0.10)] border-[rgba(31,77,122,0.22)]',
    green: 'text-[#4f6b56] bg-[rgba(95,122,100,0.14)] border-[rgba(95,122,100,0.32)]',
    red: 'text-[#9b4f2f] bg-[rgba(184,92,56,0.12)] border-[rgba(184,92,56,0.32)]',
    purple: 'text-[#6f5a3e] bg-[rgba(188,137,71,0.15)] border-[rgba(188,137,71,0.35)]',
    gray: 'text-[var(--theme-text-muted)] bg-[var(--theme-elevated-soft)] border-[var(--theme-border-subtle)]',
  }

  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className={cn('p-2 rounded-[var(--theme-radius-chip)] border', colorClasses[color])}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-data font-semibold text-[var(--theme-text-heading)]">{value}</div>
        <div className="text-xs text-[var(--theme-text-muted)] font-medium uppercase tracking-[0.14em]">{label}</div>
      </div>
    </div>
  )
}

export default App
