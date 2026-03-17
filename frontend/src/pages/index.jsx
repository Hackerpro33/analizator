import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Layout from './Layout.jsx';
import { PAGES } from './pageRegistry';
import { useAuth } from '@/contexts/AuthContext.jsx';
import AccessMessage from '@/components/auth/AccessMessage.jsx';
import { ACCESS_ITEMS } from '@/utils/adminAccess';

const ACCESS_RULES = {
  Dashboard: { requireAuth: false },
};

const DEFAULT_RULE = { requireAuth: true };

function GuardedPage({ name, Component }) {
  const { status, user, canAccess } = useAuth();
  const rules = ACCESS_RULES[name] ?? DEFAULT_RULE;
  const hasManagedAccess = ACCESS_ITEMS.some((item) => item.key === name);

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

  if (hasManagedAccess && !canAccess(name)) {
    return <AccessMessage type="forbidden" />;
  }

  if (rules.roles && !rules.roles.includes(user.role)) {
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
