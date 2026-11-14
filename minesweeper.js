/* =========================================================
   扫雷 · 经典三档难度
   ========================================================= */
(function () {
  "use strict";

  const LEVELS = {
    easy: { rows: 9, cols: 9, mines: 10, label: "初级" },
    medium: { rows: 16, cols: 16, mines: 40, label: "中级" },
    hard: { rows: 16, cols: 30, mines: 99, label: "高级" }
  };

  let els = null;
  let state = null;
  let bound = false;
  let active = false;
  let flagMode = false;
  let cellEls = [];
  let timerId = 0;
  let pressTimer = 0;
  let pressIndex = -1;
  let suppressClick = false;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els = {
      board: $("mines-board"),
      levels: $("mines-levels"),
      left: $("mines-left"),
      timer: $("mines-timer"),
      status: $("mines-status"),
      restart: $("mines-restart"),
      flagMode: $("mines-flag-mode"),
      overlay: $("mines-overlay"),
      overlayEmoji: $("mines-overlay-emoji"),
      overlayTitle: $("mines-overlay-title"),
      overlayDesc: $("mines-overlay-desc"),
      again: $("mines-again")
    };
  }

  function padTime(n) {
    return String(Math.min(999, Math.max(0, n))).padStart(3, "0");
  }

  function updateCounters() {
    els.left.textContent = String(state.mines - state.flags);
    els.timer.textContent = padTime(state.seconds);
  }

  function startTimer() {
    if (timerId || !state || state.over || !state.started) return;
    timerId = setInterval(function () {
      if (!state || state.over || !active) return;
      state.seconds++;
      els.timer.textContent = padTime(state.seconds);
      if (state.seconds >= 999) stopTimer();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  function neighbors(index) {
    const rows = state.rows;
    const cols = state.cols;
    const r = Math.floor(index / cols);
    const c = index % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          out.push(nr * cols + nc);
        }
      }
    }
    return out;
  }

  function newGame(levelKey) {
    const level = LEVELS[levelKey] || LEVELS.easy;
    stopTimer();
    state = {
      levelKey: levelKey && LEVELS[levelKey] ? levelKey : "easy",
      rows: level.rows,
      cols: level.cols,
      mines: level.mines,
      grid: [],
      started: false,
      over: false,
      win: false,
      flags: 0,
      revealed: 0,
      seconds: 0
    };
    for (let i = 0; i < state.rows * state.cols; i++) {
      state.grid.push({ mine: false, count: 0, revealed: false, flagged: false });
    }

    if (els.levels) {
      els.levels.querySelectorAll("[data-level]").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.level === state.levelKey);
      });
    }
    if (els.overlay) els.overlay.hidden = true;
    if (els.status) els.status.textContent = "左键翻开，右键插旗；手机可以开启插旗模式。第一步永远不会踩雷。";
    if (els.flagMode) {
      flagMode = false;
      els.flagMode.textContent = "🚩 插旗模式：关";
      els.flagMode.classList.remove("active");
    }
    renderBoard();
    const wrap = els.board.parentElement;
    if (wrap) {
      wrap.scrollLeft = 0;
      wrap.scrollTop = 0;
    }
    updateCounters();
  }

  function renderBoard() {
    if (!els || !state) return;
    const board = els.board;
    board.innerHTML = "";
    board.style.gridTemplateColumns = "repeat(" + state.cols + ", var(--cell))";
    board.setAttribute("aria-rowcount", String(state.rows));
    board.setAttribute("aria-colcount", String(state.cols));
    cellEls = [];
    fitCellSize();

    const frag = document.createDocumentFragment();
    for (let i = 0; i < state.grid.length; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.dataset.index = String(i);
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", "第 " + (Math.floor(i / state.cols) + 1) + " 行第 " + (i % state.cols + 1) + " 列，未翻开");
      frag.appendChild(btn);
      cellEls.push(btn);
    }
    board.appendChild(frag);
  }

  function fitCellSize() {
    if (!els || !state || !els.board.parentElement) return;
    const wrapW = els.board.parentElement.clientWidth - 16;
    let size = state.cols > 20 ? 30 : 32;
    const fit = Math.floor((wrapW - (state.cols - 1) * 3) / state.cols);
    size = Math.max(24, Math.min(size, fit));
    els.board.style.setProperty("--cell", size + "px");
  }

  function placeMines(safeIndex) {
    const safe = new Set([safeIndex].concat(neighbors(safeIndex)));
    const pool = [];
    for (let i = 0; i < state.grid.length; i++) {
      if (!safe.has(i)) pool.push(i);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    for (let k = 0; k < Math.min(state.mines, pool.length); k++) {
      state.grid[pool[k]].mine = true;
    }
    for (let i = 0; i < state.grid.length; i++) {
      if (state.grid[i].mine) continue;
      let count = 0;
      for (const n of neighbors(i)) {
        if (state.grid[n].mine) count++;
      }
      state.grid[i].count = count;
    }
  }

  function updateCell(i) {
    const cell = state.grid[i];
    const el = cellEls[i];
    if (!el) return;
    el.className = "cell";
    el.textContent = "";
    if (cell.revealed) {
      el.classList.add("revealed");
      el.setAttribute("aria-disabled", "true");
      if (cell.mine) {
        el.classList.add("mine");
      } else if (cell.count > 0) {
        el.classList.add("n" + cell.count);
        el.textContent = String(cell.count);
      }
    } else if (cell.flagged) {
      el.classList.add("flagged");
    }
    const row = Math.floor(i / state.cols) + 1;
    const col = (i % state.cols) + 1;
    let label = "第 " + row + " 行第 " + col + " 列，";
    if (cell.revealed) {
      label += cell.mine ? "地雷" : cell.count ? "已翻开，" + cell.count + " 颗相邻地雷" : "已翻开，周围没有雷";
    } else if (cell.flagged) {
      label += "已插旗";
    } else {
      label += "未翻开";
    }
    el.setAttribute("aria-label", label);
  }

  function startIfNeeded(index) {
    if (state.started) return;
    state.started = true;
    placeMines(index);
    startTimer();
  }

  function reveal(index) {
    if (!state || state.over) return;
    const cell = state.grid[index];
    if (!cell || cell.revealed || cell.flagged) return;
    startIfNeeded(index);

    if (cell.mine) {
      lose(index);
      return;
    }

    const stack = [index];
    const seen = new Set();
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const c = state.grid[i];
      if (c.revealed || c.flagged) continue;
      c.revealed = true;
      state.revealed++;
      updateCell(i);
      if (c.count === 0) {
        for (const n of neighbors(i)) {
          if (!state.grid[n].revealed && !state.grid[n].flagged) stack.push(n);
        }
      }
    }

    if (state.revealed >= state.rows * state.cols - state.mines) {
      win();
    }
  }

  function toggleFlag(index) {
    if (!state || state.over) return;
    const cell = state.grid[index];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    updateCell(index);
    updateCounters();
    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch (e) { /* ignore */ }
    }
  }

  function lose(index) {
    state.over = true;
    state.win = false;
    stopTimer();
    state.grid[index].revealed = true;
    state.grid[index].exploded = true;

    for (let i = 0; i < state.grid.length; i++) {
      const cell = state.grid[i];
      if (cell.mine && !cell.flagged) {
        cell.revealed = true;
        updateCell(i);
      } else if (cell.flagged && !cell.mine) {
        updateCell(i);
        cellEls[i].classList.add("wrong");
      }
    }
    updateCell(index);
    cellEls[index].classList.add("exploded");

    els.status.textContent = "💥 踩到雷了。别急，再来一局！";
    els.overlayEmoji.textContent = "💥";
    els.overlayTitle.textContent = "踩雷了！";
    els.overlayDesc.textContent = "坚持了 " + state.seconds + " 秒，再试一次？";
    els.overlay.hidden = false;
    updateCounters();
  }

  function win() {
    state.over = true;
    state.win = true;
    stopTimer();
    for (let i = 0; i < state.grid.length; i++) {
      if (state.grid[i].mine && !state.grid[i].flagged) {
        state.grid[i].flagged = true;
        state.flags++;
        updateCell(i);
      }
    }
    els.status.textContent = "🎉 所有安全格子都翻开了，通关！";
    els.overlayEmoji.textContent = "🎉";
    els.overlayTitle.textContent = "通关！";
    els.overlayDesc.textContent = "用时 " + state.seconds + " 秒 · " + LEVELS[state.levelKey].label + "难度";
    els.overlay.hidden = false;
    updateCounters();
  }

  function clearPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = 0;
    pressIndex = -1;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    els.board.addEventListener("click", function (e) {
      const target = e.target.closest(".cell");
      if (!target) return;
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const index = parseInt(target.dataset.index, 10);
      if (flagMode) toggleFlag(index);
      else reveal(index);
    });

    els.board.addEventListener("contextmenu", function (e) {
      const target = e.target.closest(".cell");
      if (!target) return;
      e.preventDefault();
      if (suppressClick) return;
      toggleFlag(parseInt(target.dataset.index, 10));
    });

    els.board.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      const target = e.target.closest(".cell");
      if (!target) return;
      clearPress();
      pressIndex = parseInt(target.dataset.index, 10);
      pressTimer = setTimeout(function () {
        if (pressIndex < 0) return;
        suppressClick = true;
        toggleFlag(pressIndex);
        pressTimer = 0;
        setTimeout(function () { suppressClick = false; }, 700);
      }, 520);
    });
    els.board.addEventListener("pointerup", clearPress);
    els.board.addEventListener("pointercancel", clearPress);
    els.board.addEventListener("pointerleave", clearPress);

    els.levels.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-level]");
      if (!btn) return;
      newGame(btn.dataset.level);
    });

    els.restart.addEventListener("click", function () {
      newGame(state ? state.levelKey : "easy");
    });
    els.again.addEventListener("click", function () {
      newGame(state ? state.levelKey : "easy");
    });
    els.flagMode.addEventListener("click", function () {
      flagMode = !flagMode;
      els.flagMode.textContent = flagMode ? "🚩 插旗模式：开" : "🚩 插旗模式：关";
      els.flagMode.classList.toggle("active", flagMode);
      els.status.textContent = flagMode
        ? "插旗模式已打开：点一下格子就是插旗，再点一下取消。"
        : "左键翻开，右键插旗；手机可以开启插旗模式。第一步永远不会踩雷。";
    });

    window.addEventListener("resize", function () {
      if (!active) return;
      fitCellSize();
    });
  }

  window.Minesweeper = {
    enter: function () {
      if (!els) cacheEls();
      active = true;
      bindOnce();
      if (!state) newGame("easy");
      else updateCounters();
      if (state && state.started && !state.over) startTimer();
    },
    exit: function () {
      active = false;
      stopTimer();
      clearPress();
    }
  };
})();
