type SkillsFilterState = {
  skills: string[];
};

const STORAGE_KEY = 'skillsFilter.selected';
let state: SkillsFilterState = {
  skills: [],
};

let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readFromStorage(): SkillsFilterState {
  if (typeof window === 'undefined') return { skills: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { skills: [] };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { skills: parsed.filter((item) => typeof item === 'string') };
    }
    if (parsed && Array.isArray(parsed.skills)) {
      return { skills: parsed.skills.filter((item: unknown) => typeof item === 'string') };
    }
  } catch {
    // ignore parse errors
  }
  return { skills: [] };
}

function writeToStorage(next: SkillsFilterState) {
  if (typeof window === 'undefined') return;
  try {
    if (!next.skills.length) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.skills));
    }
  } catch {
    // ignore storage failures
  }
}

function setState(next: SkillsFilterState) {
  state = next;
  writeToStorage(state);
  notify();
}

export function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  state = readFromStorage();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): SkillsFilterState {
  return state;
}

export function setSkills(skills: string[]) {
  const cleaned = Array.from(new Set(skills.map((skill) => skill.trim()).filter(Boolean)));
  setState({ skills: cleaned });
}

export function clearSkills() {
  setState({ skills: [] });
}

