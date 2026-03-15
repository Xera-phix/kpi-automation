import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  Calendar,
  GitBranch,
  Briefcase,
  Database,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: BarChart3, exact: true },
  { path: '/timeline', label: 'Timeline', icon: Calendar, badge: 'POC' },
  { path: '/dependencies', label: 'Dependencies', icon: GitBranch, badge: 'POC' },
  { path: '/management', label: 'Management', icon: Briefcase },
  { path: '/baselines', label: 'Baselines', icon: Database },
  { path: '/what-if', label: 'What-If', icon: FlaskConical },
]

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const currentPage = NAV_ITEMS.find(item =>
    item.exact ? location.pathname === item.path : location.pathname === item.path
  )

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 56 : 220 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col bg-[#111111cc] backdrop-blur-xl border-r border-white/[0.06] shrink-0 z-20 overflow-hidden"
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-white/[0.06] gap-2.5 shrink-0">
          <div className="p-1.5 bg-blue-500/20 rounded-lg shrink-0">
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="logo-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="text-sm font-semibold text-white whitespace-nowrap">KPI Tracker</div>
                <div className="text-[10px] text-white/30 whitespace-nowrap">Schedule-IKP</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors text-sm',
                  isActive
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key="nav-label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="whitespace-nowrap flex-1"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {!collapsed && item.badge && (
                  <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-300 rounded text-[10px] font-bold shrink-0">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-white/[0.06] shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </motion.aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-[#111111cc] backdrop-blur-xl border-b border-white/[0.06] flex items-center px-6 shrink-0">
          {currentPage && (
            <div className="flex items-center gap-2.5">
              <currentPage.icon className="w-4 h-4 text-white/40" />
              <span className="font-semibold text-white text-sm">{currentPage.label}</span>
              {currentPage.badge && (
                <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-300 rounded text-[10px] font-bold">
                  {currentPage.badge}
                </span>
              )}
            </div>
          )}
          <span className="ml-auto text-xs text-white/30 bg-white/[0.06] px-2.5 py-1 rounded-full font-medium">
            v2.2
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
