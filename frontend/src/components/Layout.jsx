import { useEffect, useState } from 'react'
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
import designTokens from '@/design-tokens.json'

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

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--theme-bg-base', designTokens.colorPalette.background.base.hex)
    root.style.setProperty('--theme-bg-surface', designTokens.colorPalette.background.surface.hex)
    root.style.setProperty('--theme-bg-elevated', designTokens.colorPalette.background.elevated.hex)
    root.style.setProperty('--theme-accent-primary', designTokens.colorPalette.primary.hex)
    root.style.setProperty('--theme-accent-info', designTokens.colorPalette.accent.info.hex)
    root.style.setProperty('--theme-text-heading', designTokens.colorPalette.text.heading)
    root.style.setProperty('--theme-text-body', designTokens.colorPalette.text.body)
    root.style.setProperty('--theme-text-muted', designTokens.colorPalette.text.muted)
    root.style.setProperty('--theme-radius-card', designTokens.borderRadius.card)
    root.style.setProperty('--theme-radius-control', designTokens.borderRadius.control)
    root.style.setProperty('--theme-radius-chip', designTokens.borderRadius.chip)
    root.style.setProperty('--theme-shadow-card', designTokens.effects.cardShadow)
    root.style.setProperty('--theme-shadow-panel', designTokens.effects.panelShadow)
    root.style.setProperty('--theme-backdrop-blur', designTokens.effects.backdropBlur)
    root.style.setProperty('--theme-border-surface', designTokens.effects.surfaceBorder)
    root.style.setProperty('--theme-border-subtle', designTokens.effects.subtleBorder)
    root.style.setProperty('--theme-elevated-soft', designTokens.effects.elevatedSoft)
    root.style.setProperty('--theme-elevated-soft-alt', designTokens.effects.elevatedSoftAlt)
    root.style.setProperty('--theme-focus-ring', designTokens.effects.focusRing)
    root.style.setProperty('--theme-accent-glow', designTokens.effects.accentGlow)
    root.style.setProperty('--theme-opacity-surface', String(designTokens.effects.surfaceOpacity))
    root.style.setProperty('--theme-opacity-panel', String(designTokens.effects.panelOpacity))
    root.style.setProperty('--theme-opacity-table-header', String(designTokens.effects.tableHeaderOpacity))
  }, [])

  const currentPage = NAV_ITEMS.find(item =>
    item.exact ? location.pathname === item.path : location.pathname === item.path
  )

  return (
      <div className="flex h-screen theme-bg-base overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 56 : 220 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col theme-glass-surface border-r border-[var(--theme-border-surface)] shrink-0 z-20 overflow-hidden"
      >
        {/* Logo */}
          <div className="h-14 flex items-center px-3 border-b border-[var(--theme-border-surface)] gap-2.5 shrink-0">
            <div
              className="p-1.5 rounded-[var(--theme-radius-chip)] shrink-0 border border-[var(--theme-border-subtle)]"
              style={{ backgroundColor: 'rgba(217, 56, 30, 0.08)' }}
            >
              <BarChart3 className="w-5 h-5 text-[var(--theme-accent-primary)]" />
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
                   <div className="text-sm font-semibold text-[var(--theme-text-heading)] whitespace-nowrap">KPI Tracker</div>
                   <div className="font-data text-[10px] tracking-[0.12em] uppercase text-[var(--theme-text-muted)] whitespace-nowrap">Schedule-IKP</div>
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
                   'flex items-center gap-3 px-2.5 py-2 rounded-[var(--theme-radius-control)] transition-colors text-sm border border-transparent',
                   isActive
                     ? 'bg-[rgba(217,56,30,0.08)] border-[var(--theme-border-surface)] text-[var(--theme-accent-primary)]'
                     : 'text-[var(--theme-text-body)] hover:text-[var(--theme-text-heading)] hover:bg-[rgba(17,17,17,0.03)]'
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
                  <span className="px-1.5 py-0.5 bg-[rgba(188,106,0,0.1)] text-[#9A5300] rounded-[var(--theme-radius-chip)] text-[10px] font-bold shrink-0">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-[var(--theme-border-surface)] shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center p-2 rounded-[var(--theme-radius-control)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-heading)] hover:bg-[rgba(17,17,17,0.03)] transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </motion.aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 theme-glass-surface border-b border-[var(--theme-border-surface)] flex items-center px-6 shrink-0">
          {currentPage && (
            <div className="flex items-center gap-2.5">
              <currentPage.icon className="w-4 h-4 text-[var(--theme-text-muted)]" />
              <span className="font-semibold text-[var(--theme-text-heading)] text-sm">{currentPage.label}</span>
              {currentPage.badge && (
                <span className="px-1.5 py-0.5 bg-[rgba(188,106,0,0.1)] text-[#9A5300] rounded-[var(--theme-radius-chip)] text-[10px] font-bold">
                  {currentPage.badge}
                </span>
              )}
            </div>
          )}
          <span className="ml-auto font-data text-[11px] tracking-[0.12em] uppercase text-[var(--theme-text-muted)] bg-[rgba(17,17,17,0.04)] px-2.5 py-1 rounded-[var(--theme-radius-chip)] border border-[var(--theme-border-subtle)] font-medium">
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
