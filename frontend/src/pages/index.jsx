import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Layout from './Layout.jsx';
import { PAGES } from './pageRegistry';
import { useAuth } from '@/contexts/AuthContext.jsx';
import AccessMessage from '@/components/auth/AccessMessage.jsx';

const ACCESS_RULES = {
  Dashboard: { requireAuth: false },
  CyberSecurity: { requireAuth: true, roles: ['admin', 'security', 'security_viewer'] },
  Admin: { requireAuth: true, roles: ['admin'] },
};

const DEFAULT_RULE = { requireAuth: true };

function GuardedPage({ name, Component }) {
  const { status, user, hasRole } = useAuth();
  const rules = ACCESS_RULES[name] ?? DEFAULT_RULE;

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Проверка доступа…
      </div>
    );
  }

  if (!rules.requireAuth) {
    return <Component />;
  }

  if (!user) {
    return <AccessMessage type="login" />;
  }

  if (rules.roles && !hasRole(rules.roles)) {
    return <AccessMessage type="forbidden" />;
  }

  return <Component />;
}

function PagesContent() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<GuardedPage name="Dashboard" Component={PAGES.Dashboard} />}
        />
        {Object.entries(PAGES).map(([name, Component]) => (
          <Route
            key={name}
            path={`/${name}`}
            element={<GuardedPage name={name} Component={Component} />}
          />
        ))}
      </Routes>
    </Layout>
  );
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  );
}
