import { useState, useEffect, useRef } from 'react'
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
  MessageSquare,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const API_BASE = '/api'

// Utility for combining classes
const cn = (...classes) => classes.filter(Boolean).join(' ')

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
  const [toast, setToast] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectScurve, setProjectScurve] = useState(null)
  const [showCharts, setShowCharts] = useState(true)
  const [resourceAllocation, setResourceAllocation] = useState([])
  const chatRef = useRef(null)

  // Fetch all data
  const fetchData = async () => {
    try {
      const [tasksRes, summaryRes, scurveRes, resourcesRes, allocRes] = await Promise.all([
        fetch(`${API_BASE}/tasks`),
        fetch(`${API_BASE}/summary`),
        fetch(`${API_BASE}/scurve`),
        fetch(`${API_BASE}/resources`),
        fetch(`${API_BASE}/resource-allocation`)
      ])
      setTasks(await tasksRes.json())
      setSummary(await summaryRes.json())
      setScurveData(await scurveRes.json())
      setResources(await resourcesRes.json())
      setResourceAllocation(await allocRes.json())
    } catch (err) {
      showToast('Failed to load data', 'error')
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

  // Build conversation history for context
  const buildHistory = () => {
    // Filter out system messages and convert to API format
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
          font: { size: 11, weight: '500' }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1f2937',
        bodyColor: '#4b5563',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12,
        boxPadding: 4,
        cornerRadius: 8,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 8, font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { font: { size: 10 } }
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
        labels: { usePointStyle: true, boxWidth: 6, padding: 12, font: { size: 11 } }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1f2937',
        bodyColor: '#4b5563',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
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
      x: { stacked: true, grid: { display: false }, max: 100, ticks: { callback: v => v + '%', font: { size: 10 } } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
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
        labels: { usePointStyle: true, boxWidth: 6, padding: 16, font: { size: 11 } }
      }
    }
  }

  const variance = summary.total_variance || 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">KPI Project Tracker</h1>
              <p className="text-blue-200 text-sm">Schedule-IKP • Software Development</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-200">
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium">v2.1</span>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
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
            
            {/* Mini S-Curve */}
            <div className="flex-1 max-w-xs h-16 ml-auto">
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
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Task Table */}
          <div className="flex-1 bg-white rounded-2xl shadow-card border border-slate-200/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Resource</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Work</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Done</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Left</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Var</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Finish</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map(task => {
                    const isParent = tasks.some(t => t.parent_task === task.task)
                    const isChild = !!task.parent_task
                    const taskVariance = task.variance || 0
                    
                    return (
                      <tr 
                        key={task.id} 
                        className={cn(
                          "hover:bg-blue-50/50 transition-colors",
                          isParent && "bg-gradient-to-r from-slate-50 to-blue-50/30 border-l-2 border-l-blue-400",
                          isChild && "bg-white"
                        )}
                      >
                        <td className={cn("px-4 py-3 text-sm", isParent ? "text-blue-600 font-semibold" : "text-slate-400")}>
                          {task.id}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-sm flex items-center",
                            isChild && "pl-6",
                            isParent && "font-semibold text-slate-800"
                          )}>
                            {isChild && <span className="text-slate-300 mr-1.5 text-xs">└─</span>}
                            {isParent && <span className="mr-1.5 text-blue-500">▸</span>}
                            <span className={isChild ? "text-slate-600" : ""}>{task.task}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isParent ? (
                            <span className="text-xs text-slate-400 italic">auto</span>
                          ) : (
                            <select
                              className="text-sm bg-transparent border-none text-slate-600 cursor-pointer hover:text-blue-600 focus:outline-none appearance-none pr-0"
                              value={task.resource || ''}
                              onChange={(e) => updateTask(task.id, 'resource', e.target.value)}
                            >
                              {resources.map(r => (
                                <option key={r.name} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className={cn("px-4 py-3 text-sm text-right font-medium", isParent ? "text-slate-800" : "text-slate-700")}>
                          {Math.round(task.work_hours)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                          {Math.round(task.hours_completed || 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-blue-600">
                          {Math.round(task.hours_remaining || task.work_hours)}
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-sm text-right font-medium",
                          taskVariance > 0 && "text-red-500",
                          taskVariance < 0 && "text-green-500",
                          taskVariance === 0 && "text-slate-400"
                        )}>
                          {taskVariance > 0 ? '+' : ''}{Math.round(taskVariance)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {task.finish_date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  task.percent_complete >= 100 ? "bg-green-500" :
                                  task.percent_complete >= 75 ? "bg-blue-500" :
                                  task.percent_complete >= 50 ? "bg-blue-400" :
                                  task.percent_complete >= 25 ? "bg-amber-400" : "bg-slate-300"
                                )}
                                style={{ width: `${task.percent_complete}%` }}
                              />
                            </div>
                            {isParent ? (
                              <span className="text-xs font-semibold text-slate-600 w-10 text-right">
                                {task.percent_complete}%
                              </span>
                            ) : (
                              <>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={task.percent_complete}
                                  className="w-16 h-1 accent-blue-500 cursor-pointer opacity-0 hover:opacity-100 absolute"
                                  onChange={(e) => updateTask(task.id, 'percent_complete', parseInt(e.target.value))}
                                />
                                <span className="text-xs font-medium text-slate-500 w-10 text-right">
                                  {task.percent_complete}%
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel - Chat & Analytics */}
          <div className="w-96 flex flex-col gap-4" style={{ height: 'calc(100vh - 180px)' }}>
            {/* AI Chat Panel - Always visible at top */}
            <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 overflow-hidden flex flex-col" style={{ minHeight: '350px', flex: showCharts ? '1 1 350px' : '1 1 auto' }}>
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-slate-700">AI Copilot</span>
                <span className="ml-auto text-xs text-slate-400">{messages.length - 1} messages</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatRef}>
                {messages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "flex",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-blue-500 text-white rounded-br-md" 
                        : "bg-slate-100 text-slate-700 rounded-bl-md",
                      msg.loading && "animate-pulse"
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
                          "w-full text-left px-4 py-3 rounded-xl text-sm transition-all",
                          opt.label?.toLowerCase().includes('cancel')
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                        )}
                        onClick={() => confirmAction(opt.option)}
                        disabled={loading}
                      >
                        <span className="font-semibold">{opt.option}.</span> {opt.label}
                        {opt.description && <span className="block text-xs text-slate-500 mt-0.5">{opt.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                    placeholder={pendingAction ? "Choose an option..." : "Type instructions..."}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChat()}
                    disabled={loading || pendingAction}
                  />
                  <button 
                    className={cn(
                      "px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2",
                      loading || pendingAction || !chatInput.trim()
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                    )}
                    onClick={sendChat} 
                    disabled={loading || pendingAction || !chatInput.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Analytics Panel - Collapsible below chat */}
            <div className="bg-white rounded-2xl shadow-card border border-slate-200/60 overflow-hidden" style={{ flex: showCharts ? '1 1 auto' : '0 0 auto' }}>
              <button 
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                onClick={() => setShowCharts(!showCharts)}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold text-slate-700">Analytics</span>
                </div>
                {showCharts ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              
              {showCharts && (
                <div className="px-5 pb-5 space-y-5 overflow-y-auto" style={{ maxHeight: '500px' }}>
                  {/* S-Curve Card */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">S-Curve</span>
                      <select 
                        className="text-xs border-0 bg-slate-100 rounded-lg px-2 py-1 text-slate-600 cursor-pointer focus:ring-2 focus:ring-blue-500"
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
                            data: i === 0 ? projectScurve.baseline : i === 1 ? (projectScurve.scheduled || projectScurve.actual) : projectScurve.earned
                          }))
                        } : chartData} 
                        options={fullScurveOptions} 
                      />
                    </div>
                  </div>

                  {/* Resource Workload */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Resource Workload</span>
                      {resourceAllocation.some(r => r.overallocated) && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">⚠️ Overallocation</span>
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
                            "text-xs px-2 py-1 rounded-full font-medium",
                            r.overallocated ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {r.name} {r.utilization}%
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Phase Breakdown */}
                  <div className="space-y-3">
                    <span className="text-sm font-medium text-slate-600">Phase Breakdown</span>
                    <div className="h-32">
                      {(totalDev + totalTest + totalReview) > 0 ? (
                        <Doughnut data={phaseChartData} options={phaseChartOptions} />
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">No phase data</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>


          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-bottom-4 duration-300",
          toast.type === 'error' ? "bg-red-500 text-white" : "bg-green-500 text-white"
        )}>
          {toast.type === 'error' ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// Stat Card Component
function StatCard({ icon, value, label, color = 'blue' }) {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-50',
    green: 'text-green-500 bg-green-50',
    red: 'text-red-500 bg-red-50',
    purple: 'text-purple-500 bg-purple-50',
    gray: 'text-slate-400 bg-slate-50',
  }
  
  return (
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", colorClasses[color])}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</div>
      </div>
    </div>
  )
}

export default App
