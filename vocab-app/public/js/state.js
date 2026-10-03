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
