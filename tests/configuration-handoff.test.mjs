import test from "node:test";
import assert from "node:assert/strict";
import {
  clearConfigurationHandoff,
  CONFIGURATION_HANDOFF_KEY,
  readConfigurationHandoff,
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
