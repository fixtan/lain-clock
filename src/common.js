// common.js — 時計ウィンドウと設定ウィンドウで共有するロジック
// Web版 (AnalogClock.astro) と同じ設定フォーマット・キー名を使う

export const DEFAULT_CONFIG = {
  clockSize: 180,
  numType: 'arabic',
  numRadius: 35,
  numSize: 5,
  digSize: 5.5,
  fontFamily: 'monospace',
  numColor: '#00e5ff',
  digColor: '#00e5ff',
  showNumbers: true,
  showDigital: true,
  isSmooth: false,
  isSoundEnabled: false,
  activeSkinId: null,
};

export const CONFIG_KEY = 'clock_master_config';
export const PRESET_KEY = (slot) => `clock_preset_${slot}`;
export const CLOCK_KEYS = [CONFIG_KEY, PRESET_KEY(1), PRESET_KEY(2), PRESET_KEY(3)];

// ウィンドウ間で設定変更を知らせるイベント名
export const EVT_CONFIG_CHANGED = 'clock-config-changed';

export const ROMAN_NUMS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'];

// ─── 設定の読み書き ───
export function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };

    // v0.1 からの移行（サイズだけ引き継ぐ）
    const oldSize = parseInt(localStorage.getItem('clock-size') ?? '', 10);
    if (!Number.isNaN(oldSize)) return { ...DEFAULT_CONFIG, clockSize: oldSize };
  } catch (e) {
    console.warn('[Clock] Stored config load failed:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[Clock] Config save failed:', e);
  }
}

// 保存して、もう一方のウィンドウに通知する
export async function commitConfig(config) {
  saveConfig(config);
  try {
    await window.__TAURI__.event.emit(EVT_CONFIG_CHANGED);
  } catch (e) {
    console.warn('[Clock] emit failed:', e);
  }
}

export function onConfigChanged(fn) {
  return window.__TAURI__.event.listen(EVT_CONFIG_CHANGED, fn);
}

// ─── アセット（スキン一覧・効果音） ───
const FALLBACK_ASSETS = {
  defaultSkinId: 'chibi',
  skins: [{ id: 'chibi', name: 'Chibi', url: '/clock-bg-chibi.webp' }],
  sounds: { click: '/assets/se/click.mp3', tick: '/assets/se/tick.mp3', chime: '/assets/se/chime.mp3' },
};

export async function loadAssets() {
  try {
    const res = await fetch('/assets/clockSkins/list.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[Clock] list.json not found, using fallback:', e);
    return FALLBACK_ASSETS;
  }
}

// ─── スキン保存用 IndexedDB（Dexie なしの素の実装） ───
const DB_NAME = 'lain-clock';
const STORE = 'clockSkins';
let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  dbPromise ??= openDb();
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const skinDb = {
  get:     (id)  => withStore('readonly',  (s) => s.get(id)),
  put:     (rec) => withStore('readwrite', (s) => s.put(rec)),
  delete:  (id)  => withStore('readwrite', (s) => s.delete(id)),
  toArray: ()    => withStore('readonly',  (s) => s.getAll()),
  clear:   ()    => withStore('readwrite', (s) => s.clear()),
};

// ─── 効果音 ───
export function createSounds(assets) {
  const mk = (url) => { const a = new Audio(url); a.preload = 'auto'; return a; };
  return {
    click: mk(assets.sounds.click),
    tick:  mk(assets.sounds.tick),
    chime: mk(assets.sounds.chime),
  };
}

export function playSE(config, audio) {
  if (!config.isSoundEnabled || !audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ─── Rust 側コマンド ───
export const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
