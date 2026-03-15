from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence

import numpy as np

try:  # Optional dependency: scikit-learn is heavy, so fall back if missing.
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    SKLEARN_AVAILABLE = True
except Exception:  # pragma: no cover - executed only when sklearn missing
    TfidfVectorizer = None
    LogisticRegression = None
    Pipeline = None
    SKLEARN_AVAILABLE = False

from .utils import deduplicate_preserve_order, normalize_text


@dataclass(frozen=True)
class IntentPrediction:
    label: str
    confidence: float
    title: str
    description: str
    focus_points: List[str]
    followups: List[str]
    capabilities: List[str]
    actions: List[str]


INTENT_LIBRARY: Dict[str, Dict[str, Sequence[str] | str]] = {
    "data_quality": {
        "title": "Качество данных",
        "description": "Проверяем пропуски, форматы и выбросы перед сложными моделями.",
        "focus": [
            "Проверить пропуски, дубликаты и несогласованные коды справочников.",
            "Выявить выбросы и внезапные скачки метрик.",
            "Сопоставить источники данных и отследить свежесть загрузок.",
        ],
        "followups": [
            "Какие поля считаются обязательными для этого анализа?",
            "Есть ли SLA по обновлению данных и кто владеет источником?",
        ],
        "capabilities": [
            "Локальное профилирование таблиц и проверка типов столбцов.",
            "Построение гистограмм/boxplot для поиска выбросов.",
        ],
        "actions": [
            "Составьте чек-лист качества: пропуски, выбросы, несогласованные коды.",
            "Сравните свежесть загрузок и выявите устаревшие источники.",
            "Настройте мониторинг качества с alert-каналом.",
        ],
    },
    "automation_ops": {
        "title": "Автоматизация и пайплайны",
        "description": "Строим воспроизводимые пайплайны данных, оркестрацию и алерты качества.",
        "focus": [
            "Разложить процесс обновления данных на шаги и SLA.",
            "Определить критичные зависимости и резервирование.",
            "Встроить проверки качества и авто-рипыры в пайплайн.",
        ],
        "followups": [
            "Какие инструменты оркестрации уже используются?",
            "Нужно ли audit trail для регуляторов?",
        ],
        "capabilities": [
            "Генерация DAG, расписаний и алертов без облака.",
            "Локальный аудит зависимостей и проверка времени выполнения.",
        ],
        "actions": [
            "Опишите текущий pipeline и выявите ручные шаги.",
            "Добавьте контроль версий и алерты о сбоях.",
            "Настройте отчёт о выполнении с SLA и ответственными.",
        ],
    },
    "customer_insights": {
        "title": "Клиентский опыт и NPS",
        "description": "Анализируем воронки, путь клиента и обратную связь.",
        "focus": [
            "Сегментировать клиентов по поведению и удовлетворённости.",
            "Найти узкие места в воронке или онбординге.",
            "Связать NPS/CSI с операционными метриками.",
        ],
        "followups": [
            "Какая точка пути клиента болит сильнее всего?",
            "Есть ли качественные отзывы или только метрики?",
        ],
        "capabilities": [
            "Когортный анализ и тепловые карты по этапам пути клиента.",
            "Связь обратной связи с операционными событиями.",
        ],
        "actions": [
            "Постройте воронку и определите конверсию между этапами.",
            "Соедините данные опросов с действиями пользователя.",
            "Сформируйте гипотезы улучшения онбординга.",
        ],
    },
    "forecasting": {
        "title": "Прогнозы и временные ряды",
        "description": "Готовим тренды, сезонность и сценарный анализ рост/спад.",
        "focus": [
            "Определить тренды и сезонность в ключевых метриках.",
            "Подобрать факторы (weather, инфраструктура, демография) для регрессии.",
            "Сравнить прогноз с целями и подготовить сценарии вмешательств.",
        ],
        "followups": [
            "Какой горизонт прогноза важен для бизнеса?",
            "Какие дополнительные факторы нужно включить или исключить?",
        ],
        "capabilities": [
            "Локальная ансамблевая модель (SARIMA, ETS, ML-регрессоры).",
            "Backtest и оценка точности (MAE/RMSE/SMAPE).",
        ],
        "actions": [
            "Сегментируйте ряд по сезонам и постройте сценарий роста/спада.",
            "Укажите метрики точности, чтобы защитить прогноз на совещании.",
            "Добавьте интервал доверия и предупредите о рисках вне тренда.",
        ],
    },
    "segmentation": {
        "title": "Сегменты и сравнения",
        "description": "Сравниваем категории, ищем лидеров и проблемные сегменты.",
        "focus": [
            "Разбить показатели по сегментам/категориям и сравнить динамику.",
            "Построить KPI-дэшборд с фильтрами по регионам и каналам.",
            "Выявить лидеров/аутсайдеров и сформировать гипотезы.",
        ],
        "followups": [
            "Какие сегменты критичны для целей квартала?",
            "Есть ли признаки каннибализации между каналами?",
        ],
        "capabilities": [
            "Локальные pivot-таблицы и статистика по категориям.",
            "Автоматические рекомендации по фокусу сегментов.",
        ],
        "actions": [
            "Постройте рейтинг сегментов по вкладу/росту.",
            "Отметьте сегменты с отрицательной динамикой и причины.",
            "Сформируйте гипотезы для A/B экспериментов по приоритетным группам.",
        ],
    },
    "geospatial": {
        "title": "Геоаналитика и карты",
        "description": "Нужны тепловые карты, маршруты и уязвимые участки.",
        "focus": [
            "Построить тепловую карту и выявить аномальные районы.",
            "Проверить маршруты/локации с задержками и инцидентами.",
            "Связать георазрез с социально-экономическими факторами.",
        ],
        "followups": [
            "Есть ли координаты или административные коды районов?",
            "Нужны ли прогнозы для конкретных локаций?",
        ],
        "capabilities": [
            "Локальные слои: heatmap, кластеры, изохроны.",
            "Наложение демографии/инфраструктуры без отправки наружу.",
        ],
        "actions": [
            "Отметьте на карте проблемные кластеры и сравните с прошлым периодом.",
            "Проверьте влияние освещения, маршрутов, инфраструктуры.",
            "Подготовьте рекомендации для оперативных служб по районам.",
        ],
    },
    "model_validation": {
        "title": "Валидация прогностических моделей",
        "description": "Верифицируем стабильность, точность и причинную интерпретацию аналитических моделей.",
        "focus": [
            "Собрать baseline (OLS/Logit) и проверить адекватность предпосылок.",
            "Провести чувствительность Ridge/Lasso к мультиколлинеарности.",
            "Сравнить сценарные прогнозы ARIMA/SARIMAX/Prophet и их остатки.",
        ],
        "followups": [
            "Какие метрики точности критичны (RMSE, SMAPE, ROC-AUC)?",
            "Нужны ли эксперименты Difference-in-Differences или тесты причинности?",
        ],
        "capabilities": [
            "Полный стек регрессионных моделей: OLS, Logit/Probit, IV.",
            "Сезонные прогнозы SARIMAX/Prophet с автоподбором сезонности.",
            "Панельные модели: Fixed/Random effects, GMM, тесты Грейнджера.",
        ],
        "actions": [
            "Сформируйте пайплайн валидации с кросс-валидацией и диагностикой остатков.",
            "Сравните различные прогнозные модели и выберите оптимальную по метрикам.",
            "Проведите анализ чувствительности и оформите отчёт по валидации.",
        ],
    },
}


DEFAULT_LIBRARY_ENTRY = {
    "title": "Универсальный аналитический запрос",
    "description": "Определяем цель анализа, KPI и ограничения.",
    "focus": [
        "Уточнить целевую метрику и стейкхолдеров.",
        "Проверить доступность данных и договориться о фильтрах.",
        "Выбрать формат: дашборд, прогноз или отчёт.",
    ],
    "followups": [
        "Какие KPI считать успешными?",
        "Какие ограничения по приватности/регуляции учитывать?",
    ],
    "capabilities": [
        "Провести базовое профилирование и построить визуализации.",
        "Создать быстрый отчёт с основными трендами.",
    ],
    "actions": [
        "Соберите релевантные источники и убедитесь в качестве данных.",
        "Определите ответственность за метрики и каналы коммуникации.",
    ],
}


KEYWORD_HINTS: Dict[str, Sequence[str]] = {
    "geospatial": ("карта", "теплов", "гео", "район", "локац", "map", "heatmap"),
    "forecasting": ("прогноз", "тренд", "horizon", "динамик"),
    "data_quality": ("пропуск", "качест", "анома", "очист"),
    "segmentation": ("сегмент", "кластер", "категор"),
    "model_validation": ("ols", "остат", "ridge", "lasso", "пробит", "логит"),
}


TRAINING_DATA = [
    ("как проверить пропуски и дубликаты в таблице", "data_quality"),
    ("нужен аудит качества данных и типов столбцов", "data_quality"),
    ("почему отчёт показывает аномальные значения", "data_quality"),
    ("нужно очистить данные перед моделированием", "data_quality"),
    ("как сравнить сегменты и категории между собой", "segmentation"),
    ("какой регион показывает лучший рост продаж", "segmentation"),
    ("сравни показатели каналов и найди лидеров", "segmentation"),
    ("нужны выводы по кластерам клиентов", "segmentation"),
    ("построй прогноз и тренд по инцидентам", "forecasting"),
    ("проверить сезонность и спрогнозировать KPI", "forecasting"),
    ("нужен прогноз преступности и сценарии", "forecasting"),
    ("оценить динамику метрик на горизонте 6 месяцев", "forecasting"),
    ("показать тепловую карту и географию инцидентов", "geospatial"),
    ("где находятся кластеры повышенного риска", "geospatial"),
    ("какие районы требуют усиления патрулей", "geospatial"),
    ("нужно сопоставить локации с инфраструктурой", "geospatial"),
    ("сравни OLS и логит модель для прогнозов", "model_validation"),
    ("оценить качество прогноза и остатки", "model_validation"),
    ("как влияет регуляризация на точность модели", "model_validation"),
    ("как автоматизировать обновление витрин данных и DAG", "automation_ops"),
    ("нужен отчёт по выполнению пайплайна данных и SLA", "automation_ops"),
    ("почему падает NPS и что делать с клиентским опытом", "customer_insights"),
    ("разложи путь клиента и найди узкие места в онбординге", "customer_insights"),
]


class _FallbackIntentModel:
    """Simple bag-of-words scorer used when scikit-learn is unavailable."""

    def __init__(self):
        self.token_weights: Dict[str, Counter[str]] = {}
        self.classes_: np.ndarray = np.array([])

    def fit(self, texts: Sequence[str], labels: Sequence[str]):
        grouped: Dict[str, List[str]] = defaultdict(list)
        for text, label in zip(texts, labels):
            grouped[label].append(text)
        weights: Dict[str, Counter[str]] = {}
        for label, samples in grouped.items():
            counter: Counter[str] = Counter()
            for sample in samples:
                counter.update(sample.split())
            weights[label] = counter
        self.token_weights = weights
        self.classes_ = np.array(list(weights.keys()))
        return self

    def predict_proba(self, texts: Sequence[str]) -> np.ndarray:
        if not self.classes_.size:
            return np.zeros((len(texts), 0))
        rows: List[List[float]] = []
        for text in texts:
            tokens = text.split()
            scores: List[float] = []
            for label in self.classes_:
                counter = self.token_weights.get(label, Counter())
                score = sum(counter.get(token, 0) for token in tokens)
                hints = KEYWORD_HINTS.get(label, ())
                if hints:
                    for token in tokens:
                        for hint in hints:
                            if hint in token:
                                score += max(len(hint) * 0.5, 1.0)
                # ensure non-zero mass so softmax does not collapse when no overlap
                scores.append(score if score > 0 else 1.0)
            total = sum(scores)
            if total <= 0:
                probs = [1.0 / len(scores)] * len(scores)
            else:
                probs = [score / total for score in scores]
            rows.append(probs)
        return np.asarray(rows, dtype=float)


class LocalIntentClassifier:
    """Tiny text classifier trained on curated intents to drive responses."""

    def __init__(self, training_data: Iterable[tuple[str, str]] | None = None):
        self.training_data = self._augment_training_data(list(training_data or TRAINING_DATA))
        if not self.training_data:
            raise ValueError("training_data must not be empty")
        self.pipeline = self._build_pipeline()

    def _build_pipeline(self):
        texts, labels = zip(*self.training_data)
        normalized = [normalize_text(text) for text in texts]
        unique_labels = set(labels)
        if SKLEARN_AVAILABLE and len(unique_labels) >= 2:
            pipeline = Pipeline(
                steps=[
                    ("vectorizer", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
                    ("model", LogisticRegression(max_iter=500)),
                ]
            )
            try:
                pipeline.fit(normalized, labels)
                return pipeline
            except ValueError:
                # fall back to heuristic model when scipy stack cannot train (e.g. single-class data)
                pass
        fallback = _FallbackIntentModel()
        fallback.fit(normalized, labels)
        return fallback

    def _augment_training_data(self, examples: List[tuple[str, str]]) -> List[tuple[str, str]]:
        if not examples:
            return []
        augmented = list(examples)
        label_counts = Counter(label for _, label in examples)
        for label in label_counts:
            entry = INTENT_LIBRARY.get(label)
            if not entry:
                continue
            snippets = list(entry.get("focus", [])) + list(entry.get("actions", []))
            snippets.append(entry.get("description", ""))
            for snippet in snippets[:4]:
                text = normalize_text(str(snippet))
                if not text:
                    continue
                augmented.append((text, label))
        return augmented

    def predict(self, text: str, top_k: int = 3, min_confidence: float = 0.15) -> List[IntentPrediction]:
        cleaned = normalize_text(text)
        if not cleaned:
            return []
        probabilities = self.pipeline.predict_proba([cleaned])[0]
        classes = self.pipeline.classes_
        order = np.argsort(probabilities)[::-1][:top_k]
        items: List[IntentPrediction] = []
        for index in order:
            confidence = float(probabilities[index])
            if confidence < min_confidence:
                continue
            label = classes[index]
            entry = INTENT_LIBRARY.get(label, DEFAULT_LIBRARY_ENTRY)
            items.append(
                IntentPrediction(
                    label=label,
                    confidence=confidence,
                    title=str(entry["title"]),
                    description=str(entry["description"]),
                    focus_points=list(entry.get("focus", [])),
                    followups=list(entry.get("followups", [])),
                    capabilities=list(entry.get("capabilities", [])),
                    actions=list(entry.get("actions", [])),
                )
            )
        return items


_CLASSIFIER: LocalIntentClassifier | None = None


def get_intent_classifier() -> LocalIntentClassifier:
    global _CLASSIFIER
    if _CLASSIFIER is None:
        _CLASSIFIER = LocalIntentClassifier()
    return _CLASSIFIER


def intent_focus_points(predictions: Sequence[IntentPrediction]) -> List[str]:
    entries = (hint for prediction in predictions for hint in prediction.focus_points)
    return deduplicate_preserve_order(entries, limit=6)


def intent_followups(predictions: Sequence[IntentPrediction]) -> List[str]:
    entries = (hint for prediction in predictions for hint in prediction.followups)
    return deduplicate_preserve_order(entries, limit=4)


def intent_capabilities(predictions: Sequence[IntentPrediction]) -> List[str]:
    entries = (hint for prediction in predictions for hint in prediction.capabilities)
    return deduplicate_preserve_order(entries, limit=5)


__all__ = [
    "IntentPrediction",
    "INTENT_LIBRARY",
    "LocalIntentClassifier",
    "intent_capabilities",
    "intent_followups",
    "intent_focus_points",
    "get_intent_classifier",
]
