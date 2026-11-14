/* =========================================================
   小站总控：首页导航、时钟、路由、提示条
   ========================================================= */
(function () {
  "use strict";

  const CFG = Object.assign({
    name: "OoKr4z的小站",
    owner: "OoKr4z",
    avatar: "🐟",
    bio: "Once Forgotten,Nothing Remains",
    github: "",
    footer: "用 ❤️ 和一点点代码搭成 · Hosted on GitHub Pages"
  }, window.SITE_CONFIG || {});

  const TOOL_ORDER = ["rhythm", "music", "minesweeper"];
  let currentView = "home";
  let toastTimer = 0;

  function $(id) { return document.getElementById(id); }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function applyConfig() {
    document.title = CFG.name || "OoKr4z的小站";
    const brand = $("brand-name");
    const hero = $("hero-name");
    const bio = $("hero-bio");
    const avatar = $("avatar-emoji");
    const footer = $("footer-text");
    if (brand) brand.textContent = CFG.name || "OoKr4z的小站";
    if (hero) hero.textContent = CFG.name || "OoKr4z的小站";
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
        icon.href = "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' +
          CFG.avatar + "</text></svg>"
        );
      }
    }
  }

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
      date.textContent = now.getFullYear() + "." +
        String(now.getMonth() + 1).padStart(2, "0") + "." +
        String(now.getDate()).padStart(2, "0") + " " + week;
    }
  }

  function viewNameFromHash() {
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash || hash === "home") return "home";
    return TOOL_ORDER.indexOf(hash) >= 0 ? hash : "home";
  }

  function navigate(name) {
    const target = name === "home" ? "home" : name;
    if (viewNameFromHash() === target) {
      render(target);
      return;
    }
    if (target === "home") {
      history.pushState("", document.title, location.pathname + location.search);
      render("home");
    } else {
      location.hash = target;
    }
  }

  function exitTool(name) {
    if (name === "rhythm" && window.RhythmGame) window.RhythmGame.exit();
    if (name === "minesweeper" && window.Minesweeper) window.Minesweeper.exit();
    if (name === "music" && window.MusicRoom) window.MusicRoom.exit();
  }

  function enterTool(name) {
    if (name === "rhythm") {
      // 打歌有自己的音乐，进入前先关掉网易云播放器，避免两首歌叠在一起
      if (window.MusicRoom) window.MusicRoom.stop();
      if (window.RhythmGame) window.RhythmGame.enter();
    }
    if (name === "music" && window.MusicRoom) window.MusicRoom.enter();
    if (name === "minesweeper" && window.Minesweeper) window.Minesweeper.enter();
  }

  function render(name) {
    if (TOOL_ORDER.indexOf(name) < 0) name = "home";
    const current = document.getElementById("view-" + name);
    if (!current) return;
    if (currentView === name && !current.hidden) return;

    const previous = currentView;
    if (previous !== name) exitTool(previous);

    document.querySelectorAll(".view").forEach(function (view) { view.hidden = true; });
    current.hidden = false;
    currentView = name;
    document.body.dataset.view = name;
    window.scrollTo(0, 0);
    if (name !== "home") enterTool(name);
  }

  function onRouteChange() {
    render(viewNameFromHash());
  }

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

    document.addEventListener("site:toast", function (e) {
      if (e.detail && e.detail.message) showToast(e.detail.message);
    });

    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);

    const initial = viewNameFromHash();
    if (initial !== "home") render(initial);
    else {
      document.body.dataset.view = "home";
      const home = $("view-home");
      if (home) home.style.animation = "none";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
