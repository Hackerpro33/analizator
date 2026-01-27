import React, { useEffect, useState } from "react";
import { Shield, AlertTriangle, RefreshCcw, ClipboardCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchHostStatus } from "@/api/cybersecurity";

const PLAYBOOK_STEPS = [
  "Изолировать хост (firewall/VPN) и зафиксировать текущее состояние",
  "Сверить целостность через AIDE и проверить новые бинарники/скрипты",
  "Проверить автозапуски (systemd, cron, rc.local) и сетевые соединения",
  "Собрать артефакты (логи auditd, usbguard, процесс лист, открытые сокеты)",
  "Пересобрать образ/контейнер и выполнить ротацию секретов",
];

const STATUS_COLORS = {
  ok: "bg-emerald-100 text-emerald-700",
  drift: "bg-amber-100 text-amber-700",
  alert: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
  unknown: "bg-slate-100 text-slate-600",
};

export default function HostProtectionPanel() {
  const [status, setStatus] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchHostStatus();
      setStatus(response.status || []);
      setEvents(response.events || []);
    } catch (error) {
      console.error("Host protection fetch failed", error); // eslint-disable-line no-console
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-500" />
          Host Protection
        </h3>
        <Button size="sm" variant="outline" onClick={load} className="gap-2" disabled={loading}>
          <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {status.map((item) => (
          <Card key={item.tool} className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-slate-700 text-base">{item.tool.toUpperCase()}</CardTitle>
              <Badge className={STATUS_COLORS[item.status] || STATUS_COLORS.unknown}>{item.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-slate-600">
              {Object.entries(item.details || {}).map(([key, value]) => (
                <p key={key}>
                  <span className="font-semibold">{key}:</span> {String(value)}
                </p>
              ))}
              <p className="text-xs text-slate-400">
                Обновлено: {item.updated_at ? new Date(item.updated_at).toLocaleString() : "—"}
              </p>
            </CardContent>
          </Card>
        ))}
        {!status.length && <p className="text-sm text-slate-500">Статусы ещё не получены от агента.</p>}
      </div>
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Telemetry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-72 overflow-auto">
          {events.map((event) => (
            <div key={event.id} className="border rounded-lg p-3 text-sm text-slate-700">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{new Date(event.ts).toLocaleString()}</span>
                <Badge variant="outline">{event.severity}</Badge>
              </div>
              <p>{event.message || event.technique_category}</p>
            </div>
          ))}
          {!events.length && <p className="text-sm text-slate-500">Аномалии не обнаружены.</p>}
        </CardContent>
      </Card>
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-700 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-indigo-500" />
            Playbook: подозрение на бэкдор
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowPlaybook((prev) => !prev)}>
            {showPlaybook ? "Скрыть" : "Показать"}
          </Button>
        </CardHeader>
        {showPlaybook && (
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
              {PLAYBOOK_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
