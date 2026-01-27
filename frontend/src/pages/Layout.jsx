

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  BarChart3, 
  Database, 
  Map, 
  TrendingUp, 
  Home,
  Sparkles,
  Activity,
  Network,
  Component, // Added Component icon
  Settings as SettingsIcon, // Imported SettingsIcon
  RefreshCw, // Added RefreshCw icon for Data Transformation
  MessageSquare,
  ShieldCheck,
  Users,
  Brain,
  Shield,
  UserCog,
  Columns3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import AuthControls from "@/components/auth/AuthControls.jsx";
import { useAuth } from "@/contexts/AuthContext.jsx";

const navigationItems = [
  {
    title: "Панель управления",
    url: createPageUrl("Dashboard"),
    icon: Home,
    gradient: "from-emerald-500 to-teal-600",
    requireAuth: false
  },
  {
    title: "Аналитический ассистент",
    url: createPageUrl("Assistant"),
    icon: MessageSquare,
    gradient: "from-violet-500 to-purple-600",
    requireAuth: true
  },
  {
    title: "ИИ-лаборатория",
    url: createPageUrl("AILab"),
    icon: Brain,
    gradient: "from-purple-500 to-indigo-500",
    requireAuth: true
  },
  {
    title: "Продвинутая аналитика",
    url: createPageUrl("AdvancedAnalytics"),
    icon: ShieldCheck,
    gradient: "from-blue-600 to-purple-600",
    requireAuth: true
  },
  {
    title: "Кибербезопасность",
    url: createPageUrl("CyberSecurity"),
    icon: Shield,
    gradient: "from-slate-600 to-slate-900",
    requireAuth: true,
    roles: ["admin", "security"]
  },
  {
    title: "Источники данных",
    url: createPageUrl("DataSources"),
    icon: Database,
    gradient: "from-blue-500 to-cyan-600",
    requireAuth: true
  },
  {
    title: "Преобразование данных",
    url: createPageUrl("DataTransformation"),
    icon: RefreshCw,
    gradient: "from-green-500 to-emerald-600",
    requireAuth: true
  },
  {
    title: "Линейка",
    url: createPageUrl("Lineyka"),
    icon: Columns3,
    gradient: "from-amber-500 to-orange-600",
    requireAuth: true
  },
  {
    title: "Карты",
    url: createPageUrl("Maps"),
    icon: Map,
    gradient: "from-purple-500 to-indigo-600",
    requireAuth: true
  },
  {
    title: "Графики",
    url: createPageUrl("Charts"),
    icon: BarChart3,
    gradient: "from-orange-500 to-red-600",
    requireAuth: true
  },
  {
    title: "Прогнозирование",
    url: createPageUrl("Forecasting"),
    icon: TrendingUp,
    gradient: "from-pink-500 to-rose-600",
    requireAuth: true
  },
  {
    title: "Графы связей",
    url: createPageUrl("NetworkGraphs"),
    icon: Network,
    gradient: "from-cyan-500 to-blue-600",
    requireAuth: true
  },
  {
    title: "Конструктор",
    url: createPageUrl("Constructor"),
    icon: Component,
    gradient: "from-slate-500 to-slate-600",
    requireAuth: true
  },
  {
    title: "Совместная работа",
    url: createPageUrl("Collaboration"),
    icon: Users,
    gradient: "from-sky-500 to-blue-600",
    requireAuth: true
  },
  {
    title: "Настройки",
    url: createPageUrl("Settings"),
    icon: SettingsIcon,
    gradient: "from-gray-500 to-slate-600",
    requireAuth: true
  },
  {
    title: "Администрирование",
    url: createPageUrl("Admin"),
    icon: UserCog,
    gradient: "from-gray-800 to-black",
    requireAuth: true,
    roles: ["admin"]
  }
];

export default function Layout({ children }) {
  const location = useLocation();
  const { user, hasRole } = useAuth();

  const filteredNavigation = navigationItems.filter((item) => {
    if (item.requireAuth === false) {
      return true;
    }
    if (!user) {
      return false;
    }
    if (item.roles && !hasRole(item.roles)) {
      return false;
    }
    return true;
  });

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --gradient-mesh: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          --glass-bg: rgba(255, 255, 255, 0.08);
          --glass-border: rgba(255, 255, 255, 0.12);
        }
        
        .glass-effect {
          backdrop-filter: blur(20px);
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
        }
        
        .nav-item {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .nav-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        
        .gradient-text {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .elegant-text {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing: -0.02em;
          line-height: 1.5;
        }

        .heading-text {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing: -0.03em;
          font-weight: 700;
        }
      `}</style>
      
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Sidebar className="border-none bg-slate-900/95 backdrop-blur-xl">
          <SidebarHeader className="border-b border-slate-700/50 p-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-2 h-2 text-white" />
                </div>
              </div>
              <div>
                <h2 className="font-bold text-lg elegant-text text-orange-400">Анализатор</h2>
                <p className="text-xs text-slate-400 elegant-text">Платформа для аналитики</p>
              </div>
            </div>
            <div className="mt-4">
              <AuthControls />
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-3 elegant-text">
                Навигация
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {filteredNavigation.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <Link 
                            to={item.url} 
                            className={`nav-item flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 elegant-text ${
                              isActive 
                                ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg shadow-blue-500/25`
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.title}</span>
                            {isActive && (
                              <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm elegant-text">Локальная аналитика</p>
                  <p className="text-slate-400 text-xs elegant-text">на базе ML</p>
                </div>
              </div>
              <div className="space-y-2 text-xs elegant-text">
                <div className="flex justify-between text-slate-300">
                  <span>Точность модели</span>
                  <span className="text-green-300 font-medium">94.2%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Точек данных</span>
                  <span className="text-blue-300 font-medium">1.2M</span>
                </div>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/70 backdrop-blur-xl border-b border-white/20 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4 justify-between">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-bold heading-text text-orange-600">Анализатор</h1>
              <AuthControls />
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
