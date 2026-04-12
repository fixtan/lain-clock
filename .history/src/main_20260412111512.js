
  const { appWindow } = window.__TAURI__.window;

  // 右クリックメニューの「終了」アクションに追加
  document.querySelector('[data-action="hide"]').addEventListener('click', async () => {
    await appWindow.close(); // これでアプリが終了します
  });

  // リスナーを外せるように関数を外に出しておく
  const onMouseMove = (e) => {
    doDrag(e);
    doTabDrag(e);
  };
  const onMouseUp = () => {
    endDrag();
    endTabDrag();
  };

  // 初期化関数
  function initEvents() {
    // 二重登録を防ぐために一度消す
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);

    // 改めて登録
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
  }

  // 実行
  initEvents();

  // -------------------------------------------------------
  // 針アニメーション
  // -------------------------------------------------------
  function updateClock() {
    // 1. まず要素を取得して変数に入れる
    const secondEl = document.getElementById('second');
    const minuteEl = document.getElementById('minute');
    const hourEl   = document.getElementById('hour');

    // 2. 全ての要素が存在するかチェック（一つでも欠けていたら即終了）
    if (!secondEl || !minuteEl || !hourEl) {
      return;
    }

    // 3. 存在が確定したのでスタイルを適用
    const now = new Date();
    const s = now.getSeconds();
    const m = now.getMinutes();
    const h = now.getHours();

    secondEl.style.transform = `rotate(${(s / 60) * 360}deg)`;
    minuteEl.style.transform = `rotate(${(m / 60) * 360 + (s / 60) * 6}deg)`;
    hourEl.style.transform   = `rotate(${(h / 12) * 360 + (m / 60) * 30}deg)`;

    // 4. 次のフレームを予約
    requestAnimationFrame(updateClock);
  }
  updateClock();

  // -------------------------------------------------------
  // 要素取得
  // -------------------------------------------------------

  const clock = document.getElementById('clock-container');
  const menu  = document.getElementById('clock-context-menu');
  const tab   = document.getElementById('clock-tab');

  // -------------------------------------------------------
  // HIDE：時計フェードアウト → タブ出現
  // -------------------------------------------------------
  function hideClock() {
    clock.style.transition = 'opacity 0.45s ease, width 0.3s ease, height 0.3s ease, transform 0.3s ease';
    clock.style.opacity = '0';
    clock.style.pointerEvents = 'none';

    setTimeout(() => {
      clock.style.display = 'none';

      // タブを右端外から現れるようにリセット
      tab.style.transition = 'none';
      tab.style.opacity    = '0';
      tab.style.transform  = 'translateX(100%)';
      tab.classList.remove('hidden');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tab.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease';
          tab.style.transform  = 'translateX(0)';
          tab.style.opacity    = '1';
        });
      });
    }, 450);
  }

  // -------------------------------------------------------
  // SHOW：タブフェードアウト → 時計フェードイン
  // -------------------------------------------------------
  function showClock() {
    tab.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    tab.style.transform  = 'translateX(100%)';
    tab.style.opacity    = '0';

    setTimeout(() => {
      tab.classList.add('hidden');

      clock.style.display       = 'block';
      clock.style.opacity       = '0';
      clock.style.pointerEvents = 'auto';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clock.style.transition = 'opacity 0.45s ease, width 0.3s ease, height 0.3s ease, transform 0.3s ease';
          clock.style.opacity    = '1';
        });
      });
    }, 250);
  }

  // -------------------------------------------------------
  // 右クリックメニュー
  // -------------------------------------------------------
  function showMenu(x, y) {
    updateSliderRange(); // 画面回転やリサイズに対応
    const menuWidth  = 160;
    const menuHeight = 170;
    if (x + menuWidth  > window.innerWidth)  x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;
    menu.classList.remove('hidden');
  }

  clock.oncontextmenu = (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY); };

  // スマホ長押し
  let touchTimer;
  clock.addEventListener('touchstart', (e) => {
    touchTimer = setTimeout(() => { const t = e.touches[0]; showMenu(t.clientX, t.clientY); }, 600);
  });
  clock.addEventListener('touchend',  () => clearTimeout(touchTimer));
  clock.addEventListener('touchmove', () => clearTimeout(touchTimer));

  window.addEventListener('click', () => menu.classList.add('hidden'));

  // スライダー（サイズ変更）
  const sizeSlider = document.getElementById('size-slider');
  const sizeValue  = document.getElementById('size-value');

  function updateSliderRange() {
    // 画面の短い方の 90% を最大値にする
    const maxSafeSize = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9);
    sizeSlider.max = maxSafeSize.toString();
  }
  // -------------------------------------------------------
  // メニュー項目の処理
  // -------------------------------------------------------
  function applySize(size) {
    let dim;

    // 数値（スライダー）か文字列（初期化用など）かを判別
    const numSize = typeof size === 'string' ? parseInt(size) : size;
    dim = `${numSize}px`;

    // 表示上の数値を更新
    sizeValue.textContent = numSize.toString();
    sizeSlider.value = numSize.toString();

    // 時計のスタイル更新
    clock.style.width = dim;
    clock.style.height = dim;

    // 中央配置(Full相当)になっていた場合の解除処理などは既存のロジックを流用
    if (numSize > 400) { // 例えば一定以上で中央付近に寄せるなどの処理も可能
       // 必要に応じて
    }
  }
  // スライダーを動かした時の処理
  sizeSlider.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    applySize(parseInt(val));
    localStorage.setItem('clock-size', val);
  });


  function applyTheme(theme) {
    const color = theme === 'wired' ? '#00ff88' : '#00e5ff';
    clock.style.setProperty('--copland-blue', color);
    menu.style.setProperty('--copland-blue', color);
    tab.style.setProperty('--copland-blue', color);
  }

  menu.querySelectorAll('li').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.getAttribute('data-action') ?? '';
      if (action === 'hide') {
        menu.classList.add('hidden');
        hideClock();
        return;
      }
      if (action.startsWith('resize-')) {
        applySize(action.replace('resize-', ''));
        localStorage.setItem('clock-size', action.replace('resize-', ''));
      }
      if (action.startsWith('theme-')) {
        applyTheme(action.replace('theme-', ''));
        localStorage.setItem('clock-theme', action.replace('theme-', ''));
      }
      menu.classList.add('hidden');
    });
  });

  // --- 初期設定 ---
  const savedSize = localStorage.getItem('clock-size');
  const initialSize = savedSize ? parseInt(savedSize) : 80;

  // 1. まずスライダー自体の値を更新
  updateSliderRange();
  // 2. その後、時計の見た目とラベルを更新
  applySize(initialSize);

  applyTheme(localStorage.getItem('clock-theme') || 'terminal');

  // -------------------------------------------------------
  // 時計ドラッグ移動（元の実装そのまま）
  // -------------------------------------------------------
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  const startDrag = (e) => {
    if ((e as MouseEvent).button === 2) return;
    isDragging = true;
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : e.clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    const rect = clock.getBoundingClientRect();
    if (clock.style.transform.includes('translate')) {
      clock.style.transform = 'none';
      clock.style.left  = `${rect.left}px`;
      clock.style.top   = `${rect.top}px`;
      clock.style.right = 'auto';
    }
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    clock.style.transition = 'none';
  };

  const doDrag = (e) => {
    if (!isDragging) return;
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : e.clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    const maxX = window.innerWidth  - clock.offsetWidth;
    const maxY = window.innerHeight - clock.offsetHeight;
    clock.style.left = `${Math.max(0, Math.min(clientX - offsetX, maxX))}px`;
    clock.style.top  = `${Math.max(0, Math.min(clientY - offsetY, maxY))}px`;
  };

  const endDrag = () => {
    isDragging = false;
    clock.style.transition = 'opacity 0.45s ease, width 0.3s ease, height 0.3s ease, transform 0.3s ease';
  };

  clock.addEventListener('mousedown',  startDrag);
  window.addEventListener('mousemove', doDrag);
  window.addEventListener('mouseup',   endDrag);
  clock.addEventListener('touchstart', startDrag as EventListener, { passive: false });
  window.addEventListener('touchmove', doDrag   as EventListener, { passive: false });
  window.addEventListener('touchend',  endDrag);

  // -------------------------------------------------------
  // CLOCKタブの上下ドラッグ（右端に張り付いたまま）
  // -------------------------------------------------------
  let tabDragging = false;
  let tabMoved    = false;
  let tabOffsetY  = 0;

  const startTabDrag = (e) => {
    tabDragging = true;
    tabMoved    = false;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;
    // top が未設定（transform:translateY(-50%)）の場合は getBoundingClientRect で実座標を取得
    const rect = tab.getBoundingClientRect();
    tabOffsetY = clientY - rect.top;
    tab.style.transition = 'none';
    tab.style.transform  = 'translateX(0)'; // Y中央寄せを解除してtopで制御
    tab.style.top        = `${rect.top}px`;
    //e.preventDefault();
    e.stopPropagation();
  };

  const doTabDrag = (e: MouseEvent | TouchEvent) => {
    if (!tabDragging) return;

    // ブラウザのスクロール動作を完全にストップさせる
    if (e.cancelable) e.preventDefault();

    tabMoved = true;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : (e as MouseEvent).clientY;

    // 画面外にはみ出さないための計算
    const maxY = window.innerHeight - tab.offsetHeight;
    const newTop = Math.max(0, Math.min(clientY - tabOffsetY, maxY));

    // スムーズに動かすため、移動中だけは transition を確実に zero にする（念押し）
    tab.style.transition = 'none';
    tab.style.top = `${newTop}px`;
  };

  const endTabDrag = () => {
    if (!tabDragging) return;
    tabDragging = false;
    tab.style.transition = 'background 0.25s ease, box-shadow 0.25s ease';
  };

  // click はドラッグでなかった時だけ showClock を発火
  tab.addEventListener('click', (e) => {
    if (tabMoved) { tabMoved = false; return; }
    showClock();
  });

  tab.addEventListener('mousedown',  startTabDrag);
  window.addEventListener('mousemove', doTabDrag);
  window.addEventListener('mouseup',   endTabDrag);
  tab.addEventListener('touchstart', startTabDrag as EventListener, { passive: false });
  window.addEventListener('touchmove', doTabDrag  as EventListener, { passive: false });
  window.addEventListener('touchend',  endTabDrag);
