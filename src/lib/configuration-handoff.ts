import { parseConfigurationDraft, type ConfigurationDraft } from "./drafts.ts";

export const CONFIGURATION_HANDOFF_KEY = "pcmaker:configuration-handoff:v1";
export const GUEST_CONFIGURATION_DRAFT_KEY = "pcmaker:guest-configuration-draft:v1";
const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

export interface ConfigurationHandoff {
  draft: ConfigurationDraft;
  savedAt: number;
}

export interface GuestConfigurationDraft {
  draft: ConfigurationDraft;
  savedAt: number;
  raw: string;
}

export function writeConfigurationHandoff(storage: Storage, draft: ConfigurationDraft): boolean {
  try {
    storage.setItem(CONFIGURATION_HANDOFF_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), draft }));
    return true;
  } catch {
    return false;
  }
}

export function readConfigurationHandoff(storage: Storage): ConfigurationHandoff | null {
  try {
    const raw = storage.getItem(CONFIGURATION_HANDOFF_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || typeof value.savedAt !== "number" || Date.now() - value.savedAt > HANDOFF_MAX_AGE_MS || value.savedAt > Date.now()) return null;

    const draft = parseConfigurationDraft(JSON.stringify(value.draft));
    return draft ? { draft, savedAt: value.savedAt } : null;
  } catch {
    return null;
  }
}

export function clearConfigurationHandoff(storage: Storage): void {
  try {
    storage.removeItem(CONFIGURATION_HANDOFF_KEY);
  } catch {
    // Keep storage failures from breaking the configurator.
  }
}

export function writeGuestConfigurationDraft(storage: Storage, draft: ConfigurationDraft): boolean {
  try {
    const savedAt = Date.now();
    const raw = JSON.stringify({ version: 1, savedAt, draft });
    storage.setItem(GUEST_CONFIGURATION_DRAFT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function readGuestConfigurationDraft(storage: Storage): GuestConfigurationDraft | null {
  try {
    const raw = storage.getItem(GUEST_CONFIGURATION_DRAFT_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || typeof value.savedAt !== "number" || value.savedAt > Date.now()) return null;

    const draft = parseConfigurationDraft(JSON.stringify(value.draft));
    return draft ? { draft, savedAt: value.savedAt, raw } : null;
  } catch {
    return null;
  }
}

export function hasGuestConfigurationDraft(storage: Storage): boolean {
  return readGuestConfigurationDraft(storage) !== null;
}

export function clearGuestConfigurationDraft(storage: Storage, expectedRaw: string): boolean {
  try {
    if (storage.getItem(GUEST_CONFIGURATION_DRAFT_KEY) !== expectedRaw) return false;
    storage.removeItem(GUEST_CONFIGURATION_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
