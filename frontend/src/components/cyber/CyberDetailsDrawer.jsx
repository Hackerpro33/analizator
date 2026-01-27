import React from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Section({ title, children }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default function CyberDetailsDrawer({ selection, onClose, onDrilldown }) {
  const open = Boolean(selection);

  const renderBody = () => {
    if (!selection) {
      return <p className="text-sm text-slate-500">Выберите событие или узел для подробностей.</p>;
    }
    if (selection.type === "event") {
      const eventItem = selection.data;
      return (
        <div className="space-y-3">
          <Section title="Источник">{eventItem.src_ip || "unknown"}</Section>
          <Section title="Цель">{eventItem.dst_host || eventItem.dst_ip || "unknown"}</Section>
          <Section title="User / Process">{eventItem.user || eventItem.process || "—"}</Section>
          <Section title="Действие">{eventItem.action || "—"}</Section>
          <div className="flex gap-2">
            <Badge className="capitalize">{eventItem.severity}</Badge>
            <Badge variant="outline">{eventItem.attack_phase || "phase"}</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onDrilldown?.("segment", eventItem.segment);
              onClose?.();
            }}
          >
            Фильтр по сегменту
          </Button>
        </div>
      );
    }
    if (selection.type === "node") {
      const node = selection.data;
      return (
        <div className="space-y-3">
          <Section title="Узел">{node.label || node.id}</Section>
          <Section title="Тип">{node.type}</Section>
          <Section title="Metadata">{JSON.stringify(node.meta ?? {}, null, 2)}</Section>
        </div>
      );
    }
    if (selection.type === "connection") {
      const connection = selection.data;
      return (
        <div className="space-y-3">
          <Section title="Источник">{connection.source?.asn || connection.source?.country || "unknown"}</Section>
          <Section title="Цель">{connection.target?.city || connection.target?.country || "unknown"}</Section>
          <Section title="Count">{connection.count}</Section>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (connection.target?.segment) {
                onDrilldown?.("segment", connection.target.segment);
              }
              onClose?.();
            }}
          >
            Фильтр по цели
          </Button>
        </div>
      );
    }
    if (selection.type === "heatmap") {
      return (
        <div className="space-y-3">
          <Section title="Row">{selection.row}</Section>
          <Section title="Column">{selection.col}</Section>
          <Section title="Value">{selection.value}</Section>
        </div>
      );
    }
    if (selection.type === "edge") {
      const edge = selection.data;
      return (
        <div className="space-y-3">
          <Section title="Соединение">
            {edge.source} → {edge.target}
          </Section>
          <Section title="Тип">{edge.type}</Section>
          <Section title="Count">{edge.count}</Section>
        </div>
      );
    }
    return null;
  };

  return (
    <Drawer open={open} onOpenChange={(value) => !value && onClose?.()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Подробности</DrawerTitle>
          <DrawerDescription>Контекст выбранного элемента.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">{renderBody()}</div>
        <DrawerFooter>
          <Button onClick={() => onClose?.()}>Закрыть</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
