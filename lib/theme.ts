/**
 * Theme state used to live here. Orbit is light-only now: there is no toggle,
 * no stored preference and no system-preference branch, so nothing remains to
 * read or write. The key below exists solely so a browser that stored a choice
 * under the old build gets it cleared on next load.
 */
export const LEGACY_THEME_STORAGE_KEY = "orbit-theme";

/** Collapse state is view state, not data. localStorage is the right home. */
export function collapseStorageKey(projectId: string) {
  return `orbit-collapsed:${projectId}`;
}

export const LAST_PROJECT_KEY = "orbit-last-project";
