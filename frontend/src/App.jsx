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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const API_BASE = '/api'

function App() {
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState({})
  const [scurveData, setScurveData] = useState({ labels: [], baseline: [], actual: [] })
  const [resources, setResources] = useState([])
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hello! I can help update tasks. Try "Add 20 hours to Build 2" or "Mark Cybersecurity as 50% complete".' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)  // For task-specific charts
  const [selectedProject, setSelectedProject] = useState(null)  // For project S-curve
  const [projectScurve, setProjectScurve] = useState(null)  // Project-specific S-curve data
  const [showCharts, setShowCharts] = useState(true)  // Toggle charts panel
  const [resourceAllocation, setResourceAllocation] = useState([])  // Resource allocation data
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

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Update a single task field
  const updateTask = async (taskId, field, value) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) {
        showToast('Saved!')
        fetchData() // Refresh all data
      }
    } catch (err) {
      showToast('Save failed', 'error')
    }
  }

  // Handle chat send
  const sendChat = async () => {
    if (!chatInput.trim() || loading) return
    
    const userMsg = chatInput.trim()
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setChatInput('')
    setLoading(true)
    setMessages(m => [...m, { role: 'bot', text: 'Thinking...', loading: true }])

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg })
      })
      
      // Remove loading message
      setMessages(m => m.filter(msg => !msg.loading))
      
      if (res.ok) {
        const data = await res.json()
        setMessages(m => [...m, { role: 'bot', text: data.reply }])
        
        // Check if confirmation needed
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
        setMessages(m => [...m, { role: 'bot', text: `❌ ${err.detail || 'Error'}` }])
      }
    } catch (err) {
      setMessages(m => m.filter(msg => !msg.loading))
      setMessages(m => [...m, { role: 'bot', text: '❌ Connection failed' }])
    }
    setLoading(false)
  }

  // Handle confirmation choice
  const confirmAction = async (optionNumber) => {
    if (!pendingAction) return
    
    setLoading(true)
    const chosenOption = pendingAction.options.find(o => o.option === optionNumber)
    setMessages(m => [...m, { role: 'user', text: `Option ${optionNumber}: ${chosenOption?.label || 'Selected'}` }])
    
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
        setMessages(m => [...m, { role: 'bot', text: data.message || '✅ Done!' }])
        if (data.success) {
          showToast('✨ Changes applied!')
          fetchData()
        }
      } else {
        const err = await res.json()
        setMessages(m => [...m, { role: 'bot', text: `❌ ${err.detail || 'Failed'}` }])
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'bot', text: '❌ Connection failed' }])
    }
    
    setPendingAction(null)
    setLoading(false)
  }

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  // Get parent tasks (projects) for S-curve dropdown
  const parentTasks = tasks.filter(t => !t.parent_task && tasks.some(st => st.parent_task === t.task))

  // S-Curve chart config (main) - now with 3 lines
  const chartData = {
    labels: scurveData.labels || [],
    datasets: [
      {
        label: 'Baseline (Planned)',
        data: scurveData.baseline || [],
        borderColor: '#9ca3af',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      },
      {
        label: 'Scheduled (Current)',
        data: scurveData.scheduled || scurveData.actual || [],
        borderColor: '#3b82f6',
        borderWidth: 2,
        pointRadius: 0,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Earned Value',
        data: scurveData.earned || [],
        borderColor: '#10b981',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { display: false }, y: { display: false } }
  }

  // Full S-Curve chart options (for the expanded view)
  const fullScurveOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  }

  // Resource workload bar chart - All bars same max length (100% = capacity)
  // Convert to percentages so all bars are comparable
  const maxCapacity = Math.max(...resourceAllocation.map(r => r.capacity), 1)
  
  const resourceChartData = {
    labels: resourceAllocation.map(r => r.name),
    datasets: [
      {
        label: 'Completed',
        data: resourceAllocation.map(r => (r.completed / maxCapacity) * 100),
        backgroundColor: '#10b981',
        borderRadius: 4
      },
      {
        label: 'Remaining',
        data: resourceAllocation.map(r => (r.remaining / maxCapacity) * 100),
        backgroundColor: '#3b82f6',
        borderRadius: 4
      },
      {
        label: 'Available',
        data: resourceAllocation.map(r => (r.available / maxCapacity) * 100),
        backgroundColor: 'rgba(156, 163, 175, 0.3)',
        borderRadius: 4
      }
    ]
  }

  const resourceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { 
      legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const idx = context.dataIndex
            const r = resourceAllocation[idx]
            if (!r) return ''
            const datasetLabel = context.dataset.label
            if (datasetLabel === 'Completed') return `Completed: ${r.completed}h`
            if (datasetLabel === 'Remaining') return `Remaining: ${r.remaining}h`
            if (datasetLabel === 'Available') return `Available: ${r.available}h`
            return ''
          },
          afterBody: (context) => {
            const idx = context[0].dataIndex
            const r = resourceAllocation[idx]
            if (r) {
              return [
                `───────────`,
                `Utilization: ${r.utilization}%`,
                `Capacity: ${r.capacity}h`,
                r.overallocated ? '⚠️ OVERALLOCATED' : ''
              ].filter(Boolean)
            }
            return []
          }
        }
      }
    },
    scales: {
      x: { 
        stacked: true, 
        grid: { display: false }, 
        max: 100,
        title: { display: true, text: '% of Capacity' },
        ticks: { callback: (value) => value + '%' }
      },
      y: { stacked: true, grid: { display: false } }
    }
  }

  // Phase breakdown donut (for selected task or overall)
  const getPhaseData = (task) => {
    if (!task) {
      const totalDev = tasks.reduce((sum, t) => sum + (t.dev_hours || 0), 0)
      const totalTest = tasks.reduce((sum, t) => sum + (t.test_hours || 0), 0)
      const totalReview = tasks.reduce((sum, t) => sum + (t.review_hours || 0), 0)
      return { dev: totalDev, test: totalTest, review: totalReview }
    }
    return { dev: task.dev_hours || 0, test: task.test_hours || 0, review: task.review_hours || 0 }
  }

  const phaseData = getPhaseData(selectedTask)
  const phaseChartData = {
    labels: ['Development', 'Testing', 'Review'],
    datasets: [{
      data: [phaseData.dev, phaseData.test, phaseData.review],
      backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'],
      borderWidth: 0
    }]
  }

  const phaseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }
    }
  }

  const variance = summary.total_variance || 0
  const varianceClass = variance > 0 ? 'warning' : variance < 0 ? 'success' : ''

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <h1>📊 KPI Project Tracker</h1>
          <div className="subtitle">Schedule-IKP - Software Development Tracking</div>
        </div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>v2.0 • FastAPI + React</div>
      </header>

      {/* Summary Bar */}
      <div className="summary-bar">
        <div className="metric">
          <div className="metric-value">{summary.total_tasks || 0}</div>
          <div className="metric-label">Tasks</div>
        </div>
        <div className="metric">
          <div className="metric-value">{Math.round(summary.total_completed || 0).toLocaleString()}h</div>
          <div className="metric-label">Completed</div>
        </div>
        <div className="metric">
          <div className="metric-value">{Math.round(summary.total_remaining || 0).toLocaleString()}h</div>
          <div className="metric-label">Remaining</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${varianceClass}`}>
            {variance > 0 ? '+' : ''}{Math.round(variance).toLocaleString()}h
          </div>
          <div className="metric-label">Variance</div>
        </div>
        <div className="metric">
          <div className="metric-value success">{Math.round(summary.total_earned_value || 0).toLocaleString()}h</div>
          <div className="metric-label">Earned Value</div>
        </div>
        <div className="chart-container">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Task Table */}
        <div className="table-section">
          <table className="task-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Task Name</th>
                <th>Resource</th>
                <th>Work</th>
                <th>Done</th>
                <th>Left</th>
                <th>Variance</th>
                <th>Finish</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const isParent = tasks.some(t => t.parent_task === task.task)
                const variance = task.variance || 0
                const varClass = variance > 0 ? 'positive' : variance < 0 ? 'negative' : 'zero'
                
                return (
                  <tr key={task.id} className={isParent ? 'parent-row' : ''}>
                    <td>{task.id}</td>
                    <td className={`task-name ${task.parent_task ? 'subtask' : ''}`}>
                      {task.task}
                    </td>
                    <td>
                      <select
                        className="resource-select"
                        value={task.resource || ''}
                        onChange={(e) => updateTask(task.id, 'resource', e.target.value)}
                      >
                        {resources.map(r => (
                          <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td
                      className="editable"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const val = parseFloat(e.target.textContent)
                        if (!isNaN(val) && val !== task.work_hours) {
                          updateTask(task.id, 'work_hours', val)
                        }
                      }}
                    >
                      {Math.round(task.work_hours)}
                    </td>
                    <td className="hours-done">{Math.round(task.hours_completed || 0)}</td>
                    <td className="hours-left">{Math.round(task.hours_remaining || task.work_hours)}</td>
                    <td className={`variance ${varClass}`}>
                      {variance > 0 ? '+' : ''}{Math.round(variance)}
                    </td>
                    <td
                      className="date-cell editable"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const val = e.target.textContent.trim()
                        if (val !== task.finish_date) {
                          updateTask(task.id, 'finish_date', val)
                        }
                      }}
                    >
                      {task.finish_date}
                    </td>
                    <td className="progress-cell">
                      <div className="progress-bar-container" onClick={() => setSelectedTask(task)}>
                        <div 
                          className="progress-bar-fill"
                          style={{ 
                            width: `${task.percent_complete}%`,
                            backgroundColor: task.percent_complete >= 100 ? '#10b981' : 
                                           task.percent_complete >= 50 ? '#3b82f6' : '#f59e0b'
                          }}
                        />
                        <span className="progress-text">{task.percent_complete}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={task.percent_complete}
                        className="progress-slider-hidden"
                        onChange={(e) => updateTask(task.id, 'percent_complete', parseInt(e.target.value))}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Charts Panel */}
        <div className="charts-panel">
          <div className="panel-header">
            <h3>📈 Analytics</h3>
            <button className="toggle-btn" onClick={() => setShowCharts(!showCharts)}>
              {showCharts ? '−' : '+'}
            </button>
          </div>
          
          {showCharts && (
            <div className="charts-content">
              {/* S-Curve */}
              <div className="chart-card">
                <div className="chart-title-row">
                  <span className="chart-title">S-Curve</span>
                  <select 
                    className="project-selector"
                    value={selectedProject || ''}
                    onChange={(e) => setSelectedProject(e.target.value || null)}
                  >
                    <option value="">All Projects</option>
                    {parentTasks.map(t => (
                      <option key={t.id} value={t.task}>{t.task}</option>
                    ))}
                  </select>
                </div>
                <div className="scurve-chart">
                  <Line 
                    data={projectScurve ? {
                      labels: projectScurve.labels,
                      datasets: [
                        { ...chartData.datasets[0], data: projectScurve.baseline },
                        { ...chartData.datasets[1], data: projectScurve.scheduled || projectScurve.actual },
                        { ...chartData.datasets[2], data: projectScurve.earned }
                      ]
                    } : chartData} 
                    options={fullScurveOptions} 
                  />
                </div>
              </div>

              {/* Resource Workload */}
              <div className="chart-card">
                <div className="chart-title-row">
                  <span className="chart-title">Resource Workload</span>
                  {resourceAllocation.some(r => r.overallocated) && (
                    <span className="overallocation-warning">⚠️ Overallocation</span>
                  )}
                </div>
                <div className="resource-chart">
                  <Bar data={resourceChartData} options={resourceChartOptions} />
                </div>
                {/* Resource utilization summary */}
                <div className="resource-summary">
                  {resourceAllocation.map(r => (
                    <div key={r.name} className={`resource-badge ${r.overallocated ? 'overallocated' : ''}`}>
                      <span className="resource-name">{r.name}</span>
                      <span className="resource-util">{r.utilization}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase Breakdown */}
              <div className="chart-card">
                <div className="chart-title">
                  Phase Breakdown
                  {selectedTask && <span className="chart-subtitle"> – {selectedTask.task}</span>}
                </div>
                <div className="phase-chart">
                  {(phaseData.dev + phaseData.test + phaseData.review) > 0 ? (
                    <Doughnut data={phaseChartData} options={phaseChartOptions} />
                  ) : (
                    <div className="no-data">No phase data available</div>
                  )}
                </div>
                {selectedTask && (
                  <button className="clear-selection" onClick={() => setSelectedTask(null)}>
                    Show All Tasks
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat Widget */}
        <div className="chat-widget">
          <div className="chat-header">
            <span>🤖</span> AI Copilot
          </div>
          <div className="chat-messages" ref={chatRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role} ${msg.loading ? 'loading' : ''}`}>
                {msg.text}
              </div>
            ))}
            
            {/* Confirmation Options */}
            {pendingAction && pendingAction.options && (
              <div className="confirmation-options">
                {pendingAction.options.map(opt => {
                  const isCancel = opt.label?.toLowerCase().includes('cancel')
                  return (
                    <button
                      key={opt.option}
                      className={`option-btn ${isCancel ? 'cancel' : ''}`}
                      onClick={() => confirmAction(opt.option)}
                      disabled={loading}
                    >
                      <strong>{opt.option}.</strong> {opt.label}
                      {opt.description && <span className="opt-desc"> — {opt.description}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder={pendingAction ? "Choose an option above..." : "Type instructions..."}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChat()}
              disabled={loading || pendingAction}
            />
            <button className="send-btn" onClick={sendChat} disabled={loading || pendingAction}>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
