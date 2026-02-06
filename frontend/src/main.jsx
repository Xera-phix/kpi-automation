import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import TimelinePage from './pages/TimelinePage.jsx'
import DependenciesPage from './pages/DependenciesPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/dependencies" element={<DependenciesPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
