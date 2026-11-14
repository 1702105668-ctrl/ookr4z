/* =========================================================
   听歌 · 网易云官方外链播放器（懒加载）
   ========================================================= */
(function () {
  "use strict";

  const PLAYLIST_ID = "12374407187";
  const PLAYER_SRC = "https://music.163.com/outchain/player?type=0&id=" +
    PLAYLIST_ID + "&auto=0&height=500";

  let els = null;
  let loaded = false;
  let loadTimer = 0;

  function $(id) { return document.getElementById(id); }

  function cache() {
    els = {
      frame: $("netease-player"),
      loading: $("netease-loading")
    };
    if (!els.frame) return;
    els.frame.addEventListener("load", function () {
      if (!loaded) return;
      clearTimeout(loadTimer);
      if (els.loading) els.loading.hidden = true;
    });
  }

  function setLoadingText(text) {
    if (els && els.loading) {
      const p = els.loading.querySelector("p");
      if (p) p.textContent = text;
    }
  }

  function load() {
    if (!els || !els.frame) return;
    loaded = true;
    if (els.loading) els.loading.hidden = false;
    setLoadingText("正在加载网易云播放器…");
    els.frame.src = PLAYER_SRC;
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () {
      if (loaded && els.loading && !els.loading.hidden) {
        setLoadingText("如果播放器一直没出现，请点上方「在网易云打开」。");
      }
    }, 12000);
  }

  window.MusicRoom = {
    enter: function () {
      if (!els) cache();
      if (!loaded) load();
    },
    exit: function () {
      // 离开听歌页面时不强制停止，正在播放的歌可以继续。
    },
    stop: function () {
      if (!els || !els.frame) return;
      clearTimeout(loadTimer);
      loaded = false;
      els.frame.src = "about:blank";
      if (els.loading) {
        els.loading.hidden = false;
        setLoadingText("正在加载网易云播放器…");
      }
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (!els) cache();
  });
})();
