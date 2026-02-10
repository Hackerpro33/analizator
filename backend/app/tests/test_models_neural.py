from __future__ import annotations

import pytest

from ..models import classifier as classifier_module
from ..models.classifier import IntentPrediction, LocalIntentClassifier
from ..models.forecasting import LocalSeriesInterpreter
from ..models.neural import LocalAIAgent


def test_local_intent_classifier_distinguishes_simple_domains():
    classifier = LocalIntentClassifier(
        training_data=[
            ("построить прогноз продаж на квартал", "forecasting"),
            ("показать тепловую карту районов по инцидентам", "geospatial"),
        ]
    )

    geo_prediction = classifier.predict("нужно построить карту районов и найти аномалии", top_k=1)[0]
    forecast_prediction = classifier.predict("посчитай прогноз продаж на следующий квартал", top_k=1)[0]

    assert geo_prediction.label == "geospatial"
    assert forecast_prediction.label == "forecasting"
    assert geo_prediction.confidence > 0.5
    assert forecast_prediction.confidence > 0.5


def test_local_intent_classifier_fallback_without_sklearn(monkeypatch):
    monkeypatch.setattr(classifier_module, "SKLEARN_AVAILABLE", False, raising=False)

    classifier = classifier_module.LocalIntentClassifier(
        training_data=[
            ("собери карту рисков по районам", "geospatial"),
            ("сделай прогноз продаж", "forecasting"),
        ]
    )

    prediction = classifier.predict("нужна тепловая карта райнов", top_k=1)[0]
    assert prediction.label == "geospatial"


def test_local_intent_classifier_augments_training_examples():
    base = [
        ("построй прогноз", "forecasting"),
    ]
    classifier = classifier_module.LocalIntentClassifier(training_data=base)
    assert len(classifier.training_data) > len(base)


class DummyClassifier:
    def __init__(self, predictions):
        self._predictions = predictions

    def predict(self, message):
        return self._predictions


class DummyInterpreter:
    def interpret_context(self, context):
        return [f"Целевой показатель: {context.get('target')}."]


def test_local_ai_agent_returns_structured_sections():
    predictions = [
        IntentPrediction(
            label="forecasting",
            confidence=0.9,
            title="Прогнозирование спроса",
            description="Ищем тренды и сезонность.",
            focus_points=["Сегментировать ряды"],
            followups=["Какой горизонт прогноза важен?"],
            capabilities=["Backtest и оценка точности (MAE/RMSE/SMAPE)."],
            actions=["Подготовьте данные", "Оцените точность"],
        )
    ]
    agent = LocalAIAgent(classifier=DummyClassifier(predictions), interpreter=DummyInterpreter())

    response = agent.generate("нужен прогноз", {"target": "KPI"})

    assert response.focus_points == ["Сегментировать ряды"]
    assert any("горизонт" in question.lower() for question in response.followup_questions)
    assert response.capabilities[0].startswith("Backtest")
    assert "90%" in response.reasoning_block
    assert "Прогнозирование спроса" in response.reasoning_block
    assert response.context_lines == ["Целевой показатель: KPI."]


def test_local_ai_agent_contextualizes_followups_and_capabilities():
    predictions = [
        IntentPrediction(
            label="customer_insights",
            confidence=0.8,
            title="Клиентский опыт",
            description="Связываем путь клиента и метрики сервиса.",
            focus_points=["Разложить путь клиента"],
            followups=["Какая обратная связь важна?"],
            capabilities=["Когортный анализ поведения."],
            actions=["Соберите обратную связь", "Найдите узкие места"],
        )
    ]
    interpreter = LocalSeriesInterpreter()
    agent = LocalAIAgent(classifier=DummyClassifier(predictions), interpreter=interpreter)

    context = {
        "target": "NPS",
        "series": {"values": [10, 12, 20, 15, 25, 32], "label": "NPS"},
        "delta": {"abs": 4.5},
    }
    response = agent.generate("разбери путь клиента", context)

    assert any("NPS" in question for question in response.followup_questions)
    assert any("сценар" in capability.lower() or "анализ" in capability.lower() for capability in response.capabilities)
    assert any("Сигналы" in line or "Серия" in line for line in response.context_lines)
