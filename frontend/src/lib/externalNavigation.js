function getWindowRef(explicitWindow, hasExplicitWindow) {
  if (hasExplicitWindow) return explicitWindow;
  if (typeof window === "undefined") return null;
  return window;
}

function getDocumentRef(explicitDocument, hasExplicitDocument) {
  if (hasExplicitDocument) return explicitDocument;
  if (typeof document === "undefined") return null;
  return document;
}

export function openExternalUrl(url, options = {}) {
  const windowRef = getWindowRef(options.windowRef, Object.hasOwn(options, "windowRef"));
  const documentRef = getDocumentRef(options.documentRef, Object.hasOwn(options, "documentRef"));

  if (!windowRef || !url) {
    return { opened: false, method: "unavailable" };
  }

  if (typeof windowRef.open === "function") {
    const popup = windowRef.open(url, "_blank", "noopener,noreferrer");
    if (popup && popup !== windowRef) {
      return { opened: true, method: "window.open" };
    }
  }

  if (documentRef?.body && typeof documentRef.createElement === "function") {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    documentRef.body.appendChild(anchor);
    anchor.click();
    documentRef.body.removeChild(anchor);
    return { opened: true, method: "anchor" };
  }

  if (typeof windowRef.location?.assign === "function") {
    windowRef.location.assign(url);
    return { opened: true, method: "location" };
  }

  return { opened: false, method: "unavailable" };
}
