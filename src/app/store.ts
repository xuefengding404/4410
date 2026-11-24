import { DEFAULT_API, DEFAULT_SETTINGS, OLD_BUILTIN_SPRITE_NAMES, createElla, deepMerge, makeBuiltinSprites, normalizeSkin } from '../core/defaults';
import { db } from '../storage/db';
import type { ApiConfig, AppSettings, Character, MemoryEntry, SkinConfig } from '../types';

type StoreEvent = 'character' | 'characters' | 'settings' | 'api' | 'memory' | 'switch';

class Store {
  characters: Character[] = [];
  currentId = '';
  settings: AppSettings = structuredClone(DEFAULT_SETTINGS);
  api: ApiConfig = structuredClone(DEFAULT_API);
  private listeners = new Map<StoreEvent, Set<() => void>>();
  private saveTimers = new Map<string, number>();

  get character(): Character {
    const found = this.characters.find((c) => c.id === this.currentId);
    return found ?? this.characters[0];
  }

  on(event: StoreEvent, cb: () => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  emit(event: StoreEvent): void {
    for (const cb of this.listeners.get(event) ?? []) cb();
  }

  async init(): Promise<void> {
    const [savedSettings, savedApi, savedSkin, characters, savedId] = await Promise.all([
      db.kvGet<unknown>('settings', null),
      db.kvGet<unknown>('api', null),
      db.kvGet<unknown>('skin', null),
      db.listCharacters(),
      db.kvGet<string>('currentCharacterId', ''),
    ]);
    this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), savedSettings);
    this.settings.skin = normalizeSkin(savedSkin ?? this.settings.skin);
    this.api = deepMerge(structuredClone(DEFAULT_API), savedApi);
    this.characters = characters;
    if (this.characters.length === 0) {
      const ella = createElla();
      this.characters = [ella];
      await db.putCharacter(ella);
    }
    this.currentId = this.characters.find((c) => c.id === savedId)?.id ?? this.characters[0].id;
    await this.migrateBuiltinCharacters();
    await this.migrateBuiltinCharacters();
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => undefined);
    }
  }

  private async migrateBuiltinCharacters(): Promise<void> {
    for (const character of this.characters) {
      let changed = false;
      const untouchedSprites =
        character.cardSource === 'builtin' &&
        character.sprites.length > 0 &&
        character.sprites.every((s) => !s.assetId && OLD_BUILTIN_SPRITE_NAMES.includes(s.name));
      if (untouchedSprites) {
        character.sprites = makeBuiltinSprites();
        if (!character.sprites.some((s) => s.id === character.currentSpriteId)) {
          character.currentSpriteId = character.sprites[0].id;
        }
        changed = true;
      }
      for (const scene of character.scenes) {
        if (scene.name === '雨夜咖啡馆' && !scene.assetId && !scene.builtinPath) {
          scene.builtinPath = 'assets/bg/rain-cafe.jpg';
          scene.brightness = 0.95;
          changed = true;
        }
      }
      if (changed) {
        character.updatedAt = Date.now();
        await db.putCharacter(character);
      }
    }
  }

  async selectCharacter(id: string): Promise<void> {
    if (!this.characters.some((c) => c.id === id)) return;
    this.currentId = id;
    await db.kvSet('currentCharacterId', id);
    this.emit('character');
    this.emit('characters');
    this.emit('switch');
  }

  async addCharacter(character: Character): Promise<void> {
    this.characters.push(character);
    await db.putCharacter(character);
    this.emit('characters');
    await this.selectCharacter(character.id);
  }

  async removeCharacter(id: string): Promise<void> {
    this.characters = this.characters.filter((c) => c.id !== id);
    await db.deleteCharacter(id);
    await db.kvSet(`branches:${id}`, []);
    if (this.characters.length === 0) {
      const ella = createElla();
      this.characters = [ella];
      await db.putCharacter(ella);
    }
    if (!this.characters.some((c) => c.id === this.currentId)) {
      this.currentId = this.characters[0].id;
    }
    await db.kvSet('currentCharacterId', this.currentId);
    this.emit('characters');
    this.emit('character');
    this.emit('switch');
  }

  /** 修改当前角色并防抖落盘 */
  updateCharacter(mutator: (character: Character) => void): void {
    const character = this.character;
    if (!character) return;
    mutator(character);
    character.updatedAt = Date.now();
    this.scheduleCharacterSave(character.id);
    this.emit('character');
  }

  scheduleCharacterSave(id: string): void {
    const previous = this.saveTimers.get(id);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(id);
      const character = this.characters.find((c) => c.id === id);
      if (character) void db.putCharacter(character);
    }, 320);
    this.saveTimers.set(id, timer);
  }

  async saveCharacterNow(): Promise<void> {
    const character = this.character;
    if (!character) return;
    const timer = this.saveTimers.get(character.id);
    if (timer) window.clearTimeout(timer);
    this.saveTimers.delete(character.id);
    await db.putCharacter(character);
  }

  async saveSettings(): Promise<void> {
    await db.kvSet('settings', this.settings);
    await db.kvSet('skin', this.settings.skin);
    this.emit('settings');
  }

  async saveApi(): Promise<void> {
    await db.kvSet('api', this.api);
    this.emit('api');
  }

  async applySkin(skin: SkinConfig): Promise<void> {
    this.settings.skin = normalizeSkin(skin);
    await this.saveSettings();
  }

  addMemory(text: string, options: Partial<MemoryEntry> = {}): MemoryEntry {
    const clean = text.trim().slice(0, 160);
    const duplicate = this.character.memories.find((m) => m.text === clean);
    if (duplicate) return duplicate;
    const memory: MemoryEntry = {
      id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      pinned: options.pinned ?? false,
      kind: options.kind ?? 'fact',
      createdAt: Date.now(),
      source: options.source ?? 'manual',
    };
    this.updateCharacter((c) => {
      c.memories.unshift(memory);
      if (c.memories.length > 300) c.memories.length = 300;
    });
    this.emit('memory');
    return memory;
  }

  addBond(amount: number): { levelUp: boolean } {
    const character = this.character;
    if (!character) return { levelUp: false };
    const before = bondLevelOf(character.bondXp);
    character.bondXp += amount;
    this.scheduleCharacterSave(character.id);
    this.emit('character');
    return { levelUp: bondLevelOf(character.bondXp) > before };
  }
}

function bondLevelOf(xp: number): number {
  if (xp >= 1400) return 6;
  if (xp >= 800) return 5;
  if (xp >= 460) return 4;
  if (xp >= 220) return 3;
  if (xp >= 80) return 2;
  return 1;
}

export const store = new Store();
