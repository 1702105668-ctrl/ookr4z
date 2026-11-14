/* =========================================================
   听歌 · 内置合成轻音乐 + 本地音乐播放器
   ========================================================= */
(function () {
  "use strict";

  const DEMO_TITLE = "星尘漫游";
  const DEMO_BPM = 78;
  const DEMO_BEAT = 60 / DEMO_BPM;

  let els = null;
  let bound = false;
  let active = false;
  let visRaf = 0;

  const state = {
    ctx: null,
    master: null,
    analyser: null,
    demoBus: null,
    delay: null,
    noise: null,
    demoPlaying: false,
    demoTimer: 0,
    nextNoteTime: 0,
    beatIndex: 0,
    mode: null, // 'demo' | 'local' | null
    volume: 0.65,
    tab: "demo",
    playlist: [],
    index: -1,
    localUrl: null
  };

  function $(id) { return document.getElementById(id); }
  function toast(message) {
    document.dispatchEvent(new CustomEvent("site:toast", { detail: { message: message } }));
  }

  function cacheEls() {
    els = {
      tabs: document.querySelectorAll("[data-music-tab]"),
      paneDemo: $("music-pane-demo"),
      paneLocal: $("music-pane-local"),
      demoToggle: $("demo-toggle"),
      recordWrap: $("record-wrap"),
      vis: $("music-visualizer"),
      volume: $("music-volume"),
      files: $("music-files"),
      playlist: $("playlist"),
      playlistCount: $("playlist-count"),
      playlistClear: $("playlist-clear"),
      audio: $("local-audio"),
      localTitle: $("local-title"),
      localToggle: $("local-toggle"),
      localPrev: $("local-prev"),
      localNext: $("local-next"),
      localCurrent: $("local-current"),
      localDuration: $("local-duration"),
      localProgress: $("local-progress")
    };
    els.visCtx = els.vis.getContext("2d");
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function emitState() {
    const playing = state.mode === "demo"
      ? state.demoPlaying
      : state.mode === "local"
        ? !!(els && els.audio && !els.audio.paused)
        : false;
    const title = state.mode === "demo"
      ? DEMO_TITLE
      : state.mode === "local" && state.index >= 0 && state.playlist[state.index]
        ? state.playlist[state.index].title
        : "";
    document.dispatchEvent(new CustomEvent("music:state", {
      detail: { playing: playing, title: title, mode: state.mode }
    }));
  }

  /* ---------------- 内置合成音乐 ---------------- */
  function ensureContext() {
    if (state.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      toast("当前浏览器不支持网页音频，换 Chrome 或 Edge 试试");
      return false;
    }
    try {
      state.ctx = new AC();
      state.master = state.ctx.createGain();
      state.master.gain.value = state.volume;
      state.analyser = state.ctx.createAnalyser();
      state.analyser.fftSize = 128;
      state.analyser.smoothingTimeConstant = 0.82;
      state.master.connect(state.analyser);
      state.analyser.connect(state.ctx.destination);

      state.demoBus = state.ctx.createGain();
      state.demoBus.gain.value = 1;
      state.demoBus.connect(state.master);

      state.delay = state.ctx.createDelay(1.0);
      state.delay.delayTime.value = 0.34;
      const fb = state.ctx.createGain();
      fb.gain.value = 0.3;
      const wet = state.ctx.createGain();
      wet.gain.value = 0.22;
      state.delay.connect(fb);
      fb.connect(state.delay);
      state.delay.connect(wet);
      wet.connect(state.demoBus);

      const len = Math.floor(state.ctx.sampleRate * 1.1);
      state.noise = state.ctx.createBuffer(1, len, state.ctx.sampleRate);
      const data = state.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (err) {
      state.ctx = null;
      toast("音频初始化失败，换一个浏览器试试");
      return false;
    }
  }

  function env(gain, time, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }

  function softKick(time) {
    const o = state.ctx.createOscillator();
    const g = state.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(105, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    env(g, time, 0.19, 0.005, 0.24);
    o.connect(g);
    g.connect(state.demoBus);
    o.start(time);
    o.stop(time + 0.32);
  }

  function brush(time) {
    const src = state.ctx.createBufferSource();
    src.buffer = state.noise;
    const hp = state.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600;
    const g = state.ctx.createGain();
    env(g, time, 0.028, 0.003, 0.08);
    src.connect(hp);
    hp.connect(g);
    g.connect(state.demoBus);
    src.start(time);
    src.stop(time + 0.12);
  }

  function bass(freq, time, peak) {
    const o = state.ctx.createOscillator();
    const g = state.ctx.createGain();
    const lp = state.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + DEMO_BEAT * 0.9);
    o.connect(lp);
    lp.connect(g);
    g.connect(state.demoBus);
    o.start(time);
    o.stop(time + DEMO_BEAT);
  }

  function pad(freq, time, peak, pan) {
    for (let d = -1; d <= 1; d += 2) {
      const o = state.ctx.createOscillator();
      const g = state.ctx.createGain();
      const p = state.ctx.createStereoPanner();
      const lp = state.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1000;
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = d * 4;
      p.pan.value = pan * 0.5;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(peak, time + 0.8);
      g.gain.setValueAtTime(peak, time + DEMO_BEAT * 2.6);
      g.gain.exponentialRampToValueAtTime(0.0001, time + DEMO_BEAT * 4);
      o.connect(lp);
      lp.connect(g);
      g.connect(p);
      p.connect(state.demoBus);
      o.start(time);
      o.stop(time + DEMO_BEAT * 4 + 0.1);
    }
  }

  function pluck(freq, time) {
    const o = state.ctx.createOscillator();
    const g = state.ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.042, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    o.connect(g);
    g.connect(state.demoBus);
    g.connect(state.delay);
    o.start(time);
    o.stop(time + 0.5);
  }

  function scheduleDemoBeat(beatIndex, time) {
    const chords = [
      [220, 261.63, 329.63, 392],
      [174.61, 220, 261.63, 329.63],
      [261.63, 329.63, 392, 493.88],
      [196, 246.94, 293.66, 392]
    ];
    const roots = [110, 87.31, 130.81, 98];
    const melody = [440, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];
    const bar = Math.floor(beatIndex / 4);
    const b = beatIndex % 4;
    const chord = chords[bar % 4];

    if (b === 0) {
      for (let i = 0; i < chord.length; i++) {
        pad(chord[i], time, 0.013, i - 1.5);
      }
    }
    bass(roots[bar % 4], time, 0.075);
    if (b === 0 || b === 2) softKick(time);
    if (b === 1 || b === 3) brush(time);
    brush(time + DEMO_BEAT * 0.5);
    if (bar >= 1) {
      const note = melody[(beatIndex * 3 + bar) % melody.length];
      pluck(note, time + (b === 3 ? DEMO_BEAT * 0.5 : 0));
    }
  }

  function scheduler() {
    if (!state.ctx || !state.demoPlaying) return;
    while (state.nextNoteTime < state.ctx.currentTime + 0.3) {
      scheduleDemoBeat(state.beatIndex, state.nextNoteTime);
      state.nextNoteTime += DEMO_BEAT;
      state.beatIndex++;
    }
  }

  function setDemoPlayingUI(playing) {
    if (!els) return;
    els.demoToggle.textContent = playing ? "⏸" : "▶";
    els.demoToggle.setAttribute("aria-label", playing ? "暂停内置音乐" : "播放内置音乐");
    els.recordWrap.classList.toggle("is-playing", playing);
  }

  async function playDemo() {
    if (!ensureContext()) return;
    if (state.ctx.state === "suspended") {
      try { await state.ctx.resume(); } catch (e) { /* ignore */ }
    }
    if (state.mode === "local" && els.audio && !els.audio.paused) {
      els.audio.pause();
    }
    state.mode = "demo";
    state.demoPlaying = true;
    state.beatIndex = 0;
    state.nextNoteTime = state.ctx.currentTime + 0.12;
    state.demoBus.gain.cancelScheduledValues(state.ctx.currentTime);
    state.demoBus.gain.setTargetAtTime(1, state.ctx.currentTime, 0.05);
    clearInterval(state.demoTimer);
    state.demoTimer = setInterval(scheduler, 90);
    scheduler();
    setDemoPlayingUI(true);
    updateLocalUI();
    emitState();
    startVisualizer();
  }

  function pauseDemo() {
    state.demoPlaying = false;
    clearInterval(state.demoTimer);
    state.demoTimer = 0;
    if (state.ctx && state.demoBus) {
      state.demoBus.gain.cancelScheduledValues(state.ctx.currentTime);
      state.demoBus.gain.setTargetAtTime(0.0001, state.ctx.currentTime, 0.06);
    }
    setDemoPlayingUI(false);
    emitState();
  }

  function toggleDemo() {
    if (state.demoPlaying) pauseDemo();
    else playDemo();
  }

  /* ---------------- 本地音乐 ---------------- */
  function renderPlaylist() {
    if (!els) return;
    els.playlistCount.textContent = String(state.playlist.length);
    els.playlist.innerHTML = "";
    if (!state.playlist.length) {
      const li = document.createElement("li");
      li.className = "playlist-empty";
      li.textContent = "还没有歌曲，点上面的框选几首吧。";
      els.playlist.appendChild(li);
      return;
    }
    state.playlist.forEach(function (track, i) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.index = String(i);
      btn.className = i === state.index ? "active" : "";
      btn.innerHTML =
        '<span class="track-index">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="track-name"></span>' +
        (i === state.index ? '<span class="playing-dot">● 当前</span>' : "");
      btn.querySelector(".track-name").textContent = track.title;
      btn.addEventListener("click", function () { playLocal(i); });
      li.appendChild(btn);
      els.playlist.appendChild(li);
    });
  }

  function updateLocalUI() {
    if (!els) return;
    const hasTrack = state.index >= 0 && state.playlist[state.index];
    els.localTitle.textContent = hasTrack ? state.playlist[state.index].title : "—";
    const playing = hasTrack && !els.audio.paused && state.mode === "local";
    els.localToggle.textContent = playing ? "⏸" : "▶";
    els.localToggle.setAttribute("aria-label", playing ? "暂停" : "播放");
    if (hasTrack) {
      els.localCurrent.textContent = formatTime(els.audio.currentTime);
      els.localDuration.textContent = formatTime(els.audio.duration);
      if (isFinite(els.audio.duration) && els.audio.duration > 0) {
        els.localProgress.value = String(Math.round((els.audio.currentTime / els.audio.duration) * 1000));
      }
    } else {
      els.localCurrent.textContent = "0:00";
      els.localDuration.textContent = "0:00";
      els.localProgress.value = "0";
    }
  }

  function playLocal(index) {
    if (!state.playlist.length) {
      toast("还没有歌曲，先点上面的框选音乐文件");
      return;
    }
    if (index < 0) index = 0;
    if (index >= state.playlist.length) index = 0;
    const track = state.playlist[index];
    const changed = state.index !== index || state.localUrl !== track.url;
    state.index = index;
    state.localUrl = track.url;
    state.mode = "local";

    if (state.demoPlaying) pauseDemo();
    state.mode = "local";

    if (changed) {
      els.audio.src = track.url;
      els.audio.load();
    }
    renderPlaylist();
    const promise = els.audio.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        toast("这首歌暂时放不了，可能是格式不被浏览器支持");
        updateLocalUI();
        emitState();
      });
    }
    updateLocalUI();
    emitState();
    startVisualizer();
  }

  function toggleLocal() {
    if (!state.playlist.length) {
      toast("先选择几首本地音乐吧");
      return;
    }
    if (state.index < 0) {
      playLocal(0);
      return;
    }
    if (state.mode !== "local") {
      state.mode = "local";
      if (!els.audio.src) {
        playLocal(state.index);
        return;
      }
    }
    if (els.audio.paused) {
      if (state.demoPlaying) pauseDemo();
      state.mode = "local";
      if (els.audio.ended) els.audio.currentTime = 0;
      const p = els.audio.play();
      if (p && p.catch) p.catch(function () { toast("播放失败，试试换一首歌"); });
    } else {
      els.audio.pause();
    }
  }

  function stepLocal(delta) {
    if (!state.playlist.length) {
      toast("播放列表还是空的");
      return;
    }
    let next = state.index + delta;
    if (next < 0) next = state.playlist.length - 1;
    if (next >= state.playlist.length) next = 0;
    playLocal(next);
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(function (f) {
      return f.type.indexOf("audio") === 0 || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name);
    });
    if (!files.length) {
      toast("没有找到可播放的音频文件");
      return;
    }
    files.forEach(function (file) {
      state.playlist.push({
        title: file.name.replace(/\.[^.]+$/, ""),
        url: URL.createObjectURL(file)
      });
    });
    if (state.index < 0 && state.playlist.length) state.index = 0;
    updateLocalUI();
    renderPlaylist();
    emitState();
    toast("已添加 " + files.length + " 首歌");
  }

  function clearPlaylist() {
    if (!state.playlist.length) return;
    if (!window.confirm("清空播放列表？不会删除你电脑里的文件。")) return;
    els.audio.pause();
    els.audio.removeAttribute("src");
    els.audio.load();
    state.playlist.forEach(function (track) {
      try { URL.revokeObjectURL(track.url); } catch (e) { /* ignore */ }
    });
    state.playlist = [];
    state.index = -1;
    state.localUrl = null;
    if (state.mode === "local") state.mode = null;
    updateLocalUI();
    renderPlaylist();
    emitState();
  }

  /* ---------------- 可视化 ---------------- */
  function resizeVisualizer() {
    if (!els || !els.vis) return;
    const rect = els.vis.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (state.visW === rect.width && state.visH === rect.height && state.visDpr === dpr) {
      return { w: rect.width, h: rect.height };
    }
    state.visW = rect.width;
    state.visH = rect.height;
    state.visDpr = dpr;
    els.vis.width = Math.round(rect.width * dpr);
    els.vis.height = Math.round(rect.height * dpr);
    els.visCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function drawVisualizer() {
    if (!active || !els) return;
    const size = resizeVisualizer();
    if (!size) return;
    const ctx = els.visCtx;
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);

    let data = null;
    if (state.analyser && state.demoPlaying) {
      data = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(data);
    }

    const bars = 52;
    const gap = 3;
    const barW = Math.max(2, (w - 24 - gap * (bars - 1)) / bars);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, "rgba(75,227,208,0.18)");
    grad.addColorStop(0.45, "rgba(75,227,208,0.8)");
    grad.addColorStop(1, "rgba(255,92,157,0.9)");

    for (let i = 0; i < bars; i++) {
      let value = 0;
      if (data) {
        const index = Math.floor((i / bars) * data.length * 0.72);
        value = data[index] / 255;
        value = Math.pow(value, 1.35);
      } else {
        value = 0.035 + 0.02 * Math.sin(Date.now() / 900 + i * 0.5);
      }
      const bh = Math.max(3, value * (h - 26));
      const x = 12 + i * (barW + gap);
      ctx.fillStyle = grad;
      ctx.globalAlpha = data ? 0.9 : 0.4;
      roundRect(ctx, x, h - 10 - bh, barW, bh, Math.min(3, barW / 2));
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 底部一条细线
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(12, h - 8, w - 24, 1);
  }

  function visualizerLoop() {
    if (!active) return;
    drawVisualizer();
    visRaf = requestAnimationFrame(visualizerLoop);
  }

  function startVisualizer() {
    if (!active) return;
    if (!visRaf) {
      visRaf = requestAnimationFrame(visualizerLoop);
    }
  }

  function stopVisualizer() {
    if (visRaf) cancelAnimationFrame(visRaf);
    visRaf = 0;
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

  /* ---------------- 界面切换 ---------------- */
  function setTab(name) {
    state.tab = name;
    if (!els) return;
    els.tabs.forEach(function (btn) {
      const on = btn.dataset.musicTab === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.paneDemo.hidden = name !== "demo";
    els.paneLocal.hidden = name !== "local";
    if (name === "demo") {
      requestAnimationFrame(function () {
        drawVisualizer();
      });
    }
  }

  /* ---------------- 绑定 ---------------- */
  function bindOnce() {
    if (bound) return;
    bound = true;

    els.tabs.forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.dataset.musicTab); });
    });

    els.demoToggle.addEventListener("click", toggleDemo);
    els.localToggle.addEventListener("click", toggleLocal);
    els.localPrev.addEventListener("click", function () { stepLocal(-1); });
    els.localNext.addEventListener("click", function () { stepLocal(1); });
    els.files.addEventListener("change", function (e) {
      addFiles(e.target.files);
      e.target.value = "";
    });
    els.playlistClear.addEventListener("click", clearPlaylist);

    els.audio.addEventListener("timeupdate", updateLocalUI);
    els.audio.addEventListener("loadedmetadata", updateLocalUI);
    els.audio.addEventListener("play", function () {
      state.mode = "local";
      updateLocalUI();
      emitState();
    });
    els.audio.addEventListener("pause", function () {
      updateLocalUI();
      emitState();
    });
    els.audio.addEventListener("ended", function () {
      if (state.playlist.length > 1) {
        stepLocal(1);
      } else {
        try { els.audio.currentTime = 0; } catch (e) { /* ignore */ }
        updateLocalUI();
        emitState();
      }
    });

    els.localProgress.addEventListener("input", function () {
      if (!isFinite(els.audio.duration) || !els.audio.duration) return;
      els.audio.currentTime = (parseInt(els.localProgress.value, 10) / 1000) * els.audio.duration;
    });

    els.volume.addEventListener("input", function () {
      state.volume = Math.max(0, Math.min(1, parseInt(els.volume.value, 10) / 100));
      if (state.master) state.master.gain.value = state.volume;
      els.audio.volume = state.volume;
      try { localStorage.setItem("music-volume", String(state.volume)); } catch (e) { /* ignore */ }
    });

    window.addEventListener("resize", function () {
      if (active) drawVisualizer();
    });
  }

  /* ---------------- 对外接口 ---------------- */
  window.MusicRoom = {
    enter: function () {
      if (!els) cacheEls();
      active = true;
      bindOnce();
      setTab(state.tab);
      setDemoPlayingUI(state.demoPlaying);
      updateLocalUI();
      renderPlaylist();
      startVisualizer();
    },
    exit: function () {
      active = false;
      stopVisualizer();
    },
    toggle: function () {
      if (state.mode === "demo") {
        if (state.demoPlaying) pauseDemo();
        else playDemo();
      } else if (state.mode === "local") {
        toggleLocal();
      } else {
        playDemo();
      }
    },
    stop: function () {
      if (state.demoPlaying) pauseDemo();
      if (els && els.audio) {
        els.audio.pause();
        try { els.audio.currentTime = 0; } catch (e) { /* ignore */ }
      }
      state.mode = null;
      updateLocalUI();
      emitState();
    }
  };

  // 初始化音量
  try {
    const savedVolume = localStorage.getItem("music-volume");
    if (savedVolume !== null) {
      const n = parseFloat(savedVolume);
      if (isFinite(n)) state.volume = Math.max(0, Math.min(1, n));
    }
  } catch (e) { /* ignore */ }

  document.addEventListener("DOMContentLoaded", function () {
    if (!els) cacheEls();
    if (els) {
      els.volume.value = String(Math.round(state.volume * 100));
      els.audio.volume = state.volume;
    }
  });
})();
