// settings.js — 設定ウィンドウ（Web版のモーダルを独立ウィンドウ化したもの）
import {
  DEFAULT_CONFIG, PRESET_KEY, CLOCK_KEYS,
  loadConfig, commitConfig, onConfigChanged, loadAssets, skinDb,
  createSounds, playSE, invoke,
} from './common.js';

let config = loadConfig();
let assets = null;
let sounds = {};
let galleryBlobUrls = [];

const $ = (id) => document.getElementById(id);

// ─── ステータス表示（alert の代わり） ───
let statusTimer = null;
function status(msg, isError = false) {
  const el = $('status-line');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

// ─── フォームの同期 ───
function syncForm() {
  const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  setVal('cfg-clock-size', config.clockSize);  setTxt('val-clock-size', config.clockSize);
  setVal('cfg-num-type', config.numType);
  setVal('cfg-num-radius', config.numRadius);  setTxt('val-num-radius', config.numRadius);
  setVal('cfg-num-size', config.numSize);      setTxt('val-num-size', config.numSize);
  setVal('cfg-dig-size', config.digSize);      setTxt('val-dig-size', config.digSize);
  setVal('cfg-font-family', config.fontFamily);
  setVal('cfg-num-color', config.numColor);
  setVal('cfg-dig-color', config.digColor);
}

function bindInput(id, key, isNum = false) {
  const el = $(id);
  el.oninput = () => {
    config[key] = isNum ? parseFloat(el.value) : el.value;
    syncForm();
    commitConfig(config);
  };
}

// 設定を丸ごと差し替えた時（プリセット・インポート・リセット）
async function replaceConfig(next) {
  config = { ...DEFAULT_CONFIG, ...next };
  syncForm();
  await commitConfig(config);
  renderSkinGallery();
}

// ─── スキンギャラリー ───
async function selectSkin(id) {
  config.activeSkinId = id;
  await commitConfig(config);
  playSE(config, sounds.click);
  renderSkinGallery();
}

async function renderSkinGallery() {
  const gallery = $('skin-gallery');
  gallery.innerHTML = '';
  galleryBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  galleryBlobUrls = [];

  for (const preset of assets?.skins ?? []) {
    const card = document.createElement('div');
    const isActive = config.activeSkinId === preset.id || (!config.activeSkinId && preset.id === assets.defaultSkinId);
    card.className = `skin-card ${isActive ? 'active' : ''}`;
    card.innerHTML = `<img src="${preset.url}" /><span class="skin-name">${preset.name}</span>`;
    card.onclick = () => selectSkin(preset.id);
    gallery.appendChild(card);
  }

  let skins = [];
  try { skins = await skinDb.toArray(); } catch (e) { console.warn('[Clock] skin db:', e); }

  for (const skin of skins) {
    const card = document.createElement('div');
    card.className = `skin-card ${config.activeSkinId === skin.id ? 'active' : ''}`;
    const blobUrl = URL.createObjectURL(skin.data);
    galleryBlobUrls.push(blobUrl);
    card.innerHTML = `
      <img src="${blobUrl}" />
      <span class="skin-name">${skin.id.slice(0, 8)}</span>
      <button class="skin-del-btn">✕</button>
    `;
    card.onclick = () => selectSkin(skin.id);
    card.querySelector('.skin-del-btn').onclick = async (e) => {
      e.stopPropagation();
      await skinDb.delete(skin.id);
      if (config.activeSkinId === skin.id) config.activeSkinId = null;
      await commitConfig(config);
      renderSkinGallery();
    };
    gallery.appendChild(card);
  }
}

// ─── 初期化 ───
async function init() {
  assets = await loadAssets();
  sounds = createSounds(assets);
  syncForm();

  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab)?.classList.add('active');
      playSE(config, sounds.click);
    };
  });

  bindInput('cfg-clock-size', 'clockSize', true);
  bindInput('cfg-num-type', 'numType');
  bindInput('cfg-num-radius', 'numRadius', true);
  bindInput('cfg-num-size', 'numSize', true);
  bindInput('cfg-dig-size', 'digSize', true);
  bindInput('cfg-font-family', 'fontFamily');
  bindInput('cfg-num-color', 'numColor');
  bindInput('cfg-dig-color', 'digColor');

  // プリセット
  [1, 2, 3].forEach((slot) => {
    $(`btn-save-${slot}`).onclick = () => {
      localStorage.setItem(PRESET_KEY(slot), JSON.stringify(config));
      status(`Saved to Preset ${slot}.`);
    };
    $(`btn-load-${slot}`).onclick = async () => {
      const data = localStorage.getItem(PRESET_KEY(slot));
      if (!data) return status(`Preset ${slot} is empty.`, true);
      await replaceConfig(JSON.parse(data));
      status(`Loaded Preset ${slot}.`);
    };
  });

  // エクスポート：ダウンロードフォルダへ保存（Rust側）
  $('btn-export-json').onclick = async () => {
    try {
      const path = await invoke('export_config', { contents: JSON.stringify(config, null, 2) });
      status(`Exported: ${path}`);
    } catch (e) {
      status(`Export failed: ${e}`, true);
    }
  };

  // インポート
  const jsonInput = $('cfg-json-file');
  $('btn-import-trigger').onclick = () => jsonInput.click();
  jsonInput.onchange = async () => {
    const file = jsonInput.files?.[0];
    jsonInput.value = '';
    if (!file) return;
    try {
      await replaceConfig(JSON.parse(await file.text()));
      status('Config imported.');
    } catch {
      status('Failed to parse JSON file.', true);
    }
  };

  // リセット：confirm の代わりに2回押し
  const resetBtn = $('btn-all-reset');
  let resetArmed = false, resetTimer = null;
  resetBtn.onclick = async () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'CLICK AGAIN TO CONFIRM';
      resetTimer = setTimeout(() => {
        resetArmed = false;
        resetBtn.textContent = 'RESET ALL DATA & SKINS';
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    resetBtn.textContent = 'RESET ALL DATA & SKINS';

    CLOCK_KEYS.forEach((k) => localStorage.removeItem(k));
    try { await skinDb.clear(); } catch {}
    await replaceConfig({});
    status('All data reset.');
  };

  // スキン追加
  const skinInput = $('skin-file-input');
  $('btn-add-skin').onclick = () => skinInput.click();
  skinInput.onchange = async () => {
    const file = skinInput.files?.[0];
    skinInput.value = '';
    if (!file) return;
    try {
      // File のまま入れると WebKit 系で読めない場合があるので Blob に詰め直す
      const data = new Blob([await file.arrayBuffer()], { type: file.type || 'image/png' });
      const id = `skin_${Date.now()}`;
      await skinDb.put({ id, data, version: String(Date.now()) });
      await selectSkin(id);
      status('Skin added.');
    } catch (e) {
      status(`Failed to add skin: ${e}`, true);
    }
  };

  // 時計側の右クリックメニューで変わった設定を反映
  await onConfigChanged(() => {
    config = loadConfig();
    syncForm();
  });

  renderSkinGallery();
}

init();
