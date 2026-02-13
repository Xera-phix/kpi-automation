import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import TimelinePage from './pages/TimelinePage.jsx'
import DependenciesPage from './pages/DependenciesPage.jsx'
import BaselinePage from './pages/BaselinePage.jsx'
import WhatIfPage from './pages/WhatIfPage.jsx'
import ManagementPage from './pages/ManagementPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/dependencies" element={<DependenciesPage />} />
        <Route path="/baselines" element={<BaselinePage />} />
        <Route path="/what-if" element={<WhatIfPage />} />
        <Route path="/management" element={<ManagementPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
