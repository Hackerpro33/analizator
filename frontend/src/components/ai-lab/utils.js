export function computeDeltaMap(timeline = []) {
  const map = {};
  const byYearMonth = new Map();
  timeline.forEach((point, index) => {
    const date = new Date(point.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    byYearMonth.set(key, point);
    const prev = timeline[index - 1];
    const previousValue = prev ? (prev.actual ?? prev.forecast) : null;
    const currentValue = point.actual ?? point.forecast;
    const mom = { abs: null, pct: null };
    if (previousValue !== null && currentValue !== null) {
      const abs = currentValue - previousValue;
      mom.abs = abs;
      mom.pct = Math.abs(previousValue) > 1e-6 ? (abs / previousValue) * 100 : null;
    }
    const priorYearKey = `${date.getFullYear() - 1}-${date.getMonth() + 1}`;
    const priorYearPoint = byYearMonth.get(priorYearKey);
    const yoy = { abs: null, pct: null };
    if (priorYearPoint) {
      const base = priorYearPoint.actual ?? priorYearPoint.forecast;
      if (base !== null && currentValue !== null) {
        const abs = currentValue - base;
        yoy.abs = abs;
        yoy.pct = Math.abs(base) > 1e-6 ? (abs / base) * 100 : null;
      }
    }
    map[point.date] = { mom, yoy };
  });
  return map;
}

export function updateSelection(currentSet, timeline, lastClicked, date, event) {
  const next = new Set(currentSet);
  const clickedDate = new Date(date);
  if (event.shiftKey && lastClicked) {
    const lastDate = new Date(lastClicked);
    if (clickedDate.getFullYear() === lastDate.getFullYear()) {
      const startMonth = Math.min(clickedDate.getMonth(), lastDate.getMonth());
      const endMonth = Math.max(clickedDate.getMonth(), lastDate.getMonth());
      timeline.forEach((point) => {
        const pointDate = new Date(point.date);
        if (
          pointDate.getFullYear() === clickedDate.getFullYear() &&
          pointDate.getMonth() >= startMonth &&
          pointDate.getMonth() <= endMonth
        ) {
          next.add(point.date);
        }
      });
      return { selection: next, last: date };
    }
  }
  if (event.metaKey || event.ctrlKey) {
    if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }
  } else {
    next.clear();
    next.add(date);
  }
  return { selection: next, last: date };
}

export function aggregateValues(months, aggregation) {
  const values = months
    .map((point) => point.actual ?? point.forecast)
    .filter((value) => value !== null && value !== undefined);
  if (!values.length) {
    return null;
  }
  switch (aggregation) {
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "avg":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}
