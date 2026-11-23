import test from "node:test";
import assert from "node:assert/strict";
import {
  clearGuestConfigurationDraft,
  clearConfigurationHandoff,
  CONFIGURATION_HANDOFF_KEY,
  GUEST_CONFIGURATION_DRAFT_KEY,
  hasGuestConfigurationDraft,
  readGuestConfigurationDraft,
  readConfigurationHandoff,
  writeGuestConfigurationDraft,
  writeConfigurationHandoff,
} from "../src/lib/configuration-handoff.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const draft = {
  version: 1,
  title: "Mój zestaw",
  components: [{
    id: "own-part-id",
    category: "memory",
    source: "own",
    name: "Mam własną część",
    socket: "",
    memoryType: "",
    note: "",
    price: null,
  }],
  updatedAt: "2026-11-23T12:00:00.000Z",
};

test("stores and restores one pending draft from the provided session storage", () => {
  const storage = new MemoryStorage();

  assert.equal(writeConfigurationHandoff(storage, draft), true);
  assert.deepEqual(readConfigurationHandoff(storage)?.draft, { ...draft, description: "" });
  assert.equal(storage.values.size, 1);

  const describedDraft = { ...draft, description: "Komputer do pracy i gier" };
  assert.equal(writeConfigurationHandoff(storage, describedDraft), true);
  assert.deepEqual(readConfigurationHandoff(storage)?.draft, describedDraft);

  clearConfigurationHandoff(storage);
  assert.equal(readConfigurationHandoff(storage), null);
});

test("ignores malformed and expired drafts", () => {
  const storage = new MemoryStorage();
  storage.setItem(CONFIGURATION_HANDOFF_KEY, "not json");
  assert.equal(readConfigurationHandoff(storage), null);

  const originalNow = Date.now;
  Date.now = () => originalNow() + 31 * 60 * 1000;
  try {
    assert.equal(writeConfigurationHandoff(storage, draft), true);
    const saved = JSON.parse(storage.getItem(CONFIGURATION_HANDOFF_KEY));
    saved.savedAt -= 31 * 60 * 1000;
    storage.setItem(CONFIGURATION_HANDOFF_KEY, JSON.stringify(saved));
    assert.equal(readConfigurationHandoff(storage), null);
  } finally {
    Date.now = originalNow;
  }
});

test("keeps one replaceable guest draft and preserves a newer cross-tab write", () => {
  const storage = new MemoryStorage();
  const first = { ...draft, title: "Pierwszy zestaw", description: "pierwszy" };
  const newer = { ...draft, title: "Nowszy zestaw", description: "nowszy opis" };

  assert.equal(writeGuestConfigurationDraft(storage, first), true);
  const firstSlot = readGuestConfigurationDraft(storage);
  assert.equal(firstSlot?.draft.title, first.title);
  assert.equal(firstSlot?.draft.description, first.description);

  assert.equal(writeGuestConfigurationDraft(storage, newer), true);
  assert.equal(storage.values.size, 1);
  assert.equal(storage.getItem(GUEST_CONFIGURATION_DRAFT_KEY) !== null, true);
  assert.equal(clearGuestConfigurationDraft(storage, firstSlot.raw), false);
  assert.equal(hasGuestConfigurationDraft(storage), true);
  assert.equal(readGuestConfigurationDraft(storage)?.draft.description, newer.description);

  const latest = readGuestConfigurationDraft(storage);
  assert.equal(clearGuestConfigurationDraft(storage, latest.raw), true);
  assert.equal(hasGuestConfigurationDraft(storage), false);
});
