from __future__ import annotations

import ast
import json
import operator
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


APP_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = APP_DIR / "data" / "general_topics.json"


def _load_topics(path: Path) -> List[Dict[str, Any]]:
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            if isinstance(payload, list):
                return payload
        except Exception:
            pass
    return []


def _normalize(text: str) -> str:
    cleaned = re.sub(r"[^а-яa-z0-9ё\s]", " ", text.lower())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


MATH_PATTERNS = [
    r"сколько будет (?P<expr>[0-9\s\+\-\*/\(\)\.]+)",
    r"calculate (?P<expr>[0-9\s\+\-\*/\(\)\.]+)",
    r"(?:реши|посчитай) (?P<expr>[0-9\s\+\-\*/\(\)\.]+)",
]


SAFE_OPERATORS: Dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


@dataclass
class GeneralAnswer:
    text: str


class GeneralKnowledgeResponder:
    """Lightweight responder that может формировать ответы на произвольные вопросы."""

    def __init__(self, topics: Optional[Sequence[Dict[str, Any]]] = None):
        records = list(topics) if topics is not None else _load_topics(DATA_FILE)
        self.topics = records

    def answer(self, question: str) -> GeneralAnswer:
        cleaned_question = question.strip()
        if not cleaned_question:
            return GeneralAnswer("Задайте вопрос, и я подберу содержательный ответ.")

        math_result = self._try_math_answer(cleaned_question)
        if math_result is not None:
            return GeneralAnswer(math_result)

        topic_entry = self._match_topic(cleaned_question)
        if topic_entry:
            return GeneralAnswer(self._format_topic_answer(cleaned_question, topic_entry))

        return GeneralAnswer(self._reflective_answer(cleaned_question))

    # --- math handling -------------------------------------------------

    def _try_math_answer(self, question: str) -> Optional[str]:
        lowered = question.lower()
        for pattern in MATH_PATTERNS:
            match = re.search(pattern, lowered)
            if not match:
                continue
            expression = match.group("expr")
            if not expression:
                continue
            value = self._safe_eval(expression)
            if value is None:
                continue
            return (
                "Быстрый расчёт готов:\n"
                f"• Выражение: {expression.strip()}\n"
                f"• Ответ: {value:.4g}\n"
                "Можно задать следующий вопрос или усложнить вычисление."
            )
        return None

    def _safe_eval(self, expression: str) -> Optional[float]:
        sanitized = re.sub(r"[^0-9\.\+\-\*/\(\) ]", "", expression)
        sanitized = sanitized.strip()
        if not sanitized:
            return None
        try:
            node = ast.parse(sanitized, mode="eval")
            return float(self._eval_node(node.body))
        except Exception:
            return None

    def _eval_node(self, node: ast.AST) -> float:
        if isinstance(node, ast.Num):  # type: ignore[attr-defined]
            return float(node.n)  # type: ignore[attr-defined]
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPERATORS:
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)
            return SAFE_OPERATORS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in SAFE_OPERATORS:
            operand = self._eval_node(node.operand)
            return SAFE_OPERATORS[type(node.op)](operand)
        raise ValueError("Unsupported expression")

    # --- topic answers -------------------------------------------------

    def _match_topic(self, question: str) -> Optional[Dict[str, Any]]:
        if not self.topics:
            return None

        normalized_question = _normalize(question)
        best_entry: Optional[Dict[str, Any]] = None
        best_score = 0.0
        for entry in self.topics:
            score = self._score_entry(normalized_question, entry)
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_score < 0.6:
            return None
        return best_entry

    def _score_entry(self, question: str, entry: Dict[str, Any]) -> float:
        keywords = [_normalize(keyword) for keyword in entry.get("keywords") or []]
        hits = sum(1 for keyword in keywords if keyword and keyword in question)
        ratio = SequenceMatcher(None, question, _normalize(entry.get("summary", ""))).ratio()
        overlap = len(set(question.split()) & set(_normalize(entry.get("title", "")).split()))
        return hits * 0.8 + ratio + overlap * 0.2

    def _format_topic_answer(self, question: str, entry: Dict[str, Any]) -> str:
        facts = entry.get("facts") or []
        tips = entry.get("tips") or []
        followups = entry.get("followups") or []

        def as_bullets(items: Sequence[str]) -> str:
            return "\n".join(f"• {item}" for item in items if item)

        segments = [
            "Универсальный режим: отвечаю не только про аналитику.",
            f"Вопрос: {question}",
            f"Тема: {entry.get('title')}",
            entry.get("summary", ""),
        ]

        if facts:
            segments.append("Ключевые факты:\n" + as_bullets(facts[:3]))
        if tips:
            segments.append("Практические шаги:\n" + as_bullets(tips[:3]))
        guidance = self._question_guidance(question)
        if guidance:
            segments.append("Логика ответа:\n" + as_bullets(guidance))
        if followups:
            segments.append("Можно уточнить:\n" + as_bullets(followups[:2]))

        return "\n\n".join(segment for segment in segments if segment)

    # --- fallback ------------------------------------------------------

    def _reflective_answer(self, question: str) -> str:
        takeaways = self._question_guidance(question)
        if not takeaways:
            takeaways = [
                "Сформулируйте цель вопроса: факт, совет или инструкция.",
                "Разбейте проблему на измеримые подпункты.",
                "Сравните несколько источников, чтобы исключить смещения.",
            ]
        bullet_text = "\n".join(f"• {item}" for item in takeaways)
        return (
            "Пока в локальной базе нет точного факта по этому вопросу, "
            "но вот как можно подойти к поиску ответа:\n"
            f"{bullet_text}\n\n"
            "Можно уточнить контекст или задать новый вопрос — я отвечу в свободной форме."
        )

    def _question_guidance(self, question: str) -> List[str]:
        lowered = question.lower()
        guidance: List[str] = []
        if any(token in lowered for token in ["почему", "why"]):
            guidance.append("Определите причину и проверяйте каждую гипотезу отдельными наблюдениями.")
            guidance.append("Сравните текущую ситуацию с базовым уровнем, чтобы увидеть отклонение.")
        if any(token in lowered for token in ["как", "how", "что делать"]):
            guidance.append("Разбейте задачу на шаги: подготовка, выполнение, проверка результата.")
            guidance.append("Определите критерии успеха и ресурсы, которые доступны.")
        if any(token in lowered for token in ["когда", "дедлайн", "срок", "when"]):
            guidance.append("Составьте временную шкалу и добавьте буфер для рисков.")
        if any(token in lowered for token in ["где", "куда", "место", "where"]):
            guidance.append("Сравните варианты по критериям безопасности, стоимости и логистики.")
        if any(token in lowered for token in ["что такое", "define", "определи"]):
            guidance.append("Дайте определение, затем пример и контрпример для закрепления.")
        return guidance


_GENERAL_RESPONDER: Optional[GeneralKnowledgeResponder] = None


def get_general_responder() -> GeneralKnowledgeResponder:
    global _GENERAL_RESPONDER
    if _GENERAL_RESPONDER is None:
        _GENERAL_RESPONDER = GeneralKnowledgeResponder()
    return _GENERAL_RESPONDER


__all__ = [
    "GeneralKnowledgeResponder",
    "GeneralAnswer",
    "get_general_responder",
]
