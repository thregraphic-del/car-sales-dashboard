// Small shared state loaded once at startup (config, user, groups).
import { api } from './api.js';

export const state = { config: null, user: null, stats: null, groups: [] };

export async function loadGroups() {
  try {
    state.groups = await api.groups();
  } catch {
    /* keep previous */
  }
  return state.groups;
}

export const groupName = (id) => state.groups.find((g) => g.id === id)?.name;

/** 📚 «وضع القواعد» of the site: OFF unless the learner switches it on in the settings. Off = the rules are hidden everywhere (a beginner is not distracted). */
export const grammarOn = () => { try { return localStorage.getItem('app.grammar') === '1'; } catch { return false; } };
export function applyGrammarMode() {
  document.documentElement.dataset.grammar = grammarOn() ? 'on' : 'off';
}
