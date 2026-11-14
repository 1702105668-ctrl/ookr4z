/* =========================================================
   小站总控：导航、时钟、B站、便签、迷你播放条
   ========================================================= */
(function () {
  "use strict";

  const CFG = Object.assign({
    name: "摸鱼小站",
    owner: "站长",
    avatar: "🐟",
    bio: "白天认真生活，晚上打歌听歌。这里是我的小小网络角落。",
    github: "",
    footer: "用 ❤️ 和一点点代码搭成 · Hosted on GitHub Pages"
  }, window.SITE_CONFIG || {});

  const TOOL_ORDER = ["rhythm", "music", "minesweeper", "bilibili", "notes"];
  const toolNames = {
    rhythm: "打歌",
    music: "听歌",
    minesweeper: "扫雷",
    bilibili: "看 B 站",
    notes: "随手记"
  };

  let currentView = "home";
  let toastTimer = 0;
  let noteTimer = 0;

  function $(id) { return document.getElementById(id); }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  /* ---------------- 配置应用 ---------------- */
  function applyConfig() {
    document.title = CFG.name || "摸鱼小站";
    const brand = $("brand-name");
    const hero = $("hero-name");
    const bio = $("hero-bio");
    const avatar = $("avatar-emoji");
    const footer = $("footer-text");
    if (brand) brand.textContent = CFG.name || "摸鱼小站";
    if (hero) hero.textContent = CFG.name || "摸鱼小站";
    if (bio) bio.textContent = CFG.bio || "";
    if (avatar) avatar.textContent = CFG.avatar || "🐟";
    if (footer) footer.textContent = CFG.footer || "";

    const github = $("github-link");
    if (github && CFG.github && /^https?:\/\//i.test(CFG.github)) {
      github.href = CFG.github;
      github.hidden = false;
    }
    if (CFG.avatar) {
      const icon = document.querySelector('link[rel="icon"]');
      if (icon) {
        const emoji = CFG.avatar;
        icon.href = "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + emoji + "</text></svg>"
        );
      }
    }
  }

  /* ---------------- 时钟 ---------------- */
  function updateClock() {
    const now = new Date();
    const time = $("clock-time");
    const date = $("clock-date");
    if (time) {
      time.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(function (n) { return String(n).padStart(2, "0"); })
        .join(":");
    }
    if (date) {
      const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
      date.textContent = now.getFullYear() + "." + String(now.getMonth() + 1).padStart(2, "0") + "." +
        String(now.getDate()).padStart(2, "0") + " " + week;
    }
  }

  /* ---------------- 路由 ---------------- */
  function viewNameFromHash() {
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash || hash === "home") return "home";
    return TOOL_ORDER.indexOf(hash) >= 0 ? hash : "home";
  }

  function navigate(name) {
    const target = name === "home" ? "home" : name;
    if (viewNameFromHash() === target && document.querySelector(".view:not([hidden])")) {
      render(target);
      return;
    }
    if (target === "home") {
      if (location.hash) {
        history.pushState("", document.title, location.pathname + location.search);
        render("home");
      } else {
        render("home");
      }
    } else {
      location.hash = target;
    }
  }

  function exitTool(name) {
    if (name === "rhythm" && window.RhythmGame) window.RhythmGame.exit();
    if (name === "minesweeper" && window.Minesweeper) window.Minesweeper.exit();
    if (name === "music" && window.MusicRoom) window.MusicRoom.exit();
    if (name === "bilibili" && window.BiliRoom) window.BiliRoom.exit();
  }

  function enterTool(name) {
    if (name === "rhythm") {
      // 打歌本身有音乐，先把背景音乐停掉，避免两首歌叠在一起
      if (window.MusicRoom) window.MusicRoom.stop();
      if (window.RhythmGame) window.RhythmGame.enter();
    }
    if (name === "minesweeper" && window.Minesweeper) window.Minesweeper.enter();
    if (name === "music" && window.MusicRoom) window.MusicRoom.enter();
    if (name === "bilibili" && window.BiliRoom) window.BiliRoom.enter();
  }

  function render(name) {
    if (TOOL_ORDER.indexOf(name) < 0) name = "home";
    const views = document.querySelectorAll(".view");
    if (currentView === name && document.getElementById("view-" + name) && !document.getElementById("view-" + name).hidden) {
      return;
    }

    const previous = currentView;
    if (previous !== name) exitTool(previous);

    views.forEach(function (view) { view.hidden = true; });
    const next = document.getElementById("view-" + name);
    if (!next) return;
    next.hidden = false;
    currentView = name;
    document.body.dataset.view = name;
    window.scrollTo(0, 0);

    if (name !== "home") enterTool(name);
    updateMiniVisibility();
  }

  function onRouteChange() {
    render(viewNameFromHash());
  }

  /* ---------------- 便签 ---------------- */
  function loadNote() {
    const input = $("note-input");
    if (!input) return;
    let text = "";
    try { text = localStorage.getItem("mini-site-note") || ""; } catch (e) { text = ""; }
    if (text.length > 2000) text = text.slice(0, 2000);
    input.value = text;
    updateNoteCount();
    setNoteStatus("已保存");
  }

  function setNoteStatus(text, saving) {
    const el = $("note-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("saving", !!saving);
  }

  function updateNoteCount() {
    const input = $("note-input");
    const count = $("note-count");
    if (input && count) count.textContent = input.value.length + " / 2000";
  }

  function saveNote(immediate) {
    const input = $("note-input");
    if (!input) return;
    clearTimeout(noteTimer);
    setNoteStatus("保存中…", true);
    const write = function () {
      try {
        localStorage.setItem("mini-site-note", input.value);
        setNoteStatus("已保存");
      } catch (e) {
        setNoteStatus("保存失败");
      }
    };
    if (immediate) write();
    else noteTimer = setTimeout(write, 380);
  }

  function bindNote() {
    const input = $("note-input");
    const clear = $("note-clear");
    if (!input || !clear) return;

    input.addEventListener("input", function () {
      updateNoteCount();
      saveNote(false);
    });

    clear.addEventListener("click", function () {
      if (!input.value.trim()) {
        showToast("便签已经是空的了");
        return;
      }
      if (!window.confirm("清空便签？清空后找不回来哦。")) return;
      input.value = "";
      updateNoteCount();
      saveNote(true);
      showToast("便签已清空");
      input.focus();
    });

    window.addEventListener("pagehide", function () { saveNote(true); });
    window.addEventListener("storage", function (e) {
      if (e.key === "mini-site-note" && document.activeElement !== input) {
        input.value = e.newValue || "";
        updateNoteCount();
      }
    });
  }

  /* ---------------- B 站 ---------------- */
  const BiliRoom = (function () {
    let els = null;
    let bound = false;
    let active = false;
    let openUrl = "";
    let loadTimer = 0;

    function cache() {
      els = {
        input: $("bili-input"),
        go: $("bili-go"),
        msg: $("bili-msg"),
        wrap: $("bili-frame-wrap"),
        empty: $("bili-empty"),
        player: $("bili-player"),
        open: $("bili-open")
      };
    }

    function setMessage(text, error) {
      if (!els) return;
      els.msg.textContent = text;
      els.msg.classList.toggle("error", !!error);
    }

    function extract(input) {
      const text = String(input || "").trim();
      if (!text) return { type: "empty" };
      const bv = text.match(/BV[0-9A-Za-z]{10}/i);
      if (bv) {
        return {
          type: "video",
          bvid: "BV" + bv[0].slice(2),
          open: "https://www.bilibili.com/video/" + ("BV" + bv[0].slice(2))
        };
      }
      const av = text.match(/av(\d+)/i);
      if (av) {
        return {
          type: "video",
          aid: av[1],
          open: "https://www.bilibili.com/video/av" + av[1]
        };
      }
      if (/^https?:\/\//i.test(text)) {
        try {
          const url = new URL(text);
          if (url.hostname === "bilibili.com" || /\.bilibili\.com$/i.test(url.hostname)) {
            return { type: "open", open: text };
          }
        } catch (e) { /* ignore */ }
        return { type: "invalid" };
      }
      if (/^BV[0-9A-Za-z]+$/i.test(text) && text.length !== 12) {
        return { type: "invalid" };
      }
      return {
        type: "search",
        open: "https://search.bilibili.com/all?keyword=" + encodeURIComponent(text)
      };
    }

    function clearPlayer() {
      if (!els) return;
      clearTimeout(loadTimer);
      els.player.hidden = true;
      els.player.src = "about:blank";
      els.empty.hidden = false;
      openUrl = "";
      els.open.disabled = true;
    }

    function play(input) {
      const result = extract(input);
      if (result.type === "empty") {
        setMessage("先粘贴一个 BV 号、视频链接，或者输入想搜的关键词。");
        els.input.focus();
        return;
      }
      if (result.type === "invalid") {
        setMessage("这个链接看起来不太对，换一个 BV 号或完整的 B 站视频链接试试。", true);
        return;
      }
      if (result.type === "open") {
        window.open(result.open, "_blank", "noopener");
        setMessage("已经在新标签页打开 B 站。");
        return;
      }
      if (result.type === "search") {
        window.open(result.open, "_blank", "noopener");
        setMessage("已在新标签页打开 B 站搜索：“" + input.trim() + "”。");
        return;
      }

      openUrl = result.open;
      const params = result.bvid
        ? "bvid=" + encodeURIComponent(result.bvid)
        : "aid=" + encodeURIComponent(result.aid);
      const src = "https://player.bilibili.com/player.html?" + params + "&page=1&high_quality=1&danmaku=1&autoplay=0";

      els.empty.hidden = true;
      els.player.hidden = false;
      els.player.src = src;
      els.open.disabled = false;
      setMessage(result.bvid
        ? "正在加载 " + result.bvid + "。如果画面一直空白，可能 UP 主禁止嵌入，请点“去 B 站打开”。"
        : "正在加载 av" + result.aid + "。如果画面一直空白，请点“去 B 站打开”。");

      clearTimeout(loadTimer);
      loadTimer = setTimeout(function () {
        if (active && openUrl) {
          setMessage("如果画面没有出现，可能是视频不允许嵌入。点下面的“去 B 站打开”就能看。");
        }
      }, 8000);
    }

    function bind() {
      if (bound) return;
      bound = true;
      els.go.addEventListener("click", function () { play(els.input.value); });
      els.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          play(els.input.value);
        }
      });
      els.open.addEventListener("click", function () {
        if (openUrl) window.open(openUrl, "_blank", "noopener");
      });
    }

    return {
      enter: function () {
        if (!els) cache();
        active = true;
        bind();
        if (!els.player.src || els.player.src === "about:blank") {
          clearPlayer();
          setMessage("在 B 站视频地址栏复制链接，或直接输入 BV 号，就能在这里看。");
        }
      },
      exit: function () {
        active = false;
        clearPlayer();
      }
    };
  })();

  window.BiliRoom = BiliRoom;

  /* ---------------- 迷你播放条 ---------------- */
  function updateMiniVisibility() {
    const mini = $("mini-player");
    if (!mini) return;
    const visible = !mini.hidden && document.body.dataset.view !== "music";
    document.body.classList.toggle("has-mini", visible);
  }

  function bindMusicMini() {
    document.addEventListener("music:state", function (e) {
      const detail = e.detail || {};
      const mini = $("mini-player");
      if (!mini) return;
      if (!detail.mode || !detail.title) {
        mini.hidden = true;
        document.body.classList.remove("has-mini");
        return;
      }
      mini.hidden = false;
      mini.classList.toggle("playing", !!detail.playing);
      const title = $("mini-title");
      const label = $("mini-label");
      const toggle = $("mini-toggle");
      if (title) title.textContent = detail.title;
      if (label) label.textContent = detail.playing ? "正在播放" : "已暂停";
      if (toggle) toggle.textContent = detail.playing ? "⏸" : "▶";
      updateMiniVisibility();
    });

    const toggle = $("mini-toggle");
    const close = $("mini-close");
    if (toggle) {
      toggle.addEventListener("click", function () {
        if (window.MusicRoom) window.MusicRoom.toggle();
      });
    }
    if (close) {
      close.addEventListener("click", function () {
        if (window.MusicRoom) window.MusicRoom.stop();
      });
    }
  }

  /* ---------------- 键盘快捷键 ---------------- */
  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function bindKeyboard() {
    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        if (currentView !== "home") {
          e.preventDefault();
          navigate("home");
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (currentView !== "home") return;
      const index = parseInt(e.key, 10);
      if (index >= 1 && index <= TOOL_ORDER.length) {
        e.preventDefault();
        navigate(TOOL_ORDER[index - 1]);
      }
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    applyConfig();
    updateClock();
    setInterval(updateClock, 1000);

    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const name = btn.dataset.view;
        if (TOOL_ORDER.indexOf(name) >= 0) navigate(name);
      });
    });

    document.querySelectorAll("[data-home]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        navigate("home");
      });
    });

    bindKeyboard();
    bindNote();
    bindMusicMini();
    loadNote();

    document.addEventListener("site:toast", function (e) {
      if (e.detail && e.detail.message) showToast(e.detail.message);
    });

    if (window.RhythmGame && window.RhythmGame.setToast) window.RhythmGame.setToast(showToast);
    if (window.MusicRoom) {
      // 音乐模块加载时可能已经读到音量，这里同步一下
      const volume = $("music-volume");
      if (volume) {
        try {
          const saved = parseFloat(localStorage.getItem("music-volume") || "0.65");
          volume.value = String(Math.round((isFinite(saved) ? saved : 0.65) * 100));
        } catch (e) { /* ignore */ }
      }
    }

    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);

    // 刚打开时，如果地址里带 #music 之类的就直接进入对应小功能
    const initial = viewNameFromHash();
    if (initial !== "home") render(initial);
    else {
      document.body.dataset.view = "home";
      // 首页不动画，避免第一次打开时闪一下
      const home = $("view-home");
      if (home) home.style.animation = "none";
    }

    // 给喜欢直接拖文件的人一个小惊喜
    const localPane = $("music-pane-local");
    if (localPane) {
      localPane.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
      localPane.addEventListener("drop", function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          const input = $("music-files");
          if (input) {
            const dt = new DataTransfer();
            Array.from(e.dataTransfer.files).forEach(function (f) { dt.items.add(f); });
            input.files = dt.files;
            input.dispatchEvent(new Event("change"));
          }
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
