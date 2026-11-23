import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIGURATION_STORAGE_KEY,
  MAX_CONFIGURATION_DESCRIPTION_LENGTH,
  parseConfigurationDraft,
} from "../src/lib/drafts.ts";
import {
  configurationContentKey,
  configurationSnapshot,
  parseSavedConfigurationLibrary,
  parseWorkingConfiguration,
  saveConfigurationToLibrary,
  SAVED_CONFIGURATION_LIBRARY_KEY,
  WORKING_CONFIGURATION_KEY,
} from "../src/lib/saved-configurations.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

const timestamp = "2026-11-23T12:00:00.000Z";
const draft = {
  version: 1,
  title: "Zestaw na później",
  components: [{
    id: "gpu-own",
    category: "gpu",
    source: "own",
    name: "Mam własną część",
    socket: "",
    memoryType: "",
    note: "",
    price: null,
  }],
  updatedAt: timestamp,
};

test("reads previously saved library and draft storage without mutating it", () => {
  const storage = new MemoryStorage();
  const savedLibrary = {
    version: 1,
    configurations: [{
      id: "old-saved-id",
      version: 1,
      title: draft.title,
      components: draft.components,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    updatedAt: timestamp,
  };
  storage.setItem(SAVED_CONFIGURATION_LIBRARY_KEY, JSON.stringify(savedLibrary));
  storage.setItem(CONFIGURATION_STORAGE_KEY, JSON.stringify(draft));

  assert.equal(parseSavedConfigurationLibrary(storage.getItem(SAVED_CONFIGURATION_LIBRARY_KEY)).status, "valid");
  assert.equal(parseConfigurationDraft(storage.getItem(CONFIGURATION_STORAGE_KEY))?.title, draft.title);
  assert.equal(storage.values.size, 2);
});

test("reads the previous working-draft format for explicit recovery", () => {
  const storage = new MemoryStorage();
  storage.setItem(WORKING_CONFIGURATION_KEY, JSON.stringify({
    version: 1,
    draft,
    activeSavedId: null,
    baseline: { title: "Mój zestaw", components: [] },
  }));

  const working = parseWorkingConfiguration(storage.getItem(WORKING_CONFIGURATION_KEY));
  assert.equal(working.status, "valid");
  if (working.status === "valid") assert.equal(working.value.draft.title, draft.title);
  assert.equal(storage.values.size, 1);
});

test("preserves optional descriptions while keeping older drafts valid", () => {
  assert.equal(MAX_CONFIGURATION_DESCRIPTION_LENGTH, 300);
  assert.equal(parseConfigurationDraft(JSON.stringify(draft))?.description, "");

  const describedDraft = { ...draft, description: "Komputer do pracy i gier" };
  assert.equal(parseConfigurationDraft(JSON.stringify(describedDraft))?.description, describedDraft.description);
  assert.equal(parseConfigurationDraft(JSON.stringify({
    ...draft,
    description: "x".repeat(MAX_CONFIGURATION_DESCRIPTION_LENGTH + 1),
  })), null);

  const oldConfiguration = {
    id: "old-saved-id",
    version: 1,
    title: draft.title,
    components: draft.components,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const parsedOld = parseSavedConfigurationLibrary(JSON.stringify({
    version: 1,
    configurations: [oldConfiguration],
    updatedAt: timestamp,
  }));
  assert.equal(parsedOld.status, "valid");
  if (parsedOld.status === "valid") assert.equal(parsedOld.value.configurations[0].description, "");

  const parsedDescribed = parseSavedConfigurationLibrary(JSON.stringify({
    version: 1,
    configurations: [{ ...oldConfiguration, description: describedDraft.description }],
    updatedAt: timestamp,
  }));
  assert.equal(parsedDescribed.status, "valid");
  if (parsedDescribed.status === "valid") {
    const saved = parsedDescribed.value.configurations[0];
    assert.equal(saved.description, describedDraft.description);
    assert.notEqual(
      configurationContentKey(configurationSnapshot({ ...draft, description: "Opis pierwszy" })),
      configurationContentKey(configurationSnapshot({ ...draft, description: "Opis drugi" })),
    );
  }

  const storage = new MemoryStorage();
  const localSave = saveConfigurationToLibrary(storage, describedDraft, "copy", null);
  assert.equal(localSave.ok, true);
  if (localSave.ok) assert.equal(localSave.saved.description, describedDraft.description);
});
