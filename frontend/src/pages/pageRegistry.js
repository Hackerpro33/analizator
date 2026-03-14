import Dashboard from './Dashboard'
import AdvancedAnalytics from './AdvancedAnalytics'
import DataSources from './DataSources'
import Charts from './Charts'
import Maps from './Maps'
import Forecasting from './Forecasting'
import NetworkGraphs from './NetworkGraphs'
import Constructor from './Constructor'
import Settings from './Settings'
import DataTransformation from './DataTransformation'
import Assistant from './Assistant'
import AILab from './AILab'
import CyberSecurity from './CyberSecurity'
import Admin from './Admin'
import Lineyka from './Lineyka'

export const PAGES = {
  Dashboard,
  AdvancedAnalytics,
  DataSources,
  Charts,
  Maps,
  Forecasting,
  NetworkGraphs,
  Constructor,
  Settings,
  DataTransformation,
  Assistant,
  AILab,
  CyberSecurity,
  Admin,
  Lineyka,
}

export function getCurrentPage(url) {
  if (typeof url !== 'string') {
    return Object.keys(PAGES)[0]
  }
  let normalized = url
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  const last = normalized.split('/').pop() || ''
  const clean = last.includes('?') ? last.split('?')[0] : last
  const pageName = Object.keys(PAGES).find((page) => page.toLowerCase() === clean.toLowerCase())
  return pageName || Object.keys(PAGES)[0]
}
