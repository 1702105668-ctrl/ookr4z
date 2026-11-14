/* =========================================================
   4K 打歌 · osu!mania 皮肤 / 原生流速 / 可调 OD
   ========================================================= */
(function () {
  "use strict";

  const PACKS = {
    jack: { label: "JACK", cn: "叠键" },
    stream: { label: "STREAM", cn: "切键" },
    ln: { label: "LN", cn: "长条" }
  };
  const LANE_COLORS = ["#ff6b9d", "#c084fc", "#4be3d0", "#ffd166"];
  const DEFAULTS = { speed: 30, volume: 80, od: 8, offset: 0, showAPFC: true };
  const WEIGHT = { perfect: 1, great: 0.98, good: 2 / 3, bad: 1 / 3, miss: 0 };
  const POINT = { perfect: 1000, great: 980, good: 667, bad: 333, miss: 0 };
  const GRADE_NAME = { perfect: "PERFECT", great: "GREAT", good: "GOOD", bad: "BAD", miss: "MISS" };

  let els = null;
  let bound = false;
  let active = false;
  let songs = [];
  let selectedIndex = -1;
  let settings = loadSettings();
  let audio = null;
  let audioSongId = "";
  let game = null;
  let dims = { w: 0, h: 0, dpr: 1 };
  let staticCanvas = null;
  let sctx = null;
  let skin = null;
  let skinPromise = null;
  let holdPattern = null;
  let chartPromise = null;
  let startToken = 0;
  let countTimer = 0;
  let lastMissFlash = 0;
  let loadStep = "idle";
  let loadError = "";
  let unlockToken = 0;
  let settingsOpen = false;
  const pointerLanes = new Map();

  function $(id) { return document.getElementById(id); }
  function toast(message) {
    document.dispatchEvent(new CustomEvent("site:toast", { detail: { message: message } }));
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    return Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
  }
  function formatAcc(n) { return (Math.round(n * 100) / 100).toFixed(2) + "%"; }
  function padScore(n) { return String(Math.max(0, Math.round(n))).padStart(7, "0"); }

  function loadSettings() {
    const out = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem("rhythm-settings");
      if (raw) {
        const saved = JSON.parse(raw);
        if (isFinite(saved.speed)) out.speed = clamp(saved.speed, 1, 40);
        if (isFinite(saved.volume)) out.volume = clamp(saved.volume, 0, 100);
        if (isFinite(saved.od)) out.od = clamp(saved.od, 0, 10);
        if (isFinite(saved.offset)) out.offset = clamp(saved.offset, -100, 100);
        out.showAPFC = saved.showAPFC !== false;
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  function saveSettings() {
    try { localStorage.setItem("rhythm-settings", JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function readBest(id) {
    try { return parseInt(localStorage.getItem("rhythm-best-" + id) || "0", 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(id, score) {
    try {
      if (score > readBest(id)) localStorage.setItem("rhythm-best-" + id, String(score));
    } catch (e) { /* ignore */ }
  }

  function starsFor(song) {
    const activeTime = Math.max(30, song.duration - 6);
    const nps = song.notes / activeTime;
    const lnRatio = song.ln / Math.max(1, song.notes);
    return Math.round(clamp(1.2 + song.level * 0.55 + nps * 0.035 + lnRatio * 1.2, 1.5, 8.5) * 10) / 10;
  }

  // osu!mania stable 的原生流速：speed 1≈11485ms，speed 40≈287ms（402px 轨道）。
  function travelFor(bpm, speed) {
    const beatLength = 60000 / Math.max(60, bpm);
    return clamp((402 * beatLength / 21) / Math.max(1, speed), 120, 12000);
  }

  // osu!mania OD 判定窗口（ms）
  function windowsFor(od) {
    const o = clamp(od, 0, 10);
    return {
      perfect: 16,
      great: 64 - 3 * o,
      good: 97 - 3 * o,
      bad: 127 - 3 * o,
      miss: 151 - 3 * o
    };
  }

  /* ---------------- DOM ---------------- */
  function cache() {
    els = {
      select: $("rhythm-select"),
      play: $("rhythm-play"),
      chartList: $("chart-list"),
      chartCount: $("chart-count"),
      previewBg: $("preview-bg"),
      previewCover: $("preview-cover"),
      previewLevel: $("preview-level"),
      previewPack: $("preview-pack"),
      previewTitle: $("preview-title"),
      previewArtist: $("preview-artist"),
      previewStars: $("preview-stars"),
      previewBpm: $("preview-bpm"),
      previewNotes: $("preview-notes"),
      previewLn: $("preview-ln"),
      previewLength: $("preview-length"),
      previewMapper: $("preview-mapper"),
      previewBest: $("preview-best"),
      previewStart: $("preview-start"),
      playExit: $("play-exit"),
      playSettings: $("play-settings"),
      playTitle: $("play-title"),
      playSub: $("play-sub"),
      playTime: $("play-time"),
      playFill: $("play-fill"),
      playDuration: $("play-duration"),
      stage: $("rhythm-stage"),
      canvas: $("rhythm-canvas"),
      score: $("rhythm-score"),
      combo: $("rhythm-combo"),
      acc: $("rhythm-acc"),
      badges: $("play-badges"),
      badgeAp: $("badge-ap"),
      badgeFc: $("badge-fc"),
      loading: $("rhythm-loading"),
      loadingText: $("loading-text"),
      count: $("rhythm-count"),
      countText: $("rhythm-count-text"),
      settings: $("rhythm-settings"),
      setSpeed: $("set-speed"),
      setVolume: $("set-volume"),
      setOd: $("set-od"),
      setOffset: $("set-offset"),
      setApfc: $("set-apfc"),
      outSpeed: $("out-speed"),
      outVolume: $("out-volume"),
      outOd: $("out-od"),
      outOffset: $("out-offset"),
      outWindows: $("out-windows"),
      settingsClose: $("settings-close"),
      settingsExit: $("settings-exit"),
      result: $("rhythm-result"),
      grade: $("rhythm-grade"),
      resultTitle: $("rhythm-result-title"),
      resultScore: $("rhythm-result-score"),
      resultAcc: $("rhythm-result-acc"),
      resultCombo: $("rhythm-result-combo"),
      resultDetail: $("rhythm-result-detail"),
      resultBadge: $("rhythm-result-badge"),
      retry: $("rhythm-retry"),
      resultBack: $("rhythm-result-back"),
      judge: $("judge-pop")
    };
    els.ctx = els.canvas.getContext("2d");
    els.ctx.imageSmoothingEnabled = true;
  }

  /* ---------------- 选曲 ---------------- */
  function enter() {
    if (!songs.length) songs = window.RHYTHM_SONGS || [];
    songs.sort(function (a, b) {
      return a.level - b.level || (a.pack === "jack" ? -1 : 1);
    });
    active = true;
    if (!els) cache();
    bindOnce();
    stopGame();
    settings = loadSettings();
    selectedIndex = -1;
    showSelect();
    renderList();
    setupSkin();
    requestAnimationFrame(resizeCanvas);
  }

  function exit() {
    active = false;
    startToken++;
    stopGame();
    document.body.classList.remove("rhythm-playing");
    if (els) {
      els.play.hidden = true;
      els.select.hidden = false;
    }
  }

  function showSelect() {
    if (!els) return;
    document.body.classList.remove("rhythm-playing");
    els.select.hidden = false;
    els.play.hidden = true;
    els.settings.hidden = true;
    settingsOpen = false;
    window.scrollTo(0, 0);
  }

  function showPlay() {
    if (!els) return;
    document.body.classList.add("rhythm-playing");
    els.select.hidden = true;
    els.play.hidden = false;
    requestAnimationFrame(resizeCanvas);
  }

  function renderList() {
    if (!els) return;
    els.chartCount.textContent = songs.length + " 张";
    els.chartList.innerHTML = "";
    const frag = document.createDocumentFragment();
    songs.forEach(function (song, index) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chart-row";
      row.dataset.index = String(index);

      const main = document.createElement("span");
      main.className = "chart-row-main";
      const title = document.createElement("strong");
      title.textContent = song.title;
      const artist = document.createElement("small");
      artist.textContent = song.artist;
      main.appendChild(title);
      main.appendChild(artist);

      const meta = document.createElement("span");
      meta.className = "chart-row-meta";
      const level = document.createElement("b");
      level.textContent = song.diffName || song.version;
      const stars = document.createElement("em");
      stars.textContent = "★ " + starsFor(song).toFixed(1);
      meta.appendChild(level);
      meta.appendChild(stars);

      row.appendChild(main);
      row.appendChild(meta);
      row.addEventListener("click", function () { selectSong(index, true); });
      frag.appendChild(row);
    });
    els.chartList.appendChild(frag);
    if (songs.length) selectSong(selectedIndex >= 0 ? selectedIndex : 0, false);
  }

  function selectSong(index, focusPreview) {
    if (!songs[index]) return;
    selectedIndex = index;
    const song = songs[index];
    els.previewBg.src = song.cover;
    els.previewCover.src = song.cover;
    els.previewLevel.textContent = song.diffName || song.version;
    const diffName = song.diffName || song.version;
    const packMeta = PACKS[song.pack].label +
      (song.pack === "ln" ? "" : " · " + PACKS[song.pack].cn);
    els.previewPack.textContent = packMeta + " / " + diffName;
    els.previewTitle.textContent = song.title;
    els.previewArtist.textContent = song.artist;
    els.previewStars.textContent = "★ " + starsFor(song).toFixed(1);
    els.previewBpm.textContent = String(song.bpm);
    els.previewNotes.textContent = String(song.notes);
    els.previewLn.textContent = String(song.ln);
    els.previewLength.textContent = formatTime(song.duration);
    els.previewMapper.textContent = song.mapper || "—";
    const best = readBest(song.id);
    els.previewBest.textContent = best ? best.toLocaleString("en-US") : "—";
    els.chartList.querySelectorAll(".chart-row").forEach(function (row) {
      row.classList.toggle("active", parseInt(row.dataset.index, 10) === index);
    });
    const activeRow = els.chartList.querySelector('.chart-row[data-index="' + index + '"]');
    if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
    preloadSong(song);
    if (focusPreview && window.innerWidth < 760) {
      requestAnimationFrame(function () {
        const panel = document.querySelector(".chart-preview");
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  /* ---------------- 音频 ---------------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "auto";
    audio.volume = settings.volume / 100;
    audio.addEventListener("ended", function () {
      if (active && game && game.running) finishGame();
    });
    audio.addEventListener("error", function () {
      if (active && game && game.running) toast("音频加载失败，检查网络或换一张谱面");
    });
    return audio;
  }

  function preloadSong(song) {
    const a = ensureAudio();
    if (audioSongId !== song.id) {
      audioSongId = song.id;
      a.src = song.audio;
      a.load();
    }
  }

  function unlockAudio() {
    const a = ensureAudio();
    const token = ++unlockToken;
    a.volume = 0;
    let promise;
    try { promise = a.play(); } catch (e) { a.volume = settings.volume / 100; return; }
    if (promise && promise.then) {
      promise.then(function () {
        if (token !== unlockToken) return;
        if (!game || !game.running) {
          a.pause();
          try { a.currentTime = 0; } catch (e) { /* ignore */ }
        }
        a.volume = settings.volume / 100;
      }).catch(function () { a.volume = settings.volume / 100; });
    } else {
      a.volume = settings.volume / 100;
    }
  }

  function ensureAudioReady(song) {
    const a = ensureAudio();
    if (audioSongId !== song.id) {
      audioSongId = song.id;
      a.src = song.audio;
      a.load();
    }
    if (a.error) return Promise.reject(new Error("audio error"));
    if (a.readyState >= 3) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      let done = false;
      const finish = function (ok, err) {
        if (done) return;
        done = true;
        a.removeEventListener("canplay", onReady);
        a.removeEventListener("canplaythrough", onReady);
        a.removeEventListener("error", onError);
        clearTimeout(timer);
        if (ok) resolve();
        else reject(err || new Error("audio load failed"));
      };
      const onReady = function () { finish(true); };
      const onError = function () { finish(false, new Error("audio error")); };
      const timer = setTimeout(function () { finish(false, new Error("audio timeout")); }, 15000);
      a.addEventListener("canplay", onReady);
      a.addEventListener("canplaythrough", onReady);
      a.addEventListener("error", onError);
      if (a.readyState >= 3) finish(true);
    });
  }

  /* ---------------- 皮肤 ---------------- */
  function loadImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function setupSkin() {
    if (skinPromise) return skinPromise;
    skinPromise = Promise.all([
      loadImage("skin-note.png"),
      loadImage("skin-ln.png"),
      loadImage("skin-key-up.png"),
      loadImage("skin-key-down.png"),
      loadImage("skin-hint.png"),
      loadImage("skin-mascot.webp"),
      loadImage("skin-holdbody.png")
    ]).then(function (imgs) {
      skin = {
        note: imgs[0],
        ln: imgs[1],
        keyUp: imgs[2],
        keyDown: imgs[3],
        hint: imgs[4],
        mascot: imgs[5],
        holdbody: imgs[6]
      };
      return skin;
    }).catch(function () {
      skin = { note: null, ln: null, keyUp: null, keyDown: null, hint: null, mascot: null, holdbody: null };
      return skin;
    });
    return skinPromise;
  }

  /* ---------------- 谱面数据 ---------------- */
  function loadCharts() {
    if (window.RHYTHM_CHARTS) return Promise.resolve(window.RHYTHM_CHARTS);
    if (chartPromise) return chartPromise;
    chartPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "charts-data.js?v=8";
      script.onload = function () {
        if (window.RHYTHM_CHARTS) resolve(window.RHYTHM_CHARTS);
        else { chartPromise = null; reject(new Error("chart data missing")); }
      };
      script.onerror = function () { chartPromise = null; reject(new Error("chart data failed")); };
      document.head.appendChild(script);
    });
    return chartPromise;
  }

  /* ---------------- 开始游戏 ---------------- */
  async function startGame() {
    if (!active || !songs[selectedIndex]) return;
    const song = songs[selectedIndex];
    const token = ++startToken;
    unlockAudio();
    showPlay();
    els.loading.hidden = false;
    els.count.hidden = true;
    els.result.hidden = true;
    els.settings.hidden = true;
    els.judge.className = "judge-pop";
    els.badges.hidden = true;
    els.loadingText.textContent = "正在加载谱面与音频…";
    els.playTitle.textContent = song.title;
    els.playSub.textContent = PACKS[song.pack].label + " · " +
      (song.diffName || song.version) + " · " + song.artist;
    els.playDuration.textContent = formatTime(song.duration);
    els.playTime.textContent = "0:00";
    els.playFill.style.width = "0%";
    els.playSettings.disabled = false;
    loadStep = "charts";
    loadError = "";
    game = null;
    settingsOpen = false;

    try {
      const charts = await loadCharts();
      if (token !== startToken || !active) return;
      loadStep = "skin";
      els.loadingText.textContent = "正在加载 osu!mania 皮肤…";
      await setupSkin();
      if (token !== startToken || !active) return;
      loadStep = "audio";
      els.loadingText.textContent = "正在加载歌曲音频…";
      await ensureAudioReady(song);
      if (token !== startToken || !active) return;

      loadStep = "ready";
      const chart = charts[song.id];
      if (!chart || !chart.notes || !chart.notes.length) throw new Error("empty chart");
      game = createGame(song, chart);
      els.loading.hidden = true;
      els.loadingText.textContent = "准备中…";
      resizeCanvas();
      updateHud();
      updateBadges();
      runCountdown(token);
    } catch (err) {
      loadStep = "error";
      loadError = err && err.message ? err.message : String(err);
      if (token !== startToken) return;
      els.loading.hidden = true;
      toast("谱面或音频加载失败，再试一次吧");
      showSelect();
    }
  }

  function createGame(song, chart) {
    const notes = chart.notes.map(function (row) {
      return {
        time: row[0],
        lane: row[1],
        end: row[2] > row[0] ? row[2] : 0,
        judged: false,
        headHit: false,
        holding: false,
        tailJudged: false,
        tailSkipped: false
      };
    }).filter(function (n) { return n.time >= 0 && n.lane >= 0 && n.lane < 4; });
    notes.sort(function (a, b) { return a.time - b.time || a.lane - b.lane; });

    const laneNotes = [[], [], [], []];
    notes.forEach(function (n, i) { laneNotes[n.lane].push(i); });
    const lnCount = notes.filter(function (n) { return n.end > 0; }).length;
    const last = notes.length ? Math.max.apply(null, notes.map(function (n) { return n.end || n.time; })) : 0;

    const g = {
      song: song,
      notes: notes,
      laneNotes: laneNotes,
      activeHolds: [null, null, null, null],
      keyDown: [false, false, false, false],
      lastRelease: [-10000, -10000, -10000, -10000],
      laneGlow: [0, 0, 0, 0],
      particles: [],
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
      judged: 0,
      weighted: 0,
      accuracy: 100,
      ap: true,
      fc: true,
      running: false,
      finished: false,
      wasRunning: false,
      time: 0,
      travel: travelFor(song.bpm, settings.speed),
      windows: windowsFor(settings.od),
      offset: settings.offset,
      lastDraw: 0,
      lastUi: 0,
      lastFrame: 0,
      raf: 0,
      endAt: last + 2200,
      missCursor: 0,
      coverImage: null
    };
    g.coverImage = new Image();
    g.coverImage.onload = function () { if (game === g) renderStatic(); };
    g.coverImage.src = song.cover;
    applyAudioSettings();
    return g;
  }

  function runCountdown(token) {
    if (!els || !game) return;
    els.count.hidden = false;
    let n = 3;
    function step() {
      if (token !== startToken || !active || !game) return;
      els.countText.textContent = n > 0 ? String(n) : "GO";
      els.countText.style.animation = "none";
      void els.countText.offsetWidth;
      els.countText.style.animation = "";
      if (n > 0) {
        n--;
        countTimer = setTimeout(step, 560);
      } else {
        countTimer = setTimeout(function () { beginPlayback(token); }, 420);
      }
    }
    step();
  }

  async function beginPlayback(token) {
    if (token !== startToken || !active || !game) return;
    els.count.hidden = true;
    unlockToken++;
    try {
      audio.volume = settings.volume / 100;
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      if (token !== startToken) return;
      toast("浏览器没允许播放音频，请再点一次开始");
      stopGame();
      showSelect();
      return;
    }
    if (token !== startToken || !active || !game) {
      audio.pause();
      return;
    }
    game.running = true;
    game.lastFrame = performance.now();
    game.lastDraw = 0;
    game.lastUi = 0;
    els.badges.hidden = !settings.showAPFC;
    updateBadges();
    game.raf = requestAnimationFrame(loop);
  }

  /* ---------------- 设置 ---------------- */
  function applyAudioSettings() {
    if (audio) audio.volume = settings.volume / 100;
  }

  function updateSettingsUI() {
    if (!els) return;
    els.setSpeed.value = String(settings.speed);
    els.setVolume.value = String(settings.volume);
    els.setOd.value = String(settings.od);
    els.setOffset.value = String(settings.offset);
    els.setApfc.checked = !!settings.showAPFC;
    els.outSpeed.textContent = String(settings.speed);
    els.outVolume.textContent = settings.volume + "%";
    els.outOd.textContent = Number(settings.od).toFixed(1);
    els.outOffset.textContent = (settings.offset > 0 ? "+" : "") + settings.offset + " ms";
    const w = windowsFor(settings.od);
    if (els.outWindows) {
      els.outWindows.textContent = "判定窗口 ±" + Math.round(w.perfect) + " / ±" +
        Math.round(w.great) + " / ±" + Math.round(w.good) + " / ±" + Math.round(w.bad) + " ms";
    }
  }

  function applySettings() {
    if (game) {
      game.travel = travelFor(game.song.bpm, settings.speed);
      game.windows = windowsFor(settings.od);
      game.offset = settings.offset;
    }
    applyAudioSettings();
    updateBadges();
    updateSettingsUI();
    saveSettings();
  }

  function updateBadges() {
    if (!els) return;
    const show = !!game && settings.showAPFC && !game.finished;
    els.badges.hidden = !show;
    if (!show) return;
    els.badgeAp.classList.toggle("lost", !game.ap);
    els.badgeFc.classList.toggle("lost", !game.fc);
  }

  function openSettings() {
    if (!game || !game.running) {
      toast("开始打歌后才能调整设置");
      return;
    }
    settingsOpen = true;
    game.wasRunning = true;
    game.running = false;
    cancelAnimationFrame(game.raf);
    game.raf = 0;
    if (audio) audio.pause();
    updateSettingsUI();
    els.settings.hidden = false;
    els.badges.hidden = true;
  }

  function closeSettings() {
    if (!els) return;
    els.settings.hidden = true;
    settingsOpen = false;
    if (game && game.wasRunning && !game.finished) {
      game.wasRunning = false;
      audio.volume = settings.volume / 100;
      const p = audio.play();
      if (p && p.catch) p.catch(function () { toast("继续播放失败，请重试"); });
      game.running = true;
      game.lastFrame = performance.now();
      game.lastDraw = 0;
      game.lastUi = 0;
      els.badges.hidden = !settings.showAPFC;
      updateBadges();
      game.raf = requestAnimationFrame(loop);
    }
  }

  /* ---------------- 判定 ---------------- */
  function gameTime() {
    if (!audio || !game) return 0;
    return Math.max(0, audio.currentTime * 1000 + game.offset);
  }

  function updateHud() {
    if (!els) return;
    if (!game) {
      els.score.textContent = "0000000";
      els.combo.textContent = "0";
      els.acc.textContent = "100.00%";
      return;
    }
    els.score.textContent = padScore(game.score);
    els.combo.textContent = String(game.combo);
    els.acc.textContent = formatAcc(game.accuracy);
  }

  function flashJudge(kind) {
    if (!els) return;
    els.judge.textContent = GRADE_NAME[kind] || "MISS";
    els.judge.className = "judge-pop " + kind;
    void els.judge.offsetWidth;
    els.judge.classList.add("show");
  }

  function spawnBurst(lane, count) {
    if (!game || !dims.w) return;
    const L = getLayout();
    const x = L.boardX + lane * L.laneW + L.laneW / 2;
    const y = L.judgeY;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 80 + Math.random() * 170;
      game.particles.push({
        x: x + (Math.random() - 0.5) * L.laneW * 0.32,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.53,
        color: LANE_COLORS[lane]
      });
    }
    if (game.particles.length > 100) game.particles.splice(0, game.particles.length - 100);
  }

  function registerHit(kind, isTail, lane) {
    if (!game) return;
    game.judged++;
    game[kind]++;
    game.weighted += WEIGHT[kind];
    game.score += POINT[kind];
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    if (kind !== "perfect") game.ap = false;
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    flashJudge(kind);
    spawnBurst(lane, isTail ? 6 : (kind === "perfect" ? 9 : 6));
    updateHud();
    updateBadges();
  }

  function registerMiss() {
    if (!game) return;
    game.judged++;
    game.miss++;
    game.combo = 0;
    game.ap = false;
    game.fc = false;
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    const now = performance.now();
    if (now - lastMissFlash > 90) {
      lastMissFlash = now;
      flashJudge("miss");
    }
    updateHud();
    updateBadges();
  }

  function gradeFor(delta) {
    const w = game.windows;
    if (delta <= w.perfect) return "perfect";
    if (delta <= w.great) return "great";
    if (delta <= w.good) return "good";
    if (delta <= w.bad) return "bad";
    return null;
  }

  function laneLowerBound(lane, t) {
    const arr = game.laneNotes[lane];
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (game.notes[arr[mid]].time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function pressLane(lane) {
    if (!active || !game || !game.running || game.finished || settingsOpen) return;
    if (game.keyDown[lane]) return;
    game.keyDown[lane] = true;
    game.laneGlow[lane] = performance.now();

    const t = gameTime();
    const activeHold = game.activeHolds[lane];
    if (activeHold && t <= activeHold.end) activeHold.holding = true;

    const arr = game.laneNotes[lane];
    const start = laneLowerBound(lane, t);
    let best = null;
    let bestDelta = Infinity;
    for (let i = Math.max(0, start - 7); i < Math.min(arr.length, start + 9); i++) {
      const note = game.notes[arr[i]];
      if (note.judged) continue;
      const d = Math.abs(note.time - t);
      if (d < bestDelta) {
        bestDelta = d;
        best = note;
      }
    }
    if (!best || bestDelta > game.windows.bad) return;

    const kind = gradeFor(bestDelta);
    if (!kind) return;
    best.judged = true;
    best.headHit = true;
    if (best.end > 0) {
      best.holding = true;
      game.activeHolds[lane] = best;
    }
    registerHit(kind, false, lane);
  }

  function releaseLane(lane) {
    if (!game) return;
    game.keyDown[lane] = false;
    game.lastRelease[lane] = performance.now();
    const hold = game.activeHolds[lane];
    if (hold) hold.holding = false;
  }

  function updateGame(t, dt) {
    if (!game || !game.running) return;

    while (game.missCursor < game.notes.length) {
      const note = game.notes[game.missCursor];
      if (note.time >= t - game.windows.miss) break;
      if (!note.judged) {
        note.judged = true;
        if (note.end > 0) {
          note.tailSkipped = true;
          note.tailJudged = true;
        }
        registerMiss();
      }
      game.missCursor++;
    }

    for (let lane = 0; lane < 4; lane++) {
      const hold = game.activeHolds[lane];
      if (!hold || hold.tailJudged) continue;
      if (t >= hold.end) {
        const held = game.keyDown[lane] ||
          (performance.now() - game.lastRelease[lane] <= 90);
        hold.tailJudged = true;
        game.activeHolds[lane] = null;
        if (held) registerHit("perfect", true, lane);
        else registerMiss();
      }
    }

    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 620 * dt;
      p.life -= dt;
    }
    game.particles = game.particles.filter(function (p) { return p.life > 0; });

    if (t > game.endAt) finishGame();
  }

  function finishGame() {
    if (!game || game.finished) return;
    game.finished = true;
    game.running = false;
    cancelAnimationFrame(game.raf);
    game.raf = 0;
    if (audio) audio.pause();
    els.settings.hidden = true;
    els.playSettings.disabled = true;

    for (const note of game.notes) {
      if (!note.judged) {
        note.judged = true;
        game.judged++;
        game.miss++;
        if (note.end > 0) {
          note.tailSkipped = true;
          note.tailJudged = true;
        }
      }
    }
    for (let lane = 0; lane < 4; lane++) {
      const hold = game.activeHolds[lane];
      if (hold && !hold.tailJudged) {
        hold.tailJudged = true;
        game.judged++;
        game.miss++;
      }
      game.activeHolds[lane] = null;
    }
    if (game.miss > 0) game.fc = false;
    game.ap = game.perfect === game.judged;
    game.combo = 0;
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    updateHud();
    els.playFill.style.width = "100%";
    els.badges.hidden = true;

    let grade = "D";
    if (game.accuracy >= 98) grade = "S";
    else if (game.accuracy >= 95) grade = "A";
    else if (game.accuracy >= 90) grade = "B";
    else if (game.accuracy >= 80) grade = "C";

    els.grade.textContent = grade;
    els.resultTitle.textContent = grade === "S" ? "太强了，收下我的膝盖" :
      grade === "A" ? "漂亮，节奏感拉满" :
      grade === "B" ? "不错，再来一次？" : "别灰心，熟能生巧";
    els.resultScore.textContent = game.score.toLocaleString("en-US");
    els.resultAcc.textContent = formatAcc(game.accuracy);
    els.resultCombo.textContent = String(game.maxCombo);
    els.resultDetail.textContent =
      "Perfect " + game.perfect + " · Great " + game.great +
      " · Good " + game.good + " · Bad " + game.bad + " · Miss " + game.miss;
    els.resultBadge.textContent = game.ap ? "AP" : (game.fc ? "FC" : "");
    els.resultBadge.className = "result-badge " + (game.ap ? "ap" : (game.fc ? "fc" : ""));
    els.result.hidden = false;
    els.loading.hidden = true;
    els.count.hidden = true;
    els.judge.className = "judge-pop";
    saveBest(game.song.id, game.score);
    const best = readBest(game.song.id);
    els.previewBest.textContent = best ? best.toLocaleString("en-US") : "—";
  }

  /* ---------------- 主循环 ---------------- */
  function loop(ts) {
    if (!game || !game.running) return;
    const t = gameTime();
    const dt = clamp((t - game.time) / 1000, 0, 0.05);
    game.time = t;
    updateGame(t, dt);
    if (game.running && (!game.lastDraw || ts - game.lastDraw >= 14)) {
      drawFrame(t);
      game.lastDraw = ts;
    }
    if (game.running && (!game.lastUi || t - game.lastUi >= 100)) {
      updateProgress(t);
      game.lastUi = t;
    }
    if (game.running) game.raf = requestAnimationFrame(loop);
  }

  function updateProgress(t) {
    if (!game || !els) return;
    const fill = clamp(t / game.endAt * 100, 0, 100);
    els.playFill.style.width = fill.toFixed(2) + "%";
    els.playTime.textContent = formatTime(Math.min(t / 1000, game.song.duration));
    els.playDuration.textContent = formatTime(game.song.duration);
  }

  /* ---------------- Canvas ---------------- */
  function getLayout() {
    const w = dims.w;
    const h = dims.h;
    const boardW = Math.min(w - (w < 640 ? 8 : 120), 620);
    const boardX = (w - boardW) / 2;
    const laneW = boardW / 4;
    const judgeY = h * 0.82;
    return { w: w, h: h, boardW: boardW, boardX: boardX, laneW: laneW, judgeY: judgeY };
  }

  function resizeCanvas() {
    if (!els || !els.stage || els.play.hidden) return;
    const rect = els.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    dims = { w: rect.width, h: rect.height, dpr: dpr };
    els.canvas.width = Math.round(rect.width * dpr);
    els.canvas.height = Math.round(rect.height * dpr);
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    els.ctx.imageSmoothingEnabled = true;
    staticCanvas = document.createElement("canvas");
    staticCanvas.width = els.canvas.width;
    staticCanvas.height = els.canvas.height;
    sctx = staticCanvas.getContext("2d");
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.imageSmoothingEnabled = true;
    holdPattern = null;
    renderStatic();
    if (game) drawFrame(game.time);
  }

  function drawCoverFit(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const br = w / h;
    let dw, dh, dx, dy;
    if (ir > br) {
      dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y;
    } else {
      dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
    else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }

  function renderStatic() {
    if (!sctx || !dims.w || !dims.h) return;
    const L = getLayout();
    const ctx = sctx;
    ctx.clearRect(0, 0, L.w, L.h);

    if (game && game.coverImage && game.coverImage.complete && game.coverImage.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      drawCoverFit(ctx, game.coverImage, 0, 0, L.w, L.h);
      ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, "rgba(6,8,16,0.9)");
    bg.addColorStop(0.6, "rgba(7,9,18,0.76)");
    bg.addColorStop(1, "rgba(9,11,22,0.97)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.w, L.h);

    ctx.save();
    roundRect(ctx, L.boardX, 0, L.boardW, L.h, 12);
    ctx.clip();

    // 皮肤 4K 列背景是黑色半透明
    ctx.fillStyle = "rgba(0,0,0,0.57)";
    ctx.fillRect(L.boardX, 0, L.boardW, L.h);
    for (let i = 0; i < 4; i++) {
      const x = L.boardX + i * L.laneW;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.16)";
      ctx.fillRect(x, 0, L.laneW, L.h);
    }
    for (let i = 1; i < 4; i++) {
      const x = L.boardX + i * L.laneW;
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.h);
      ctx.stroke();
    }

    const topFade = ctx.createLinearGradient(0, 0, 0, 110);
    topFade.addColorStop(0, "rgba(5,7,15,0.94)");
    topFade.addColorStop(1, "rgba(5,7,15,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(L.boardX, 0, L.boardW, 110);
    const bottomFade = ctx.createLinearGradient(0, L.judgeY + 50, 0, L.h);
    bottomFade.addColorStop(0, "rgba(5,7,15,0)");
    bottomFade.addColorStop(1, "rgba(5,7,15,0.92)");
    ctx.fillStyle = bottomFade;
    ctx.fillRect(L.boardX, L.judgeY + 50, L.boardW, L.h - L.judgeY - 50);
    ctx.restore();
  }

  function drawFrame(t) {
    if (!els || !dims.w || !game) return;
    const L = getLayout();
    const ctx = els.ctx;
    ctx.clearRect(0, 0, L.w, L.h);
    if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, L.w, L.h);

    const now = performance.now();
    for (let lane = 0; lane < 4; lane++) {
      const elapsed = now - game.laneGlow[lane];
      if (elapsed >= 0 && elapsed < 160) {
        ctx.globalAlpha = (1 - elapsed / 160) * 0.1;
        ctx.fillStyle = LANE_COLORS[lane];
        ctx.fillRect(L.boardX + lane * L.laneW, L.judgeY - 200, L.laneW, 200);
      }
    }
    ctx.globalAlpha = 1;

    // 球形判定框在轨道落点；note 会落进框里再消失。
    drawKeys(ctx, L);

    ctx.save();
    ctx.beginPath();
    ctx.rect(L.boardX, 0, L.boardW, L.judgeY + 10);
    ctx.clip();
    drawActiveHolds(ctx, L, t);
    drawNotes(ctx, L, t);
    ctx.restore();

    drawParticles(ctx);
  }

  function drawNotes(ctx, L, t) {
    const notes = game.notes;
    let lo = 0;
    let hi = notes.length;
    const from = t - 360;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].time < from) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < notes.length; i++) {
      const note = notes[i];
      if (note.time > t + game.travel) break;
      if (note.judged) continue;
      const headY = L.judgeY - ((note.time - t) / game.travel) * (L.judgeY + 34);
      if (headY > L.judgeY + 24) continue;
      if (note.end > 0) {
        const tailY = L.judgeY - ((note.end - t) / game.travel) * (L.judgeY + 34);
        drawHoldBody(ctx, L, note, tailY, headY, false);
      }
      drawNoteHead(ctx, L, note, headY);
    }
  }

  function drawActiveHolds(ctx, L, t) {
    for (let lane = 0; lane < 4; lane++) {
      const note = game.activeHolds[lane];
      if (!note || note.tailJudged) continue;
      const headY = L.judgeY - ((note.time - t) / game.travel) * (L.judgeY + 34);
      const tailY = L.judgeY - ((note.end - t) / game.travel) * (L.judgeY + 34);
      drawHoldBody(ctx, L, note, tailY, Math.min(L.judgeY, headY + 4), !!note.holding);
    }
  }

  function drawHoldBody(ctx, L, note, tailY, headY, active) {
    const w = L.laneW * 0.92;
    const x = L.boardX + note.lane * L.laneW + (L.laneW - w) / 2;
    const top = Math.max(-20, Math.min(tailY, headY));
    const bottom = Math.min(L.judgeY + 10, Math.max(tailY, headY));
    if (bottom - top < 1) return;
    if (skin && skin.holdbody) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      if (!holdPattern) holdPattern = ctx.createPattern(skin.holdbody, "repeat-y");
      if (holdPattern) {
        ctx.translate(x, top);
        ctx.scale(w / skin.holdbody.width, 1);
        ctx.fillStyle = holdPattern;
        ctx.fillRect(0, 0, skin.holdbody.width, bottom - top);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(210,210,210,0.45)";
      ctx.fillRect(x, top, w, bottom - top);
    }
  }

  function drawNoteHead(ctx, L, note, y) {
    const img = note.end > 0 ? (skin && skin.ln) : (skin && skin.note);
    const size = L.laneW * 0.92;
    const h = size;
    const alpha = clamp((y + 70) / 90, 0.15, 1);
    ctx.globalAlpha = alpha;
    if (img) {
      ctx.drawImage(img, L.boardX + note.lane * L.laneW + (L.laneW - size) / 2, y - h / 2, size, h);
    } else {
      ctx.fillStyle = "#f6e7b8";
      ctx.beginPath();
      ctx.arc(L.boardX + note.lane * L.laneW + L.laneW / 2, y, size * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawKeys(ctx, L) {
    if (!skin) return;
    const size = L.laneW * 0.96;
    for (let lane = 0; lane < 4; lane++) {
      const cx = L.boardX + lane * L.laneW + L.laneW / 2;
      const pressed = !!game.keyDown[lane];
      if (skin.note && pressed) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.drawImage(skin.note, cx - size / 2, L.judgeY - size / 2, size, size * 0.97);
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, L.judgeY, size * 0.48, 0, Math.PI * 2);
      ctx.strokeStyle = pressed ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = pressed ? 2.4 : 1.6;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    if (!game.particles.length) return;
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 输入 / 绑定 ---------------- */
  function keyToLane(key) {
    const map = {
      d: 0, f: 1, j: 2, k: 3,
      D: 0, F: 1, J: 2, K: 3,
      ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3
    };
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : -1;
  }

  function onKeyDown(e) {
    if (!active || !game || !game.running || e.repeat || settingsOpen) return;
    const lane = keyToLane(e.key);
    if (lane < 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    pressLane(lane);
  }

  function onKeyUp(e) {
    if (!active || !game) return;
    const lane = keyToLane(e.key);
    if (lane < 0) return;
    releaseLane(lane);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    els.previewStart.addEventListener("click", startGame);
    els.playExit.addEventListener("click", function () {
      stopGame();
      showSelect();
    });
    els.retry.addEventListener("click", startGame);
    els.resultBack.addEventListener("click", function () {
      stopGame();
      showSelect();
    });
    els.playSettings.addEventListener("click", openSettings);
    els.settingsClose.addEventListener("click", closeSettings);
    els.settingsExit.addEventListener("click", function () {
      stopGame();
      showSelect();
    });

    ["speed", "volume", "od", "offset"].forEach(function (key) {
      const input = els["set" + key.charAt(0).toUpperCase() + key.slice(1)];
      if (!input) return;
      input.addEventListener("input", function () {
        if (key === "speed") settings.speed = clamp(parseFloat(input.value), 1, 40);
        if (key === "volume") settings.volume = clamp(parseInt(input.value, 10), 0, 100);
        if (key === "od") settings.od = clamp(parseFloat(input.value), 0, 10);
        if (key === "offset") settings.offset = clamp(parseInt(input.value, 10), -100, 100);
        applySettings();
      });
    });
    els.setApfc.addEventListener("change", function () {
      settings.showAPFC = !!els.setApfc.checked;
      applySettings();
    });

    function laneAt(clientX) {
      if (!els || !game) return -1;
      const rect = els.canvas.getBoundingClientRect();
      const L = getLayout();
      const x = clientX - rect.left;
      if (x < L.boardX || x > L.boardX + L.boardW) return -1;
      return clamp(Math.floor((x - L.boardX) / L.laneW), 0, 3);
    }

    els.canvas.addEventListener("pointerdown", function (e) {
      if (!game || !game.running || game.finished || settingsOpen) return;
      const lane = laneAt(e.clientX);
      if (lane < 0) return;
      e.preventDefault();
      pointerLanes.set(e.pointerId, lane);
      if (els.canvas.setPointerCapture) {
        try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      pressLane(lane);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (evt) {
      els.canvas.addEventListener(evt, function (e) {
        if (!pointerLanes.has(e.pointerId)) return;
        const lane = pointerLanes.get(e.pointerId);
        pointerLanes.delete(e.pointerId);
        releaseLane(lane);
      });
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", function () {
      if (!game) return;
      for (let i = 0; i < 4; i++) releaseLane(i);
    });
    window.addEventListener("resize", function () {
      if (active && els && !els.play.hidden) resizeCanvas();
    });
  }

  /* ---------------- 清理 / 对外 ---------------- */
  function stopGame() {
    startToken++;
    clearTimeout(countTimer);
    countTimer = 0;
    if (game) {
      game.running = false;
      game.finished = true;
      cancelAnimationFrame(game.raf);
      game.raf = 0;
      game.activeHolds = [null, null, null, null];
      game = null;
    }
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
    settingsOpen = false;
    pointerLanes.clear();
    if (els) {
      els.count.hidden = true;
      els.loading.hidden = true;
      els.result.hidden = true;
      els.settings.hidden = true;
      els.badges.hidden = true;
      els.judge.className = "judge-pop";
    }
  }

  window.RhythmGame = {
    enter: enter,
    exit: exit,
    status: function () {
      const base = {
        loadStep: loadStep,
        loadError: loadError,
        chartsReady: !!window.RHYTHM_CHARTS,
        skinReady: !!skin,
        audioReadyState: audio ? audio.readyState : -1,
        audioNetworkState: audio ? audio.networkState : -1,
        audioSrc: audio ? audio.src.split("/").slice(-1)[0] : "",
        audioPaused: audio ? audio.paused : true,
        audioTime: audio ? Math.round(audio.currentTime * 1000) : 0,
        audioDuration: audio && isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
        speed: settings.speed,
        od: settings.od,
        offset: settings.offset,
        volume: settings.volume
      };
      if (!game) return base;
      return Object.assign(base, {
        song: game.song.id,
        running: game.running,
        finished: game.finished,
        time: Math.round(game.time),
        score: game.score,
        combo: game.combo,
        maxCombo: game.maxCombo,
        acc: Math.round(game.accuracy * 100) / 100,
        judged: game.judged,
        notes: game.notes.length,
        travel: Math.round(game.travel),
        windows: {
          perfect: Math.round(game.windows.perfect),
          great: Math.round(game.windows.great),
          good: Math.round(game.windows.good),
          bad: Math.round(game.windows.bad),
          miss: Math.round(game.windows.miss)
        },
        ap: game.ap,
        fc: game.fc
      });
    }
  };
})();
