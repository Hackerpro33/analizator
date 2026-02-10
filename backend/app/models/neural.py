from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .classifier import (
    LocalIntentClassifier,
    intent_capabilities,
    intent_followups,
    intent_focus_points,
    get_intent_classifier,
)
from .forecasting import LocalSeriesInterpreter


DEFAULT_REASONING = (
    "Продвинутый ответ локального ИИ:\n"
    "• Тематика запроса: аналитические модели и визуализация\n"
    "• Контекст: уточните какие регрессии, прогнозы или панельные эффекты требуется проверить.\n"
    "• Следующие шаги:\n"
    "  - Соберите набор данных, определите целевую метрику и признаки.\n"
    "  - Выберите модель (OLS, логит/пробит, ARIMA/SARIMAX, Prophet) и подготовьте валидацию.\n"
    "  - Настройте визуализации, подчёркивающие выводы и остатки.\n"
)


@dataclass
class AgentResponse:
    focus_points: List[str]
    followup_questions: List[str]
    capabilities: List[str]
    reasoning_block: str
    context_lines: List[str]


class LocalAIAgent:
    """Glue module that transforms intents/context into structured guidance."""

    def __init__(
        self,
        classifier: Optional[LocalIntentClassifier] = None,
        interpreter: Optional[LocalSeriesInterpreter] = None,
    ):
        self.classifier = classifier or get_intent_classifier()
        self.interpreter = interpreter or LocalSeriesInterpreter()

    def _reasoning(self, predictions, context_hint: Optional[str] = None) -> str:
        if not predictions:
            return DEFAULT_REASONING
        best = predictions[0]
        steps = "\n".join(f"  - {step}" for step in best.actions[:4])
        confidence = f"{best.confidence*100:.0f}%"
        return (
            "Продвинутый ответ локального ИИ:\n"
            f"• Тематика запроса: {best.title}\n"
            f"• Контекст: {best.description}\n"
            f"• Вероятность сценария: {confidence}\n"
            f"• Следующие шаги:\n{steps}"
            + (f"\n• Сигналы данных: {context_hint}" if context_hint else "")
        )

    def generate(self, message: str, context: Optional[Dict[str, Any]]) -> AgentResponse:
        predictions = self.classifier.predict(message)
        context_lines = self.interpreter.interpret_context(context)
        focus_points = intent_focus_points(predictions)
        followups = self._contextual_followups(intent_followups(predictions), context)
        capabilities = self._contextual_capabilities(intent_capabilities(predictions), context)
        reasoning_block = self._reasoning(predictions, self._context_hint(context_lines))
        return AgentResponse(
            focus_points=focus_points,
            followup_questions=followups,
            capabilities=capabilities,
            reasoning_block=reasoning_block,
            context_lines=context_lines,
        )

    def _context_hint(self, context_lines: List[str]) -> Optional[str]:
        if not context_lines:
            return None
        first = context_lines[0].lstrip("• ").strip()
        return first or None

    def _deduplicate(self, items: List[str], limit: int) -> List[str]:
        result: List[str] = []
        seen: set[str] = set()
        for item in items:
            text = item.strip()
            if not text or text in seen:
                continue
            result.append(text)
            seen.add(text)
            if len(result) >= limit:
                break
        return result

    def _contextual_followups(self, followups: List[str], context: Optional[Dict[str, Any]]) -> List[str]:
        items = list(followups)
        if context:
            target = context.get("target")
            if target:
                items.insert(0, f"Что будет считаться успехом для «{target}» и какие границы KPI критичны?")
            if context.get("series"):
                items.append("Нужно ли фиксировать базовый период для сравнения трендов?")
            if context.get("forecast"):
                items.append("Нужны ли оптимистичный/стресс-сценарии для прогноза?")
        return self._deduplicate(items, limit=4)

    def _contextual_capabilities(self, capabilities: List[str], context: Optional[Dict[str, Any]]) -> List[str]:
        items = list(capabilities)
        if context:
            if context.get("series"):
                items.append("Сценарный анализ временных рядов с ранним предупреждением об аномалиях.")
            if context.get("delta"):
                items.append("Автоматическое объяснение скачков и поиск драйверов изменения.")
            if context.get("pipeline") or context.get("automation"):
                items.append("Проектирование пайплайнов и контроль SLA с локальными DAG.")
        return self._deduplicate(items, limit=5)


_AGENT: LocalAIAgent | None = None


def get_local_agent() -> LocalAIAgent:
    global _AGENT
    if _AGENT is None:
        _AGENT = LocalAIAgent()
    return _AGENT


__all__ = [
    "AgentResponse",
    "LocalAIAgent",
    "get_local_agent",
]
