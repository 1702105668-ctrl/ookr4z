/* =========================================================
   4K 打歌 · 谱面来自 Malody Regular Dan v3（用户提供的 osz）
   皮肤来自 OoKr4z's skin（用户提供的 osk）
   ========================================================= */
(function () {
  "use strict";

  const PACKS = {
    jack: {
      label: "JACK",
      title: "叠键特化",
      desc: "密集的叠键与 Jack，考验手指的独立性。",
      color: "#ff5c9d"
    },
    stream: {
      label: "STREAM",
      title: "连打特化",
      desc: "连续的 Stream 与长条，跟着鼓点一路冲到底。",
      color: "#4be3d0"
    }
  };

  const LANE_COLORS = ["#ff6b9d", "#c084fc", "#4be3d0", "#ffd166"];
  const KEYS = ["D", "F", "J", "K"];
  const SPEEDS = [0.85, 1, 1.15, 1.3];
  const WINDOW = { perfect: 45, great: 85, good: 125, bad: 165, miss: 190 };
  const WEIGHT = { perfect: 1, great: 0.85, good: 0.6, bad: 0.3, miss: 0 };
  const POINT = { perfect: 1000, great: 850, good: 600, bad: 300, miss: 0 };
  const GRADE_NAME = { perfect: "PERFECT", great: "GREAT", good: "GOOD", bad: "BAD", miss: "MISS" };

  let els = null;
  let bound = false;
  let active = false;
  let songs = [];
  let selectedPack = "jack";
  let selectedSong = null;
  let speed = 1;
  let audio = null;
  let audioSongId = "";
  let game = null;
  let dims = { w: 0, h: 0, dpr: 1 };
  let staticCanvas = null;
  let sctx = null;
  let skin = null;
  let skinPromise = null;
  let chartPromise = null;
  let startToken = 0;
  let countTimer = 0;
  let lastMissFlash = 0;
  let loadStep = "idle";
  let loadError = "";
  let unlockToken = 0;

  function $(id) { return document.getElementById(id); }
  function toast(message) {
    document.dispatchEvent(new CustomEvent("site:toast", { detail: { message: message } }));
  }

  /* ---------------- DOM ---------------- */
  function cache() {
    els = {
      select: $("rhythm-select"),
      detail: $("rhythm-detail"),
      play: $("rhythm-play"),
      packTabs: $("pack-tabs"),
      packStrip: $("pack-strip"),
      packLabel: $("pack-label"),
      packTitle: $("pack-title"),
      packDesc: $("pack-desc"),
      packCount: $("pack-count"),
      grid: $("chart-grid"),
      detailBg: $("detail-bg"),
      detailBack: $("detail-back"),
      detailCover: $("detail-cover"),
      detailLevel: $("detail-level"),
      detailPack: $("detail-pack"),
      detailTitle: $("detail-title"),
      detailArtist: $("detail-artist"),
      detailBpm: $("detail-bpm"),
      detailNotes: $("detail-notes"),
      detailLn: $("detail-ln"),
      detailMapper: $("detail-mapper"),
      detailLength: $("detail-length"),
      detailBest: $("detail-best"),
      speedOptions: $("speed-options"),
      detailStart: $("detail-start"),
      playExit: $("play-exit"),
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
      loading: $("rhythm-loading"),
      loadingText: $("loading-text"),
      count: $("rhythm-count"),
      countText: $("rhythm-count-text"),
      result: $("rhythm-result"),
      grade: $("rhythm-grade"),
      resultTitle: $("rhythm-result-title"),
      resultScore: $("rhythm-result-score"),
      resultAcc: $("rhythm-result-acc"),
      resultCombo: $("rhythm-result-combo"),
      resultDetail: $("rhythm-result-detail"),
      retry: $("rhythm-retry"),
      resultBack: $("rhythm-result-back"),
      judge: $("judge-pop"),
      lanePads: $("lane-pads")
    };
    els.ctx = els.canvas.getContext("2d");
    els.ctx.imageSmoothingEnabled = true;
  }

  /* ---------------- 通用 ---------------- */
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function formatAcc(n) {
    return (Math.round(n * 100) / 100).toFixed(2) + "%";
  }
  function padScore(n) {
    return String(Math.max(0, Math.round(n))).padStart(7, "0");
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function readBest(id) {
    try { return parseInt(localStorage.getItem("rhythm-best-" + id) || "0", 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(id, score) {
    try {
      if (score > readBest(id)) localStorage.setItem("rhythm-best-" + id, String(score));
    } catch (e) { /* ignore */ }
  }
  function readSpeed() {
    try {
      const v = parseFloat(localStorage.getItem("rhythm-speed") || "1");
      return SPEEDS.indexOf(v) >= 0 ? v : 1;
    } catch (e) { return 1; }
  }
  function storeSpeed(v) {
    try { localStorage.setItem("rhythm-speed", String(v)); } catch (e) { /* ignore */ }
  }

  function levelColor(level) {
    if (level >= 10) return "#ff5c9d";
    if (level >= 8) return "#c084fc";
    if (level >= 6) return "#63b3ff";
    if (level >= 4) return "#4be3d0";
    return "#8ef0a4";
  }

  /* ---------------- 选曲 ---------------- */
  function enter() {
    if (!songs.length) songs = window.RHYTHM_SONGS || [];
    active = true;
    if (!els) cache();
    bindOnce();
    stopGame();
    selectedSong = null;
    speed = readSpeed();
    showScreen("select");
    renderPack(selectedPack);
    setupSkin();
    requestAnimationFrame(resizeCanvas);
  }

  function exit() {
    active = false;
    startToken++;
    stopGame();
    if (els) {
      els.play.hidden = true;
      els.detail.hidden = true;
      els.select.hidden = false;
    }
  }

  function showScreen(name) {
    if (!els) return;
    els.select.hidden = name !== "select";
    els.detail.hidden = name !== "detail";
    els.play.hidden = name !== "play";
    window.scrollTo(0, 0);
    if (name === "play") requestAnimationFrame(resizeCanvas);
  }

  function renderPack(pack) {
    if (!els) return;
    selectedPack = pack;
    const info = PACKS[pack];
    els.packTabs.querySelectorAll("[data-pack]").forEach(function (btn) {
      const on = btn.dataset.pack === pack;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.packLabel.textContent = info.label;
    els.packLabel.style.color = info.color;
    els.packTitle.textContent = info.title;
    els.packDesc.textContent = info.desc;
    els.packStrip.style.borderColor = info.color + "33";
    els.packStrip.style.background =
      "radial-gradient(circle at 85% 20%, " + info.color + "22, transparent 46%)," +
      "linear-gradient(120deg, " + info.color + "14, rgba(12,15,27,.2))";
    const list = songs.filter(function (s) { return s.pack === pack; })
      .sort(function (a, b) { return a.level - b.level; });
    els.packCount.textContent = String(list.length);
    renderGrid(list);
  }

  function renderGrid(list) {
    els.grid.innerHTML = "";
    const frag = document.createDocumentFragment();
    list.forEach(function (song) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "chart-card";
      card.style.setProperty("--lv-color", levelColor(song.level));

      const img = document.createElement("img");
      img.src = song.cover;
      img.alt = song.title + " 封面";
      img.loading = "lazy";
      img.decoding = "async";

      const badge = document.createElement("span");
      badge.className = "chart-badge";
      badge.textContent = song.version;

      const info = document.createElement("span");
      info.className = "chart-info";
      const name = document.createElement("strong");
      name.textContent = song.title;
      const artist = document.createElement("span");
      artist.textContent = song.artist;
      const stats = document.createElement("span");
      stats.className = "chart-stats";
      stats.innerHTML = "BPM <b>" + song.bpm + "</b> · <b>" + song.notes + "</b> notes";
      info.appendChild(name);
      info.appendChild(artist);
      info.appendChild(stats);

      card.appendChild(img);
      card.appendChild(badge);
      card.appendChild(info);
      card.addEventListener("click", function () { selectSong(song); });
      frag.appendChild(card);
    });
    els.grid.appendChild(frag);
  }

  function selectSong(song) {
    if (!els) return;
    selectedSong = song;
    els.detailBg.src = song.cover;
    els.detailCover.src = song.cover;
    els.detailLevel.textContent = song.version;
    els.detailPack.textContent = PACKS[song.pack].label + " / " + song.version;
    els.detailTitle.textContent = song.title;
    els.detailArtist.textContent = song.artist;
    els.detailBpm.textContent = String(song.bpm);
    els.detailNotes.textContent = String(song.notes);
    els.detailLn.textContent = String(song.ln);
    els.detailMapper.textContent = song.mapper || "—";
    els.detailLength.textContent = formatTime(song.duration);
    els.detailBest.textContent = "最高分：" + (readBest(song.id) ? readBest(song.id).toLocaleString("en-US") : "—");
    setSpeedUI();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    preloadSong(song);
    showScreen("detail");
  }

  function setSpeedUI() {
    els.speedOptions.querySelectorAll("[data-speed]").forEach(function (btn) {
      btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed);
    });
  }

  /* ---------------- 音频 ---------------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "auto";
    audio.volume = 0.9;
    audio.addEventListener("ended", function () {
      if (active && game && game.running) finishGame();
    });
    audio.addEventListener("error", function () {
      if (active && game && game.running) {
        toast("音频加载失败，检查一下网络或换一张谱面");
      }
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

  // iOS Safari 等浏览器要求播放必须紧挨用户点击；先在点击时静音试播一下。
  function unlockAudio() {
    const a = ensureAudio();
    const token = ++unlockToken;
    a.volume = 0;
    let promise;
    try {
      promise = a.play();
    } catch (e) {
      a.volume = 0.9;
      return;
    }
    if (promise && promise.then) {
      promise.then(function () {
        if (token !== unlockToken) return;
        if (!game || !game.running) {
          a.pause();
          try { a.currentTime = 0; } catch (e) { /* ignore */ }
        }
        a.volume = 0.9;
      }).catch(function () {
        a.volume = 0.9;
      });
    } else {
      a.volume = 0.9;
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
      loadImage("skin-key-down.png")
    ]).then(function (imgs) {
      skin = {
        tap: [],
        ln: [],
        keyUp: imgs[2],
        keyDown: imgs[3]
      };
      for (let lane = 0; lane < 4; lane++) {
        skin.tap[lane] = makeNoteSprite(imgs[0], LANE_COLORS[lane], false);
        skin.ln[lane] = makeNoteSprite(imgs[1], LANE_COLORS[lane], true);
      }
      return skin;
    }).catch(function () {
      skin = { tap: [null, null, null, null], ln: [null, null, null, null], keyUp: null, keyDown: null };
      return skin;
    });
    return skinPromise;
  }

  function makeNoteSprite(img, color, isLn) {
    const size = 190;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const x = c.getContext("2d");
    if (!img) {
      x.fillStyle = color;
      x.beginPath();
      x.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
      x.fill();
      return c;
    }
    const w = 150;
    const h = 146;
    const dx = (size - w) / 2;
    const dy = (size - h) / 2;
    x.save();
    x.shadowColor = color;
    x.shadowBlur = 16;
    x.globalAlpha = 0.9;
    x.drawImage(img, dx, dy, w, h);
    x.restore();
    x.save();
    x.globalCompositeOperation = "source-atop";
    x.globalAlpha = isLn ? 0.42 : 0.24;
    x.fillStyle = color;
    x.fillRect(0, 0, size, size);
    x.restore();
    x.strokeStyle = color;
    x.globalAlpha = isLn ? 0.9 : 0.55;
    x.lineWidth = isLn ? 3 : 2;
    x.beginPath();
    x.arc(size / 2, size / 2, 72, 0, Math.PI * 2);
    x.stroke();
    x.globalAlpha = 1;
    return c;
  }

  /* ---------------- 谱面加载 ---------------- */
  function loadCharts() {
    if (window.RHYTHM_CHARTS) return Promise.resolve(window.RHYTHM_CHARTS);
    if (chartPromise) return chartPromise;
    chartPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "charts-data.js";
      script.onload = function () {
        if (window.RHYTHM_CHARTS) resolve(window.RHYTHM_CHARTS);
        else {
          chartPromise = null;
          reject(new Error("chart data missing"));
        }
      };
      script.onerror = function () {
        chartPromise = null;
        reject(new Error("chart data failed"));
      };
      document.head.appendChild(script);
    });
    return chartPromise;
  }

  /* ---------------- 开始 ---------------- */
  async function startGame() {
    if (!active || !selectedSong) return;
    const song = selectedSong;
    const token = ++startToken;
    unlockAudio();
    showScreen("play");
    els.loading.hidden = false;
    els.count.hidden = true;
    els.result.hidden = true;
    els.judge.className = "judge-pop";
    els.loadingText.textContent = "正在加载谱面与音频…";
    loadStep = "charts";
    loadError = "";
    els.playTitle.textContent = song.title;
    els.playSub.textContent = PACKS[song.pack].label + " · " + song.version + " · " + song.artist;
    els.playDuration.textContent = formatTime(song.duration);
    els.playTime.textContent = "0:00";
    els.playFill.style.width = "0%";
    els.detailStart.disabled = true;
    game = null;

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
      runCountdown(token);
    } catch (err) {
      loadStep = "error";
      loadError = err && err.message ? err.message : String(err);
      if (token !== startToken) return;
      els.loading.hidden = true;
      toast("谱面或音频加载失败，再试一次吧");
      showScreen("detail");
    } finally {
      if (els) els.detailStart.disabled = false;
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
    const travel = clamp((60000 / Math.max(60, song.bpm)) * 4 / speed, 580, 2600);

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
      running: false,
      finished: false,
      time: 0,
      lastDraw: 0,
      lastUi: 0,
      lastFrame: 0,
      raf: 0,
      travel: travel,
      lnCount: lnCount,
      endAt: last + 2200,
      missCursor: 0,
      coverImage: null
    };
    g.coverImage = new Image();
    g.coverImage.onload = function () { if (game === g) renderStatic(); };
    g.coverImage.src = song.cover;
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
      audio.volume = 0.9;
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      if (token !== startToken) return;
      toast("浏览器没允许播放音频，请再点一次开始");
      stopGame();
      showScreen("detail");
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
    game.raf = requestAnimationFrame(loop);
  }

  /* ---------------- 判定 ---------------- */
  function updateHud() {
    if (!els || !game) {
      if (els) {
        els.score.textContent = "0000000";
        els.combo.textContent = "0";
        els.acc.textContent = "100.00%";
      }
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

  function registerHit(kind, isTail, lane) {
    if (!game) return;
    game.judged++;
    game[kind]++;
    game.weighted += WEIGHT[kind];
    game.score += POINT[kind];
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    flashJudge(kind);
    spawnBurst(lane, isTail ? 7 : (kind === "perfect" ? 10 : 6));
    updateHud();
  }

  function registerMiss() {
    if (!game) return;
    game.judged++;
    game.miss++;
    game.combo = 0;
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    const now = performance.now();
    if (now - lastMissFlash > 90) {
      lastMissFlash = now;
      flashJudge("miss");
    }
    updateHud();
  }

  function gradeFor(delta) {
    if (delta <= WINDOW.perfect) return "perfect";
    if (delta <= WINDOW.great) return "great";
    if (delta <= WINDOW.good) return "good";
    if (delta <= WINDOW.bad) return "bad";
    return null;
  }

  function lowerBound(arr, t) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
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
    if (!active || !game || !game.running || game.finished) return;
    if (game.keyDown[lane]) return;
    game.keyDown[lane] = true;
    game.laneGlow[lane] = performance.now();
    setPadPressed(lane, true);

    const t = game.time;
    const activeHold = game.activeHolds[lane];
    if (activeHold && t <= activeHold.end) activeHold.holding = true;

    const arr = game.laneNotes[lane];
    const start = laneLowerBound(lane, t);
    let best = null;
    let bestDelta = Infinity;
    for (let i = Math.max(0, start - 6); i < Math.min(arr.length, start + 8); i++) {
      const note = game.notes[arr[i]];
      if (note.judged) continue;
      const d = Math.abs(note.time - t);
      if (d < bestDelta) {
        bestDelta = d;
        best = note;
      }
    }
    if (!best || bestDelta > WINDOW.bad) return;

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
    setPadPressed(lane, false);
  }

  function setPadPressed(lane, on) {
    if (!els) return;
    const pad = els.lanePads.querySelector('[data-lane="' + lane + '"]');
    if (pad) pad.classList.toggle("pressed", !!on);
  }

  function updateGame(t, dt) {
    if (!game || !game.running) return;

    // 错过的单点 / 长条头部
    while (game.missCursor < game.notes.length) {
      const note = game.notes[game.missCursor];
      if (note.time >= t - WINDOW.miss) break;
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

    // 长条尾巴：到点还按着（或刚松开 90ms 内）才算完成
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

  function spawnBurst(lane, count) {
    if (!game || !dims.w) return;
    const layout = getLayout();
    const chosen = lane;
    const x = layout.boardX + chosen * layout.laneW + layout.laneW / 2;
    const y = layout.judgeY;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 80 + Math.random() * 170;
      game.particles.push({
        x: x + (Math.random() - 0.5) * layout.laneW * 0.32,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.28,
        maxLife: 0.58,
        color: LANE_COLORS[chosen]
      });
    }
    if (game.particles.length > 110) {
      game.particles.splice(0, game.particles.length - 110);
    }
  }

  function finishGame() {
    if (!game || game.finished) return;
    game.finished = true;
    game.running = false;
    cancelAnimationFrame(game.raf);
    game.raf = 0;
    if (audio) audio.pause();

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
    game.combo = 0;
    game.accuracy = game.judged ? (game.weighted / game.judged) * 100 : 100;
    updateHud();
    els.playFill.style.width = "100%";

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
    els.result.hidden = false;
    els.loading.hidden = true;
    els.count.hidden = true;
    els.judge.className = "judge-pop";
    saveBest(game.song.id, game.score);
    const best = readBest(game.song.id);
    els.detailBest.textContent = "最高分：" + (best ? best.toLocaleString("en-US") : "—");
  }

  /* ---------------- 主循环 ---------------- */
  function loop(ts) {
    if (!game || !game.running) return;
    const t = Math.max(0, audio.currentTime * 1000);
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
    const boardW = Math.min(w - (w < 640 ? 24 : 72), 680);
    const boardX = (w - boardW) / 2;
    const laneW = boardW / 4;
    const judgeY = h * 0.78;
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
    renderStatic();
    if (game) drawFrame(game.time);
  }

  function drawCoverFit(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const br = w / h;
    let dw, dh, dx, dy;
    if (ir > br) {
      dh = h;
      dw = h * ir;
      dx = x + (w - dw) / 2;
      dy = y;
    } else {
      dw = w;
      dh = w / ir;
      dx = x;
      dy = y + (h - dh) / 2;
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

    // 封面做很淡的背景
    if (game && game.coverImage && game.coverImage.complete && game.coverImage.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      drawCoverFit(ctx, game.coverImage, 0, 0, L.w, L.h);
      ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, "rgba(6,8,16,0.82)");
    bg.addColorStop(0.55, "rgba(7,9,18,0.65)");
    bg.addColorStop(1, "rgba(9,11,22,0.95)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.w, L.h);

    ctx.save();
    roundRect(ctx, L.boardX, 0, L.boardW, L.h, 14);
    ctx.clip();

    const boardBg = ctx.createLinearGradient(0, 0, 0, L.h);
    boardBg.addColorStop(0, "rgba(4,6,13,0.36)");
    boardBg.addColorStop(0.72, "rgba(5,7,15,0.78)");
    boardBg.addColorStop(1, "rgba(9,12,24,0.94)");
    ctx.fillStyle = boardBg;
    ctx.fillRect(L.boardX, 0, L.boardW, L.h);

    for (let i = 0; i < 4; i++) {
      const x = L.boardX + i * L.laneW;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.014)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(x, 0, L.laneW, L.h);
    }
    for (let i = 1; i < 4; i++) {
      const x = L.boardX + i * L.laneW;
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.h);
      ctx.stroke();
    }

    // 顶部和底部渐隐
    const topFade = ctx.createLinearGradient(0, 0, 0, 110);
    topFade.addColorStop(0, "rgba(5,7,15,0.92)");
    topFade.addColorStop(1, "rgba(5,7,15,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(L.boardX, 0, L.boardW, 110);
    const bottomFade = ctx.createLinearGradient(0, L.judgeY + 50, 0, L.h);
    bottomFade.addColorStop(0, "rgba(5,7,15,0)");
    bottomFade.addColorStop(1, "rgba(5,7,15,0.9)");
    ctx.fillStyle = bottomFade;
    ctx.fillRect(L.boardX, L.judgeY + 50, L.boardW, L.h - L.judgeY - 50);

    // 判定线
    const line = ctx.createLinearGradient(L.boardX, 0, L.boardX + L.boardW, 0);
    line.addColorStop(0, "rgba(255,255,255,0)");
    line.addColorStop(0.12, "rgba(255,255,255,0.7)");
    line.addColorStop(0.5, "#ffffff");
    line.addColorStop(0.88, "rgba(255,255,255,0.7)");
    line.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(L.boardX, L.judgeY);
    ctx.lineTo(L.boardX + L.boardW, L.judgeY);
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const x = L.boardX + i * L.laneW + L.laneW / 2;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "600 10px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(KEYS[i], x, L.h - 8);
    }
    ctx.restore();

    // 两侧细边
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 1;
    ctx.strokeRect(L.boardX + 0.5, 0.5, L.boardW - 1, L.h - 1);
  }

  function drawFrame(t) {
    if (!els || !dims.w || !game) return;
    const L = getLayout();
    const ctx = els.ctx;
    ctx.clearRect(0, 0, L.w, L.h);
    if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, L.w, L.h);

    // 按键轨道光
    const now = performance.now();
    for (let lane = 0; lane < 4; lane++) {
      const elapsed = now - game.laneGlow[lane];
      if (elapsed >= 0 && elapsed < 160) {
        ctx.globalAlpha = (1 - elapsed / 160) * 0.1;
        ctx.fillStyle = LANE_COLORS[lane];
        ctx.fillRect(L.boardX + lane * L.laneW, L.judgeY - 190, L.laneW, 190);
      }
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(L.boardX, 0, L.boardW, L.judgeY + 10);
    ctx.clip();

    drawActiveHolds(ctx, L, t);
    drawNotes(ctx, L, t);
    ctx.restore();

    drawKeys(ctx, L);
    drawParticles(ctx);
  }

  function drawNotes(ctx, L, t) {
    const notes = game.notes;
    let start = 0;
    let lo = 0;
    let hi = notes.length;
    const from = t - 360;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].time < from) lo = mid + 1;
      else hi = mid;
    }
    start = lo;
    for (let i = start; i < notes.length; i++) {
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
    const w = L.laneW * 0.4;
    const x = L.boardX + note.lane * L.laneW + (L.laneW - w) / 2;
    const top = Math.max(-20, Math.min(tailY, headY));
    const bottom = Math.min(L.judgeY + 10, Math.max(tailY, headY));
    if (bottom - top < 1) return;
    ctx.fillStyle = LANE_COLORS[note.lane];
    ctx.globalAlpha = active ? 0.42 : 0.22;
    ctx.fillRect(x, top, w, bottom - top);
    ctx.globalAlpha = active ? 0.9 : 0.55;
    ctx.strokeStyle = LANE_COLORS[note.lane];
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top, w - 1, bottom - top);
    ctx.globalAlpha = 1;

    const capY = Math.max(-20, Math.min(L.judgeY + 8, tailY));
    ctx.fillStyle = LANE_COLORS[note.lane];
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x - 2, capY - 4, w + 4, 8, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawNoteHead(ctx, L, note, y) {
    const sprite = note.end > 0 ? (skin && skin.ln[note.lane]) : (skin && skin.tap[note.lane]);
    const size = L.laneW * 0.55;
    const h = size * 0.97;
    const alpha = clamp((y + 70) / 90, 0.15, 1);
    ctx.globalAlpha = alpha;
    if (sprite) {
      ctx.drawImage(sprite, L.boardX + note.lane * L.laneW + (L.laneW - size) / 2, y - h / 2, size, h);
    } else {
      ctx.fillStyle = LANE_COLORS[note.lane];
      ctx.beginPath();
      ctx.arc(L.boardX + note.lane * L.laneW + L.laneW / 2, y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawKeys(ctx, L) {
    if (!skin) return;
    const keyH = Math.min(L.laneW * 1.75, L.h - L.judgeY - 8);
    const keyW = keyH * 0.4;
    const y = L.h - keyH - 2;
    for (let lane = 0; lane < 4; lane++) {
      const x = L.boardX + lane * L.laneW + (L.laneW - keyW) / 2;
      const img = game.keyDown[lane] ? skin.keyDown : skin.keyUp;
      if (img) {
        ctx.globalAlpha = 0.88;
        ctx.drawImage(img, x, y, keyW, keyH);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, keyW, keyH, keyW / 2);
        ctx.stroke();
      }
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

  /* ---------------- 输入 ---------------- */
  function keyToLane(key) {
    const map = {
      d: 0, f: 1, j: 2, k: 3,
      D: 0, F: 1, J: 2, K: 3,
      ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3
    };
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : -1;
  }

  function onKeyDown(e) {
    if (!active || !game || !game.running || e.repeat) return;
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

    els.packTabs.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-pack]");
      if (btn) renderPack(btn.dataset.pack);
    });

    els.speedOptions.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-speed]");
      if (!btn) return;
      speed = parseFloat(btn.dataset.speed);
      storeSpeed(speed);
      setSpeedUI();
    });

    els.detailBack.addEventListener("click", function () {
      if (audio) audio.pause();
      showScreen("select");
    });
    els.detailStart.addEventListener("click", startGame);
    els.playExit.addEventListener("click", function () {
      stopGame();
      showScreen("detail");
    });
    els.retry.addEventListener("click", startGame);
    els.resultBack.addEventListener("click", function () {
      stopGame();
      showScreen("select");
    });

    els.lanePads.addEventListener("pointerdown", function (e) {
      const btn = e.target.closest("[data-lane]");
      if (!btn) return;
      e.preventDefault();
      const lane = parseInt(btn.dataset.lane, 10);
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      pressLane(lane);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (evt) {
      els.lanePads.addEventListener(evt, function (e) {
        const btn = e.target.closest("[data-lane]");
        if (!btn) return;
        releaseLane(parseInt(btn.dataset.lane, 10));
      });
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", function () {
      if (!game) return;
      for (let i = 0; i < 4; i++) releaseLane(i);
    });
    window.addEventListener("resize", function () {
      if (active && els && !els.play.hidden) {
        resizeCanvas();
      }
    });
  }

  /* ---------------- 清理 ---------------- */
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
    if (els) {
      els.count.hidden = true;
      els.loading.hidden = true;
      els.result.hidden = true;
      els.judge.className = "judge-pop";
      for (let i = 0; i < 4; i++) setPadPressed(i, false);
    }
  }

  /* ---------------- 对外接口 ---------------- */
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
        audioSrc: audio ? audio.src.split("/").slice(-2).join("/") : "",
        audioPaused: audio ? audio.paused : true,
        audioTime: audio ? Math.round(audio.currentTime * 1000) : 0,
        audioDuration: audio && isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0
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
        notes: game.notes.length
      });
    }
  };
})();
