import { DB_NAME, DB_VERSION, slugId } from '../core/defaults';
import type { AssetRecord, BackupPayload, BranchSnapshot, Character } from '../types';

type StoreName = 'kv' | 'characters' | 'assets';

interface KVRecord {
  key: string;
  value: unknown;
}

class StarryDB {
  private conn: Promise<IDBDatabase> | null = null;

  open(): Promise<IDBDatabase> {
    if (this.conn) return this.conn;
    this.conn = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains('kv')) {
          database.createObjectStore('kv', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('characters')) {
          database.createObjectStore('characters', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('assets')) {
          database.createObjectStore('assets', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
    return this.conn;
  }

  private async store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open();
    return database.transaction(name, mode).objectStore(name);
  }

  private static wrap<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
    });
  }

  async kvGet<T>(key: string, fallback: T): Promise<T> {
    try {
      const store = await this.store('kv', 'readonly');
      const row = (await StarryDB.wrap(store.get(key))) as KVRecord | undefined;
      return row ? (row.value as T) : fallback;
    } catch {
      return fallback;
    }
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    const store = await this.store('kv', 'readwrite');
    await StarryDB.wrap(store.put({ key, value } satisfies KVRecord));
  }

  async listCharacters(): Promise<Character[]> {
    const store = await this.store('characters', 'readonly');
    const rows = (await StarryDB.wrap(store.getAll())) as Character[];
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getCharacter(id: string): Promise<Character | undefined> {
    const store = await this.store('characters', 'readonly');
    return (await StarryDB.wrap(store.get(id))) as Character | undefined;
  }

  async putCharacter(character: Character): Promise<void> {
    const store = await this.store('characters', 'readwrite');
    await StarryDB.wrap(store.put(character));
  }

  async deleteCharacter(id: string): Promise<void> {
    const store = await this.store('characters', 'readwrite');
    await StarryDB.wrap(store.delete(id));
  }

  async listAssets(): Promise<AssetRecord[]> {
    const store = await this.store('assets', 'readonly');
    return (await StarryDB.wrap(store.getAll())) as AssetRecord[];
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    const store = await this.store('assets', 'readonly');
    return (await StarryDB.wrap(store.get(id))) as AssetRecord | undefined;
  }

  async putAsset(blob: Blob, name: string, kind: 'image' | 'video'): Promise<AssetRecord> {
    const record: AssetRecord = {
      id: slugId('asset'),
      name,
      mime: blob.type || (kind === 'video' ? 'video/mp4' : 'image/png'),
      kind,
      blob,
      createdAt: Date.now(),
    };
    const store = await this.store('assets', 'readwrite');
    await StarryDB.wrap(store.put(record));
    return record;
  }

  async putAssetRecord(record: AssetRecord): Promise<void> {
    const store = await this.store('assets', 'readwrite');
    await StarryDB.wrap(store.put(record));
  }

  async deleteAsset(id: string): Promise<void> {
    const store = await this.store('assets', 'readwrite');
    await StarryDB.wrap(store.delete(id));
  }

  async usage(): Promise<{ usage: number; quota: number }> {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }

  /** 清空全部本机数据（不可恢复） */
  async clearAll(): Promise<void> {
    const database = await this.open();
    await Promise.all(
      (['kv', 'characters', 'assets'] as StoreName[]).map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const req = database.transaction(name, 'readwrite').objectStore(name).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }),
      ),
    );
  }
}

export const db = new StarryDB();

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** 整包备份：角色、手账、皮肤、设置、全部素材（base64 内嵌） */
export async function exportBackup(settings: unknown, api: unknown): Promise<BackupPayload> {
  const characters = await db.listCharacters();
  const assets = await db.listAssets();
  const branches: BackupPayload['branches'] = {};
  for (const character of characters) {
    const list = await db.kvGet<BranchSnapshot[]>(`branches:${character.id}`, []);
    if (Array.isArray(list) && list.length > 0) branches[character.id] = list;
  }
  const packedAssets: BackupPayload['assets'] = [];
  for (const asset of assets) {
    try {
      packedAssets.push({
        id: asset.id,
        name: asset.name,
        mime: asset.mime,
        kind: asset.kind,
        dataUrl: await blobToDataUrl(asset.blob),
      });
    } catch {
      /* 单个素材损坏时跳过，不阻断备份 */
    }
  }
  return {
    app: 'starry-theater',
    version: 1,
    exportedAt: Date.now(),
    settings: settings as BackupPayload['settings'],
    api: api as BackupPayload['api'],
    characters,
    assets: packedAssets,
    branches,
  };
}

export interface ImportResult {
  characters: number;
  assets: number;
  replaced: boolean;
}

/** 导入整包备份。replace=true 时先清空本机角色，避免同名重复。 */
export async function importBackup(payload: BackupPayload, replace: boolean): Promise<ImportResult> {
  if (!payload || payload.app !== 'starry-theater' || !Array.isArray(payload.characters)) {
    throw new Error('这不是星语剧场导出的备份文件');
  }
  if (replace) {
    const existing = await db.listCharacters();
    for (const c of existing) await db.deleteCharacter(c.id);
  }
  let assets = 0;
  for (const a of payload.assets ?? []) {
    try {
      const blob = await dataUrlToBlob(a.dataUrl);
      await db.putAssetRecord({
        id: a.id,
        name: a.name,
        mime: a.mime,
        kind: a.kind,
        blob,
        createdAt: Date.now(),
      });
      assets += 1;
    } catch {
      /* 单个素材失败不阻断 */
    }
  }
  let characters = 0;
  for (const c of payload.characters) {
    await db.putCharacter({ ...c, updatedAt: Date.now() });
    characters += 1;
  }
  for (const [characterId, list] of Object.entries(payload.branches ?? {})) {
    if (Array.isArray(list)) await db.kvSet(`branches:${characterId}`, list);
  }
  return { characters, assets, replaced: replace };
}
