import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { AlertTriangle, ArrowUpRight, Gauge, Layers, Users2 } from 'lucide-react'
import { cn } from '@/lib/utils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const API_BASE = '/api'
const BASELINE_DASH_PATTERN = [4, 5]
const PREMIUM_EASE = [0.22, 1, 0.36, 1]

const revealItem = {
  hidden: { opacity: 0, y: 14 },
  visible: i => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: PREMIUM_EASE, delay: i * 0.05 },
  }),
}

function App() {
  const [summary, setSummary] = useState({})
  const [tasks, setTasks] = useState([])
  const [scurveData, setScurveData] = useState({ labels: [], baseline: [], actual: [], scheduled: [], earned: [] })
  const [resourceAllocation, setResourceAllocation] = useState([])
  const [mismatchWarnings, setMismatchWarnings] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [bootProgress, setBootProgress] = useState(0)
  const [showBootLoader, setShowBootLoader] = useState(true)

  useEffect(() => {
    let rafId
    let start
    const duration = 850

    const tick = timestamp => {
      if (!start) start = timestamp
      const elapsed = timestamp - start
      const progress = Math.min(100, Math.round((elapsed / duration) * 100))
      setBootProgress(progress)

      if (progress < 100) {
        rafId = requestAnimationFrame(tick)
      } else {
        setTimeout(() => setShowBootLoader(false), 140)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryRes, tasksRes, scurveRes, allocRes, mismatchRes] = await Promise.all([
          fetch(`${API_BASE}/summary`),
          fetch(`${API_BASE}/tasks`),
          fetch(`${API_BASE}/scurve`),
          fetch(`${API_BASE}/resource-allocation`),
          fetch(`${API_BASE}/mismatch-warnings`),
        ])

        setSummary(await summaryRes.json())
        setTasks(await tasksRes.json())
        setScurveData(await scurveRes.json())
        setResourceAllocation(await allocRes.json())
        setMismatchWarnings(await mismatchRes.json())
      } catch (error) {
        console.error('Failed to load dashboard data', error)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [])

  const kpiItems = useMemo(() => {
    const variance = summary.total_variance || 0
    const activeProjects = tasks.filter(t => !t.parent_task).length
    const totalCapacity = resourceAllocation.reduce((sum, r) => sum + (r.capacity || 0), 0)
    const totalCompleted = resourceAllocation.reduce((sum, r) => sum + (r.completed || 0), 0)
    const utilization = totalCapacity > 0 ? Math.round((totalCompleted / totalCapacity) * 100) : 0
    const earnedValueRatio = summary.total_completed > 0
      ? Number(((summary.total_earned_value || 0) / summary.total_completed).toFixed(2))
      : 0

    return [
      {
        label: 'Project Metrics',
        value: `${summary.total_tasks || 0}`,
        sub: `${Math.round(summary.total_completed || 0).toLocaleString()}h complete`,
        icon: Layers,
      },
      {
        label: 'Overall Velocity',
        value: `${earnedValueRatio}x`,
        sub: `${Math.round(summary.total_earned_value || 0).toLocaleString()}h earned value`,
        icon: Gauge,
      },
      {
        label: 'Resource Allocation',
        value: `${utilization}%`,
        sub: `${resourceAllocation.length || 0} resources loaded`,
        icon: Users2,
      },
      {
        label: 'Active Projects',
        value: `${activeProjects}`,
        sub: `${variance > 0 ? '+' : ''}${Math.round(variance)}h variance`,
        icon: ArrowUpRight,
        accent: variance > 0 ? 'warning' : 'neutral',
      },
    ]
  }, [resourceAllocation, summary, tasks])

  const chartData = useMemo(() => ({
    labels: scurveData.labels || [],
    datasets: [
      {
        label: 'Baseline',
        data: scurveData.baseline || [],
        borderColor: '#161616',
        borderWidth: 1.4,
        borderDash: BASELINE_DASH_PATTERN,
        pointRadius: 0,
      },
      {
        label: 'Scheduled',
        data: scurveData.scheduled || scurveData.actual || [],
        borderColor: '#D9381E',
        backgroundColor: 'rgba(217, 56, 30, 0.14)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
      },
      {
        label: 'Earned Value',
        data: scurveData.earned || [],
        borderColor: '#4B4B4B',
        borderWidth: 1.5,
        pointRadius: 0,
      },
    ],
  }), [scurveData])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          color: '#262626',
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'line',
          font: { family: 'Helvetica Neue, Arial, sans-serif', size: 11, weight: '600' },
        },
      },
      tooltip: {
        backgroundColor: '#101010',
        titleColor: '#F4F1EA',
        bodyColor: '#F4F1EA',
        borderWidth: 0,
        titleFont: { family: 'Helvetica Neue, Arial, sans-serif', size: 12, weight: '700' },
        bodyFont: { family: 'SFMono-Regular, Menlo, monospace', size: 11, weight: '500' },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(18, 18, 18, 0.08)' },
        ticks: {
          color: '#474747',
          maxTicksLimit: 8,
          font: { family: 'SFMono-Regular, Menlo, monospace', size: 10, weight: '500' },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(18, 18, 18, 0.08)' },
        ticks: {
          color: '#474747',
          font: { family: 'SFMono-Regular, Menlo, monospace', size: 10, weight: '500' },
        },
      },
    },
  }), [])

  const alerts = mismatchWarnings.slice(0, 8)

  return (
    <div className="relative h-full overflow-auto editorial-dashboard">
      <AnimatePresence>
        {showBootLoader && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
            className="fixed inset-0 z-50 bg-[var(--theme-bg-base)] border-b border-[var(--theme-border-subtle)] flex items-center justify-center"
            role="status"
            aria-live="polite"
            aria-label="Loading dashboard"
          >
            <div className="text-center">
              <div className="font-data text-[11px] tracking-[0.32em] uppercase text-[var(--theme-text-muted)]">KPI Automation</div>
              <div aria-live="polite" className="mt-4 font-data text-[58px] leading-none text-[var(--theme-text-heading)] tabular-nums">{bootProgress}%</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-[1680px] mx-auto px-6 py-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: PREMIUM_EASE, delay: showBootLoader ? 0.12 : 0 }}
          className="border border-[var(--theme-border-surface)] bg-[var(--theme-bg-surface)] px-5 py-4"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-data text-[11px] tracking-[0.22em] uppercase text-[var(--theme-text-muted)]">
                Executive Snapshot
              </p>
              <h1 className="text-[26px] leading-none font-semibold text-[var(--theme-text-heading)]">KPI Automation Dashboard</h1>
            </div>
            <p className="font-data text-xs text-[var(--theme-text-muted)]">Data refresh: live</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 border border-[var(--theme-border-surface)] divide-y md:divide-y-0 md:divide-x divide-[var(--theme-border-subtle)] bg-[var(--theme-bg-surface)]">
          {kpiItems.map((item, index) => (
            <motion.article
              key={item.label}
              variants={revealItem}
              initial="hidden"
              animate="visible"
              custom={index}
              className={cn(
                'px-5 py-4 group transition-colors duration-150',
                item.accent === 'warning'
                  ? 'hover:bg-[rgba(217,56,30,0.08)]'
                  : 'hover:bg-[rgba(0,0,0,0.03)]'
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--theme-text-muted)] font-medium">{item.label}</p>
                <item.icon className="w-4 h-4 text-[var(--theme-accent-primary)]" />
              </div>
              <p className="font-data mt-3 text-[30px] leading-none text-[var(--theme-text-heading)] tabular-nums">{item.value}</p>
              <p className="font-data mt-2 text-[11px] text-[var(--theme-text-muted)]">{item.sub}</p>
            </motion.article>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.24, ease: PREMIUM_EASE }}
            className="xl:col-span-8 border border-[var(--theme-border-surface)] bg-[var(--theme-bg-surface)]"
          >
            <div className="px-5 py-4 border-b border-[var(--theme-border-subtle)]">
              <p className="font-data text-[11px] uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Main Chart Visualization</p>
              <h2 className="mt-1 text-base font-semibold text-[var(--theme-text-heading)]">Cumulative Delivery Curve</h2>
            </div>
            <div className="h-[420px] px-4 py-4">
              {dataLoading ? (
                <div className="h-full border border-dashed border-[var(--theme-border-subtle)] animate-pulse" />
              ) : (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.24, ease: PREMIUM_EASE, delay: 0.05 }}
            className="xl:col-span-4 border border-[var(--theme-border-surface)] bg-[var(--theme-bg-surface)]"
          >
            <div className="px-5 py-4 border-b border-[var(--theme-border-subtle)]">
              <p className="font-data text-[11px] uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Recent Alerts</p>
              <h2 className="mt-1 text-base font-semibold text-[var(--theme-text-heading)]">Hours vs Progress Anomalies</h2>
            </div>

            <div className="max-h-[420px] overflow-auto divide-y divide-[var(--theme-border-subtle)]">
              {dataLoading && (
                <div className="space-y-3 p-4">
                  {[...Array(5)].map((_, idx) => (
                    <div key={idx} className="h-14 border border-dashed border-[var(--theme-border-subtle)] animate-pulse" />
                  ))}
                </div>
              )}

              {!dataLoading && alerts.length === 0 && (
                <div className="p-5">
                  <p className="font-data text-[12px] text-[var(--theme-text-muted)]">No active alerts at this time.</p>
                </div>
              )}

              {!dataLoading && alerts.map((alert, idx) => (
                <motion.div
                  key={alert.task_id}
                  variants={revealItem}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.6 }}
                  custom={idx}
                  className="p-4 hover:bg-[rgba(0,0,0,0.03)] transition-colors duration-150"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-[var(--theme-accent-primary)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--theme-text-heading)] truncate">{alert.task}</p>
                      <p className="mt-1 font-data text-[11px] text-[var(--theme-text-muted)]">
                        gap {alert.gap} pts · {alert.direction} · {alert.resource}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  )
}

export default App
