// main.js — 時計ウィンドウ（透過・枠なし・最前面）
import {
  loadConfig, commitConfig, onConfigChanged, loadAssets, skinDb,
  createSounds, playSE, invoke, ROMAN_NUMS,
} from './common.js';

const T = window.__TAURI__;
const appWindow = T.window.getCurrentWindow();
const LogicalSize = (T.dpi ?? T.window).LogicalSize;

// 時計の周りの余白（グロー用）。ウィンドウサイズ = clockSize + WINDOW_PAD
const WINDOW_PAD = 20;

let config = loadConfig();
let assets = null;
let sounds = {};
let activeSkinBlobUrl = null;
let lastWindowSize = 0;

// ─── 見た目の反映 ───
function renderClockNumbers() {
  const group = document.getElementById('clock-numbers');
  group.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', (50 + config.numRadius * Math.cos(angle)).toFixed(2));
    text.setAttribute('y', (50 + config.numRadius * Math.sin(angle)).toFixed(2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('class', 'clock-number-text');
    text.style.fontFamily = config.fontFamily;
    text.style.fontSize = `${config.numSize}px`;
    text.style.fill = config.numColor;
    text.textContent = config.numType === 'roman' ? ROMAN_NUMS[i - 1] : String(i);
    group.appendChild(text);
  }
}

async function applyWindowSize() {
  const size = config.clockSize + WINDOW_PAD;
  if (size === lastWindowSize) return;
  lastWindowSize = size;
  try {
    await appWindow.setSize(new LogicalSize(size, size));
  } catch (e) {
    console.error('[Clock] setSize failed:', e);
  }
}

function applyConfigToUI() {
  document.getElementById('clock-numbers').style.display = config.showNumbers ? 'block' : 'none';
  document.getElementById('digital-group').style.display = config.showDigital ? 'block' : 'none';

  const digitalTime = document.getElementById('digital-time');
  digitalTime.style.fontFamily = config.fontFamily;
  digitalTime.style.fontSize = `${config.digSize}px`;
  digitalTime.style.fill = config.digColor;
  document.getElementById('tz-label').style.fontFamily = config.fontFamily;

  renderClockNumbers();
  applyWindowSize();
}

async function loadActiveSkin() {
  const clockEl = document.getElementById('analog-clock');

  if (activeSkinBlobUrl) {
    URL.revokeObjectURL(activeSkinBlobUrl);
    activeSkinBlobUrl = null;
  }

  const defaultUrl = assets?.skins?.[0]?.url || '/clock-bg-chibi.webp';

  if (config.activeSkinId) {
    try {
      const skin = await skinDb.get(config.activeSkinId);
      if (skin?.data) {
        if (activeSkinBlobUrl) URL.revokeObjectURL(activeSkinBlobUrl);
        activeSkinBlobUrl = URL.createObjectURL(skin.data);
        clockEl.style.backgroundImage = `url("${activeSkinBlobUrl}")`;
        return;
      }
    } catch {}

    const preset = assets?.skins?.find((s) => s.id === config.activeSkinId);
    if (preset) {
      clockEl.style.backgroundImage = `url("${preset.url}")`;
      return;
    }
  }

  clockEl.style.backgroundImage = `url("${defaultUrl}")`;
}

// ─── 針（描画ループ） ───
function updateClock() {
  const now = new Date();
  const ms = config.isSmooth ? now.getMilliseconds() : 0;
  const rawSec = now.getSeconds();
  const s = rawSec + ms / 1000;
  const m = now.getMinutes();
  const h = now.getHours();

  document.getElementById('second').style.transform = `rotate(${(s / 60) * 360}deg)`;
  document.getElementById('minute').style.transform = `rotate(${(m / 60) * 360 + (s / 60) * 6}deg)`;
  document.getElementById('hour').style.transform   = `rotate(${(h / 12) * 360 + (m / 60) * 30}deg)`;

  document.getElementById('digital-time').textContent =
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rawSec).padStart(2, '0')}`;

  requestAnimationFrame(updateClock);
}

// ─── 音（rAF はウィンドウが隠れると止まるので setInterval で分離） ───
let lastTickSecond = -1;
let lastChimeHour = -1;

function startSoundTimer() {
  const now = new Date();
  lastTickSecond = now.getSeconds();
  lastChimeHour = now.getMinutes() === 0 ? now.getHours() : -1;

  setInterval(() => {
    const d = new Date();
    const s = d.getSeconds(), m = d.getMinutes(), h = d.getHours();

    if (!config.isSmooth && s !== lastTickSecond && !document.hidden) {
      playSE(config, sounds.tick);
    }
    lastTickSecond = s;

    if (m === 0 && lastChimeHour !== h) {
      playSE(config, sounds.chime);
      lastChimeHour = h;
    }
  }, 200);
}

// ─── 右クリック：ネイティブメニュー ───
let contextMenu = null;
const checks = {};

async function toggle(key) {
  config[key] = !config[key];
  applyConfigToUI();
  playSE(config, sounds.click);
  await commitConfig(config);
}

async function buildContextMenu() {
  const { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem } = T.menu;

  checks.isSmooth       = await CheckMenuItem.new({ text: 'Smooth Movement', checked: config.isSmooth,       action: () => toggle('isSmooth') });
  checks.isSoundEnabled = await CheckMenuItem.new({ text: 'Sound',           checked: config.isSoundEnabled, action: () => toggle('isSoundEnabled') });
  checks.showNumbers    = await CheckMenuItem.new({ text: 'Dial Numbers',    checked: config.showNumbers,    action: () => toggle('showNumbers') });
  checks.showDigital    = await CheckMenuItem.new({ text: 'Digital Clock',   checked: config.showDigital,    action: () => toggle('showDigital') });

  contextMenu = await Menu.new({
    items: [
      await MenuItem.new({ text: '⚙ System Config…', action: () => invoke('open_config') }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      checks.isSmooth,
      checks.isSoundEnabled,
      checks.showNumbers,
      checks.showDigital,
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ text: 'Hide (to tray)', action: () => invoke('hide_clock') }),
      await MenuItem.new({ text: '❓ Help & Guide', action: () => T.opener.openUrl('https://lain-lab.com/featured/analog-clock-guide/') }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ text: 'Quit', action: () => invoke('quit_app') }),
    ],
  });
}

async function showContextMenu() {
  if (!contextMenu) await buildContextMenu();
  for (const [key, item] of Object.entries(checks)) {
    await item.setChecked(!!config[key]);
  }
  playSE(config, sounds.click);
  await contextMenu.popup();
}

// ─── 初期化 ───
async function init() {
  assets = await loadAssets();
  sounds = createSounds(assets);

  applyConfigToUI();
  loadActiveSkin();
  updateClock();
  startSoundTimer();

  const clock = document.getElementById('clock-container');

  // 左ドラッグでウィンドウごと移動
  clock.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    appWindow.startDragging().catch((err) => console.error('[Clock] drag failed:', err));
  });

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu().catch((err) => console.error('[Clock] menu failed:', err));
  });

  // 設定ウィンドウでの変更を反映
  await onConfigChanged(() => {
    config = loadConfig();
    applyConfigToUI();
    // リセット等でIDが同じまま中身が変わることがあるので毎回読み直す
    loadActiveSkin();
  });
}

init();
