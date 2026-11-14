/* =========================================================
   打歌 · Phigros 风格 4K 节奏小游戏
   纯原生 JS，无任何外部依赖。
   ========================================================= */
(function () {
  "use strict";

  const LANES = 4;
  const BPM = 128;
  const BEAT = 60 / BPM;
  const SONG_BEATS = 64;
  const SONG_LENGTH = SONG_BEATS * BEAT;
  const HIT_WINDOW = 0.16;
  const PERFECT_WINDOW = 0.065;
  const LANE_COLORS = ["#ff6b9d", "#c084fc", "#4be3d0", "#ffd166"];
  const KEY_LABELS = ["D", "F", "J", "K"];

  const DIFFS = {
    easy: {
      label: "简单",
      step: 2,
      travel: 2.0,
      pattern: [0, 2, 1, 3, 2, 0, 3, 1],
      extraEvery: 4,
      extraOffset: 1,
      extraLaneShift: 1,
      chordEvery: 0
    },
    normal: {
      label: "普通",
      step: 1,
      travel: 1.7,
      pattern: [0, 1, 2, 3, 1, 0, 2, 3, 1, 2, 0, 3],
      extraEvery: 4,
      extraOffset: 0.5,
      extraLaneShift: 1,
      chordEvery: 0
    },
    hard: {
      label: "困难",
      step: 0.5,
      travel: 1.5,
      pattern: [0, 2, 1, 3, 0, 1, 2, 3, 2, 0, 3, 1, 1, 3, 0, 2],
      extraEvery: 0,
      extraOffset: 0,
      extraLaneShift: 1,
      chordEvery: 8
    }
  };

  let els = null;
  let state = null;
  let active = false;
  let bound = false;
  let dims = { w: 0, h: 0 };
  let selectedDiff = "easy";
  let toastFn = function () {};

  /* ---------------- 音频合成 ---------------- */
  function RhythmSound() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("当前浏览器不支持 Web Audio");
    this.ctx = new AC();
    this.nodes = [];
    this.noiseBuffer = this.makeNoise();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.52;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // 给旋律加一点回声，听起来更“星空”一点
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.29;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.23;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.16;
    this.delay.connect(feedback);
    feedback.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.master);
  }

  RhythmSound.prototype.makeNoise = function () {
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  };

  RhythmSound.prototype.start = async function () {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.startAt = this.ctx.currentTime + 0.3;
    this.scheduleSong(this.startAt);
    return this.startAt;
  };

  RhythmSound.prototype.now = function () {
    return this.ctx.currentTime - this.startAt;
  };

  RhythmSound.prototype.stop = function () {
    const ctx = this.ctx;
    for (const node of this.nodes) {
      try { node.stop(); } catch (e) { /* already stopped */ }
    }
    this.nodes = [];
    try {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
    setTimeout(function () {
      try { ctx.close(); } catch (e) { /* ignore */ }
    }, 160);
  };

  RhythmSound.prototype.envelope = function (gain, time, peak, attack, decay, sustain) {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay + (sustain || 0));
  };

  RhythmSound.prototype.kick = function (time) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(155, time);
    o.frequency.exponentialRampToValueAtTime(44, time + 0.14);
    this.envelope(g, time, 0.72, 0.004, 0.20);
    o.connect(g);
    g.connect(this.master);
    o.start(time);
    o.stop(time + 0.3);
    this.nodes.push(o);
  };

  RhythmSound.prototype.snare = function (time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1100;
    const g = this.ctx.createGain();
    this.envelope(g, time, 0.2, 0.003, 0.14);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(time);
    src.stop(time + 0.22);
    this.nodes.push(src);
  };

  RhythmSound.prototype.hat = function (time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7400;
    const g = this.ctx.createGain();
    this.envelope(g, time, 0.038, 0.002, 0.04);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(time);
    src.stop(time + 0.08);
    this.nodes.push(src);
  };

  RhythmSound.prototype.bass = function (freq, time, dur, peak) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    o.start(time);
    o.stop(time + dur + 0.03);
    this.nodes.push(o);
  };

  RhythmSound.prototype.pluck = function (freq, time, dur, peak) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = 0.12;
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(p);
    p.connect(this.master);
    p.connect(this.delay);
    o.start(time);
    o.stop(time + dur + 0.03);
    this.nodes.push(o);
  };

  RhythmSound.prototype.pad = function (freq, time, dur, peak, pan) {
    for (let d = -1; d <= 1; d += 2) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const p = this.ctx.createStereoPanner();
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      p.pan.value = pan * 0.45;
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = d * 5;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(peak, time + 0.55);
      g.gain.setValueAtTime(peak, time + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o.connect(lp);
      lp.connect(g);
      g.connect(p);
      p.connect(this.master);
      o.start(time);
      o.stop(time + dur + 0.05);
      this.nodes.push(o);
    }
  };

  RhythmSound.prototype.hit = function (perfect) {
    if (!this.ctx || this.ctx.state === "closed") return;
    const t = this.ctx.currentTime + 0.001;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(perfect ? 1320 : 990, t);
    o.frequency.exponentialRampToValueAtTime(perfect ? 1760 : 1180, t + 0.04);
    this.envelope(g, t, 0.055, 0.002, 0.07);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.12);
  };

  RhythmSound.prototype.miss = function () {
    if (!this.ctx || this.ctx.state === "closed") return;
    const t = this.ctx.currentTime + 0.001;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(82, t + 0.1);
    this.envelope(g, t, 0.045, 0.003, 0.12);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.18);
  };

  RhythmSound.prototype.scheduleSong = function (t0) {
    const roots = [110, 87.31, 130.81, 98];
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [261.63, 329.63, 392],
      [196, 246.94, 293.66]
    ];
    const melodyPattern = [0, 2, 1, 3, 2, 0, 3, 1];

    for (let bar = 0; bar < SONG_BEATS / 4; bar++) {
      const barStart = t0 + bar * 4 * BEAT;
      const chord = chords[bar % 4];

      // 和弦铺底
      for (let i = 0; i < chord.length; i++) {
        this.pad(chord[i], barStart, 3.85 * BEAT, 0.019, i - 1);
      }

      for (let b = 0; b < 4; b++) {
        const t = barStart + b * BEAT;
        this.bass(roots[bar % 4] * (b === 3 ? 1.5 : 1), t, 0.42, b === 0 ? 0.105 : 0.07);
        if (b === 0 || b === 2) this.kick(t);
        if (b === 1 || b === 3) this.snare(t);
        this.hat(t + BEAT * 0.5);
      }

      // 旋律：前两小节留白，让画面先进入
      if (bar >= 2) {
        for (let e = 0; e < 8; e++) {
          const idx = melodyPattern[(bar * 8 + e) % melodyPattern.length];
          let freq = chord[idx % chord.length];
          if (e % 4 === 3) freq *= 2;
          this.pluck(freq, barStart + e * 0.5 * BEAT, 0.22, e % 2 === 0 ? 0.04 : 0.028);
        }
      }
    }
  };

  /* ---------------- 谱面 ---------------- */
  function buildChart(diffKey) {
    const cfg = DIFFS[diffKey];
    const notes = [];
    const seen = new Set();
    let idx = 0;

    function add(beat, lane) {
      if (beat < 0 || beat >= SONG_BEATS) return;
      const time = beat * BEAT;
      const key = time.toFixed(3) + ":" + lane;
      if (seen.has(key)) return;
      seen.add(key);
      notes.push({ time: time, lane: lane, judged: false, hit: false });
    }

    for (let beat = 8; beat < 60; beat += cfg.step) {
      const lane = cfg.pattern[idx % cfg.pattern.length];
      add(beat, lane);

      if (cfg.extraEvery && idx % cfg.extraEvery === cfg.extraEvery - 1) {
        add(beat + cfg.extraOffset, (lane + cfg.extraLaneShift) % LANES);
      }
      if (cfg.chordEvery && idx % cfg.chordEvery === 3) {
        add(beat, (lane + 2) % LANES);
      }
      idx++;
    }

    notes.sort(function (a, b) { return a.time - b.time || a.lane - b.lane; });
    return notes;
  }

  /* ---------------- DOM / 工具 ---------------- */
  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els = {
      stage: $("rhythm-stage"),
      canvas: $("rhythm-canvas"),
      start: $("rhythm-start"),
      count: $("rhythm-count"),
      countText: $("rhythm-count-text"),
      result: $("rhythm-result"),
      score: $("rhythm-score"),
      combo: $("rhythm-combo"),
      acc: $("rhythm-acc"),
      best: $("rhythm-best"),
      startBtn: $("rhythm-start-btn"),
      diffs: $("rhythm-difficulties"),
      grade: $("rhythm-grade"),
      resultTitle: $("rhythm-result-title"),
      resultScore: $("rhythm-result-score"),
      resultAcc: $("rhythm-result-acc"),
      resultCombo: $("rhythm-result-combo"),
      resultDetail: $("rhythm-result-detail"),
      retry: $("rhythm-retry"),
      judge: $("judge-pop"),
      lanePads: $("lane-pads")
    };
    els.ctx = els.canvas.getContext("2d");
  }

  function padScore(n) {
    return String(Math.max(0, Math.round(n))).padStart(6, "0");
  }

  function formatAcc(n) {
    return (Math.round(n * 100) / 100).toFixed(2) + "%";
  }

  function readBest(diff) {
    try {
      return parseInt(localStorage.getItem("rhythm-best-" + diff) || "0", 10) || 0;
    } catch (e) { return 0; }
  }

  function saveBest(diff, score) {
    try {
      const key = "rhythm-best-" + diff;
      if (score > (parseInt(localStorage.getItem(key) || "0", 10) || 0)) {
        localStorage.setItem(key, String(score));
      }
    } catch (e) { /* ignore */ }
  }

  function refreshBest() {
    const best = readBest(selectedDiff);
    els.best.textContent = "本难度最高分：" + (best ? String(best) : "—");
  }

  function updateDiffButtons() {
    els.diffs.querySelectorAll("[data-diff]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.diff === selectedDiff);
    });
    refreshBest();
  }

  function updateHud() {
    if (!state) return;
    els.score.textContent = padScore(state.score);
    els.combo.textContent = String(state.combo);
    els.acc.textContent = formatAcc(state.accuracy);
  }

  function flashJudge(text, type) {
    els.judge.textContent = text;
    els.judge.className = "judge-pop " + type;
    void els.judge.offsetWidth;
    els.judge.classList.add("show");
  }

  function resizeCanvas() {
    if (!els || !els.stage) return;
    const rect = els.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.canvas.width = Math.round(rect.width * dpr);
    els.canvas.height = Math.round(rect.height * dpr);
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dims.w = rect.width;
    dims.h = rect.height;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rr);
    } else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }

  /* ---------------- 游戏状态 ---------------- */
  function makeState(diffKey) {
    return {
      diffKey: diffKey,
      diff: DIFFS[diffKey],
      notes: buildChart(diffKey),
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      judged: 0,
      accuracy: 100,
      running: false,
      phase: "idle",
      raf: 0,
      timer: 0,
      token: 0,
      sound: null,
      perfStart: 0,
      lastFrame: 0,
      particles: [],
      laneFlash: [0, 0, 0, 0],
      finished: false
    };
  }

  function stopAudio() {
    if (state && state.sound) {
      try { state.sound.stop(); } catch (e) { /* ignore */ }
      state.sound = null;
    }
  }

  function clearTimers() {
    if (!state) return;
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.timer) clearTimeout(state.timer);
    state.raf = 0;
    state.timer = 0;
  }

  function stopGame() {
    if (state) {
      state.running = false;
      state.phase = "idle";
      state.token++;
      clearTimers();
      stopAudio();
    }
  }

  function showStartScreen() {
    if (!els) return;
    els.start.hidden = false;
    els.result.hidden = true;
    els.count.hidden = true;
    els.judge.className = "judge-pop";
    updateDiffButtons();
    state = makeState(selectedDiff);
    state.phase = "ready";
    els.score.textContent = "000000";
    els.combo.textContent = "0";
    els.acc.textContent = "100.00%";
    resizeCanvas();
    drawFrame(0, 0);
  }

  /* ---------------- 倒计时与开始 ---------------- */
  function beginCountdown() {
    if (!active) return;
    stopGame();
    state = makeState(selectedDiff);
    state.phase = "countdown";
    els.start.hidden = true;
    els.result.hidden = true;
    els.count.hidden = false;
    els.judge.className = "judge-pop";
    els.score.textContent = "000000";
    els.combo.textContent = "0";
    els.acc.textContent = "100.00%";
    resizeCanvas();

    let n = 3;
    function step() {
      if (!active || !state || state.phase !== "countdown") return;
      els.countText.textContent = n > 0 ? String(n) : "GO";
      els.countText.style.animation = "none";
      void els.countText.offsetWidth;
      els.countText.style.animation = "";
      if (n > 0) {
        n--;
        state.timer = setTimeout(step, 620);
      } else {
        state.timer = setTimeout(startPlayback, 480);
      }
    }
    step();
  }

  async function startPlayback() {
    if (!active || !state || state.phase !== "countdown") return;
    const token = ++state.token;
    els.count.hidden = true;

    let sound = null;
    try {
      sound = new RhythmSound();
      await sound.start();
    } catch (err) {
      if (sound) {
        try { sound.stop(); } catch (e) { /* ignore */ }
      }
      sound = null;
    }

    if (!active || !state || state.token !== token || state.phase !== "countdown") {
      if (sound) { try { sound.stop(); } catch (e) { /* ignore */ } }
      return;
    }

    state.sound = sound;
    state.perfStart = performance.now();
    state.lastFrame = state.perfStart;
    state.running = true;
    state.phase = "playing";
    state.raf = requestAnimationFrame(loop);
  }

  /* ---------------- 主循环 ---------------- */
  function gameTime() {
    if (state.sound) return state.sound.now();
    return (performance.now() - state.perfStart) / 1000;
  }

  function loop() {
    if (!active || !state || !state.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    const t = gameTime();

    updateGame(t, dt);
    drawFrame(t, dt);

    if (state.running) state.raf = requestAnimationFrame(loop);
  }

  function updateGame(t, dt) {
    if (!state || !state.running) return;

    for (const note of state.notes) {
      if (!note.judged && t > note.time + HIT_WINDOW) {
        note.judged = true;
        registerMiss(false);
      }
    }

    // 粒子
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter(function (p) { return p.life > 0; });

    if (t > SONG_LENGTH + 0.45) finishGame();
  }

  function registerMiss(playSound) {
    if (!state) return;
    state.miss++;
    state.judged++;
    state.combo = 0;
    state.accuracy = state.judged ? ((state.perfect + state.good * 0.6) / state.judged) * 100 : 100;
    updateHud();
    flashJudge("MISS", "miss");
    if (playSound && state.sound) {
      try { state.sound.miss(); } catch (e) { /* ignore */ }
    }
  }

  function hitLane(lane) {
    if (!active || !state || !state.running) return;
    const t = gameTime();
    state.laneFlash[lane] = performance.now();

    let best = null;
    let bestDelta = Infinity;
    for (const note of state.notes) {
      if (note.judged || note.lane !== lane) continue;
      const delta = Math.abs(note.time - t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = note;
      }
    }

    if (!best || bestDelta > HIT_WINDOW) return;

    best.judged = true;
    best.hit = true;
    const perfect = bestDelta <= PERFECT_WINDOW;
    state.judged++;
    if (perfect) {
      state.perfect++;
      state.score += 1000;
      flashJudge("PERFECT", "perfect");
    } else {
      state.good++;
      state.score += 600;
      flashJudge("GOOD", "good");
    }
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.accuracy = ((state.perfect + state.good * 0.6) / state.judged) * 100;
    updateHud();
    spawnParticles(lane, perfect);
    if (state.sound) {
      try { state.sound.hit(perfect); } catch (e) { /* ignore */ }
    }
  }

  function spawnParticles(lane, perfect) {
    if (!state) return;
    const boardW = Math.min(dims.w - 40, 640);
    const x0 = (dims.w - boardW) / 2;
    const laneW = boardW / LANES;
    const x = x0 + lane * laneW + laneW / 2;
    const y = dims.h * 0.82;
    const count = perfect ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 2.2;
      const speed = 70 + Math.random() * 150;
      state.particles.push({
        x: x + (Math.random() - 0.5) * laneW * 0.3,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        color: LANE_COLORS[lane]
      });
    }
  }

  function finishGame() {
    if (!state || state.finished) return;
    state.finished = true;
    state.running = false;
    clearTimers();

    for (const note of state.notes) {
      if (!note.judged) {
        note.judged = true;
        state.miss++;
        state.judged++;
      }
    }
    state.combo = 0;
    state.accuracy = state.judged ? ((state.perfect + state.good * 0.6) / state.judged) * 100 : 100;
    stopAudio();
    updateHud();

    const acc = state.accuracy;
    let grade = "D";
    if (acc >= 98) grade = "S";
    else if (acc >= 95) grade = "A";
    else if (acc >= 90) grade = "B";
    else if (acc >= 80) grade = "C";

    els.grade.textContent = grade;
    els.resultTitle.textContent = grade === "S" ? "太强了，全连之神！" : grade === "A" ? "漂亮！节奏感拉满" : grade === "B" ? "不错，再来一次？" : "别灰心，熟能生巧";
    els.resultScore.textContent = String(state.score);
    els.resultAcc.textContent = formatAcc(acc);
    els.resultCombo.textContent = String(state.maxCombo);
    els.resultDetail.textContent = "Perfect " + state.perfect + " · Good " + state.good + " · Miss " + state.miss;
    els.result.hidden = false;
    els.judge.className = "judge-pop";
    saveBest(state.diffKey, state.score);
    refreshBest();
  }

  /* ---------------- 绘制 ---------------- */
  function drawFrame(t, dt) {
    if (!els || !dims.w || !dims.h) return;
    const ctx = els.ctx;
    const w = dims.w;
    const h = dims.h;
    const boardW = Math.min(w - 40, 640);
    const x0 = (w - boardW) / 2;
    const laneW = boardW / LANES;
    const judgeY = h * 0.82;
    const travel = state ? state.diff.travel : 1.7;
    const spawnY = -34;

    ctx.clearRect(0, 0, w, h);

    // 顶部氛围光
    const glow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.9);
    glow.addColorStop(0, "rgba(154,107,255,0.16)");
    glow.addColorStop(1, "rgba(154,107,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // 轨道底板
    ctx.save();
    roundRect(ctx, x0, 0, boardW, h, 14);
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "rgba(8,11,22,0.2)");
    bg.addColorStop(0.7, "rgba(10,13,26,0.72)");
    bg.addColorStop(1, "rgba(15,19,36,0.9)");
    ctx.fillStyle = bg;
    ctx.fillRect(x0, 0, boardW, h);

    for (let i = 0; i < LANES; i++) {
      const lx = x0 + i * laneW;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.09)";
      ctx.fillRect(lx, 0, laneW, h);

      const flash = state ? Math.max(0, 1 - (performance.now() - state.laneFlash[i]) / 260) : 0;
      if (flash > 0) {
        const lg = ctx.createLinearGradient(0, judgeY - 180, 0, judgeY);
        lg.addColorStop(0, "rgba(255,255,255,0)");
        lg.addColorStop(1, LANE_COLORS[i]);
        ctx.globalAlpha = flash * 0.13;
        ctx.fillStyle = lg;
        ctx.fillRect(lx, judgeY - 180, laneW, 180);
        ctx.globalAlpha = 1;
      }
    }

    // 横向节拍线，让画面有流动感
    const beatNow = t / BEAT;
    const firstBeat = Math.floor(beatNow) - 2;
    for (let b = firstBeat; b < firstBeat + 12; b++) {
      if (b < 0) continue;
      const y = judgeY - ((b * BEAT - t) / travel) * (judgeY - spawnY);
      if (y < -2 || y > judgeY + 40) continue;
      const strong = b % 4 === 0;
      ctx.strokeStyle = strong ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + boardW, y);
      ctx.stroke();
    }

    // 轨道分隔线
    for (let i = 1; i < LANES; i++) {
      const lx = x0 + i * laneW;
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }

    // 音符
    if (state && state.notes) {
      for (const note of state.notes) {
        if (note.judged) continue;
        const dtNote = note.time - t;
        if (dtNote > travel || dtNote < -HIT_WINDOW) continue;
        const y = judgeY - (dtNote / travel) * (judgeY - spawnY);
        const cx = x0 + note.lane * laneW + laneW / 2;
        const nw = Math.max(34, laneW * 0.62);
        const nh = 13;
        const near = Math.max(0, Math.min(1, 1 - Math.abs(dtNote) / 0.35));

        ctx.save();
        ctx.shadowColor = LANE_COLORS[note.lane];
        ctx.shadowBlur = 16 + near * 14;
        const ng = ctx.createLinearGradient(cx - nw / 2, y - nh / 2, cx + nw / 2, y + nh / 2);
        ng.addColorStop(0, LANE_COLORS[note.lane]);
        ng.addColorStop(0.55, "#ffffff");
        ng.addColorStop(1, LANE_COLORS[note.lane]);
        ctx.fillStyle = ng;
        roundRect(ctx, cx - nw / 2, y - nh / 2, nw, nh, 6);
        ctx.fill();
        ctx.restore();

        if (near > 0.35) {
          ctx.fillStyle = "rgba(255,255,255," + (near * 0.8).toFixed(2) + ")";
          roundRect(ctx, cx - nw * 0.26, y - 2, nw * 0.52, 4, 2);
          ctx.fill();
        }
      }
    }

    // 判定线
    const lineGrad = ctx.createLinearGradient(x0, 0, x0 + boardW, 0);
    lineGrad.addColorStop(0, "rgba(255,255,255,0)");
    lineGrad.addColorStop(0.15, "rgba(255,255,255,0.75)");
    lineGrad.addColorStop(0.5, "#ffffff");
    lineGrad.addColorStop(0.85, "rgba(255,255,255,0.75)");
    lineGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.shadowColor = "rgba(255,92,157,0.85)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, judgeY);
    ctx.lineTo(x0 + boardW, judgeY);
    ctx.stroke();
    ctx.restore();

    // 判定线下方按键标签
    for (let i = 0; i < LANES; i++) {
      const cx = x0 + i * laneW + laneW / 2;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "600 10px " + "Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(KEY_LABELS[i], cx, h - 18);
    }

    // 粒子
    if (state && state.particles.length) {
      for (const p of state.particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 顶部 / 底部渐隐
    const fadeTop = ctx.createLinearGradient(0, 0, 0, 110);
    fadeTop.addColorStop(0, "rgba(6,8,16,0.85)");
    fadeTop.addColorStop(1, "rgba(6,8,16,0)");
    ctx.fillStyle = fadeTop;
    ctx.fillRect(x0, 0, boardW, 110);
    const fadeBottom = ctx.createLinearGradient(0, h - 90, 0, h);
    fadeBottom.addColorStop(0, "rgba(6,8,16,0)");
    fadeBottom.addColorStop(1, "rgba(6,8,16,0.75)");
    ctx.fillStyle = fadeBottom;
    ctx.fillRect(x0, h - 90, boardW, 90);

    ctx.restore();

    // 进度条
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x0, 0, boardW, 2);
    if (state && state.running) {
      const progress = Math.max(0, Math.min(1, t / SONG_LENGTH));
      const pg = ctx.createLinearGradient(x0, 0, x0 + boardW, 0);
      pg.addColorStop(0, "#ff5c9d");
      pg.addColorStop(1, "#4be3d0");
      ctx.fillStyle = pg;
      ctx.fillRect(x0, 0, boardW * progress, 2);
    }
  }

  /* ---------------- 输入 ---------------- */
  function pressLane(lane) {
    hitLane(lane);
    const pad = els.lanePads.querySelector('[data-lane="' + lane + '"]');
    if (pad) {
      pad.classList.add("pressed");
      setTimeout(function () { pad.classList.remove("pressed"); }, 110);
    }
  }

  function keyToLane(key) {
    const map = {
      d: 0, f: 1, j: 2, k: 3,
      D: 0, F: 1, J: 2, K: 3,
      ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3
    };
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : -1;
  }

  function onKeyDown(e) {
    if (!active || e.repeat) return;
    const lane = keyToLane(e.key);
    if (lane < 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    pressLane(lane);
  }

  function onKeyUp(e) {
    if (!active) return;
    const lane = keyToLane(e.key);
    if (lane < 0) return;
    const pad = els.lanePads.querySelector('[data-lane="' + lane + '"]');
    if (pad) pad.classList.remove("pressed");
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    els.startBtn.addEventListener("click", beginCountdown);
    els.retry.addEventListener("click", beginCountdown);

    els.diffs.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-diff]");
      if (!btn) return;
      selectedDiff = btn.dataset.diff;
      try { localStorage.setItem("rhythm-diff", selectedDiff); } catch (e) { /* ignore */ }
      state = makeState(selectedDiff);
      state.phase = "ready";
      updateDiffButtons();
      drawFrame(0, 0);
    });

    els.lanePads.addEventListener("pointerdown", function (e) {
      const btn = e.target.closest("[data-lane]");
      if (!btn) return;
      e.preventDefault();
      pressLane(parseInt(btn.dataset.lane, 10));
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", function () {
      if (!active) return;
      resizeCanvas();
      if (!state || !state.running) drawFrame(0, 0);
    });
  }

  /* ---------------- 对外接口 ---------------- */
  window.RhythmGame = {
    enter: function () {
      if (!els) cacheEls();
      active = true;
      bindOnce();
      selectedDiff = (function () {
        try {
          const saved = localStorage.getItem("rhythm-diff");
          return saved && DIFFS[saved] ? saved : "easy";
        } catch (e) { return "easy"; }
      })();
      showStartScreen();
      requestAnimationFrame(function () {
        resizeCanvas();
        if (!state || !state.running) drawFrame(0, 0);
      });
    },
    exit: function () {
      active = false;
      stopGame();
      if (state) state.finished = true;
      if (els) {
        els.start.hidden = false;
        els.result.hidden = true;
        els.count.hidden = true;
      }
    },
    setToast: function (fn) {
      if (typeof fn === "function") toastFn = fn;
    }
  };
})();
