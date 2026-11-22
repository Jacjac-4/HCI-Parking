// Drafts are optional: blocked browser storage must not prevent an application.
export function createDraftStorage(getStorage) {
  const fallback = new Map();
  let available = true;
  return {
    getItem(key) {
      try {
        if (available) {
          const value = getStorage().getItem(key);
          if (value !== null) fallback.set(key, value);
          return value;
        }
      } catch { available = false; }
      return fallback.get(key) ?? null;
    },
    setItem(key, value) {
      fallback.set(key, value);
      try { if (available) getStorage().setItem(key, value); } catch { available = false; }
    },
    removeItem(key) {
      fallback.delete(key);
      try { if (available) getStorage().removeItem(key); } catch { available = false; }
    },
  };
}

export function readPermitDraft(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    if (!value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null;
    if (!value.vehicle || typeof value.vehicle !== 'object' || Array.isArray(value.vehicle)) return null;
    return value;
  } catch { return null; }
}
