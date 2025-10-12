import Layout from './Layout.jsx'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom'
import { PAGES, getCurrentPage } from './pageRegistry'

function PagesContent() {
  const location = useLocation()
  const currentPage = getCurrentPage(location.pathname)

  return (
    <Layout currentPageName={currentPage}>
      <Routes>
        <Route path="/" element={<PAGES.Dashboard />} />
        {Object.entries(PAGES).map(([name, Component]) => (
          <Route key={name} path={`/${name}`} element={<Component />} />
        ))}
      </Routes>
    </Layout>
  )
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  )
}
