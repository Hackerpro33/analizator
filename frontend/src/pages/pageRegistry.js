import Dashboard from './Dashboard'
import DataSources from './DataSources'
import Charts from './Charts'
import Maps from './Maps'
import Forecasting from './Forecasting'
import NetworkGraphs from './NetworkGraphs'
import Constructor from './Constructor'
import Settings from './Settings'
import DataTransformation from './DataTransformation'
import Assistant from './Assistant'
import Collaboration from './Collaboration'

export const PAGES = {
  Dashboard,
  DataSources,
  Charts,
  Maps,
  Forecasting,
  NetworkGraphs,
  Constructor,
  Settings,
  DataTransformation,
  Assistant,
  Collaboration,
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
