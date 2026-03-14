// Inspired by react-hot-toast library
import { useEffect, useState } from "react";

const TOAST_DURATION = 5000;
const TOAST_REMOVE_DELAY = 1000;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();
const toastAutoDismissTimeouts = new Map();

const clearAutoDismiss = (toastId) => {
  if (toastId === undefined) {
    toastAutoDismissTimeouts.forEach((timeout, id) => {
      clearTimeout(timeout);
      toastAutoDismissTimeouts.delete(id);
    });
    return;
  }

  const timeout = toastAutoDismissTimeouts.get(toastId);
  if (!timeout) {
    return;
  }
  clearTimeout(timeout);
  toastAutoDismissTimeouts.delete(toastId);
};

const scheduleAutoDismiss = (toastId, duration = TOAST_DURATION) => {
  clearAutoDismiss(toastId);

  const timeout = setTimeout(() => {
    dispatch({
      type: actionTypes.DISMISS_TOAST,
      toastId,
    });
    toastAutoDismissTimeouts.delete(toastId);
  }, duration);

  toastAutoDismissTimeouts.set(toastId, timeout);
};

const addToRemoveQueue = (toastId) => {
  if (!toastId || toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        currentToast: action.toast,
      };
    case actionTypes.UPDATE_TOAST:
      if (!state.currentToast) {
        return {
          ...state,
          currentToast: action.toast,
        };
      }
      if (state.currentToast.id !== action.toast.id) {
        return {
          ...state,
          currentToast: action.toast,
        };
      }
      return {
        ...state,
        currentToast: {
          ...state.currentToast,
          ...action.toast,
        },
      };
    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;
      if (!state.currentToast) {
        return state;
      }

      if (toastId && state.currentToast.id !== toastId) {
        return state;
      }

      addToRemoveQueue(state.currentToast.id);
      return {
        ...state,
        currentToast: {
          ...state.currentToast,
          open: false,
        },
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (!state.currentToast) {
        return state;
      }
      if (!action.toastId || state.currentToast.id === action.toastId) {
        return {
          ...state,
          currentToast: null,
        };
      }
      return state;
    default:
      return state;
  }
};

const listeners = [];

let memoryState = { currentToast: null };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

const buildDedupeKey = ({ dedupeKey, title, description, variant }) => {
  if (dedupeKey === false) {
    return null;
  }
  if (typeof dedupeKey === "string" && dedupeKey.length > 0) {
    return dedupeKey;
  }

  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedDescription =
    typeof description === "string" ? description.trim() : "";
  if (!normalizedTitle && !normalizedDescription) {
    return null;
  }

  return [normalizedTitle, normalizedDescription, variant]
    .filter(Boolean)
    .join("|");
};

function toast({ duration = TOAST_DURATION, ...props }) {
  const dedupeKey = buildDedupeKey(props);
  const existingToast =
    dedupeKey && memoryState.currentToast?.dedupeKey === dedupeKey
      ? memoryState.currentToast
      : undefined;
  const id = existingToast?.id ?? genId();

  const update = (props) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id, dedupeKey },
    });

  const dismiss = () => {
    clearAutoDismiss(id);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  const baseToast = {
    ...props,
    dedupeKey,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss();
    },
  };

  if (existingToast) {
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: baseToast,
    });
  } else {
    dispatch({
      type: actionTypes.ADD_TOAST,
      toast: baseToast,
    });
  }
  scheduleAutoDismiss(id, duration);

  return {
    id,
    dismiss,
    update,
  };
}

function useToast(options = {}) {
  const { subscribe = false } = options;
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    if (!subscribe) {
      return undefined;
    }
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [subscribe]);

  return {
    ...(subscribe ? state : memoryState),
    toast,
    dismiss: (toastId) => {
      clearAutoDismiss(toastId);
      dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
    },
  };
}

export { useToast, toast };
