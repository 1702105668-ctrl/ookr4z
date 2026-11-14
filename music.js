/* =========================================================
   听歌 · 网易云歌单（43 首完整列表 + 官方单曲播放器）
   ========================================================= */
(function () {
  "use strict";

  let els = null;
  let bound = false;
  let active = false;
  let selected = -1;
  let query = "";
  let data = null;
  let playerTimer = 0;

  function $(id) { return document.getElementById(id); }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    return Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
  }

  function cache() {
    els = {
      cover: $("playlist-cover"),
      name: $("playlist-name"),
      owner: $("playlist-owner"),
      count: $("playlist-count"),
      search: $("track-search"),
      list: $("track-list"),
      nowCover: $("now-cover"),
      nowLabel: $("now-label"),
      nowTitle: $("now-title"),
      nowArtist: $("now-artist"),
      nowAlbum: $("now-album"),
      player: $("netease-player"),
      placeholder: $("player-placeholder")
    };
  }

  function init() {
    if (!els) cache();
    data = window.NETEASE_PLAYLIST || { tracks: [] };
    els.cover.src = data.cover || "";
    els.name.textContent = data.name || "歌单";
    els.owner.textContent = data.owner || "OoKr4z";
    els.count.textContent = String(data.tracks.length);
    renderList();
    if (data.tracks.length) selectTrack(0, false);
    bindOnce();
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    els.search.addEventListener("input", function () {
      query = els.search.value.trim().toLowerCase();
      renderList();
    });
    els.player.addEventListener("load", function () {
      if (active && els.player.src.indexOf("outchain/player") >= 0) hidePlaceholder();
    });
  }

  function hidePlaceholder() {
    if (els.placeholder) els.placeholder.hidden = true;
    if (els.player) els.player.classList.add("ready");
  }

  function showPlaceholder(text) {
    if (!els.placeholder) return;
    els.placeholder.hidden = false;
    els.placeholder.querySelector("p").textContent = text;
    els.player.classList.remove("ready");
  }

  function renderList() {
    if (!els) return;
    const tracks = data ? data.tracks : [];
    const filtered = tracks.map(function (t, i) { return { t: t, i: i }; })
      .filter(function (item) {
        if (!query) return true;
        const s = (item.t.name + " " + item.t.artist + " " + (item.t.album || "")).toLowerCase();
        return s.indexOf(query) >= 0;
      });
    els.list.innerHTML = "";
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "track-empty";
      empty.textContent = "没有找到这首歌";
      els.list.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    filtered.forEach(function (item) {
      const t = item.t;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "track-row" + (item.i === selected ? " active" : "");
      row.dataset.index = String(item.i);

      const index = document.createElement("span");
      index.className = "track-index";
      index.textContent = String(item.i + 1).padStart(2, "0");

      const cover = document.createElement("img");
      cover.className = "track-thumb";
      cover.src = t.cover;
      cover.alt = "";
      cover.loading = "lazy";
      cover.referrerPolicy = "no-referrer";
      cover.onerror = function () { cover.style.visibility = "hidden"; };

      const text = document.createElement("span");
      text.className = "track-text";
      const name = document.createElement("strong");
      name.textContent = t.name;
      const artist = document.createElement("small");
      artist.textContent = t.artist;
      text.appendChild(name);
      text.appendChild(artist);

      const duration = document.createElement("span");
      duration.className = "track-duration";
      duration.textContent = formatTime(t.duration);

      row.appendChild(index);
      row.appendChild(cover);
      row.appendChild(text);
      row.appendChild(duration);
      row.addEventListener("click", function () { selectTrack(item.i, true); });
      frag.appendChild(row);
    });
    els.list.appendChild(frag);
  }

  function selectTrack(index, play) {
    if (!data || !data.tracks[index]) return;
    const t = data.tracks[index];
    selected = index;
    els.nowCover.src = t.cover;
    els.nowLabel.textContent = play ? "NOW PLAYING" : "SELECTED";
    els.nowTitle.textContent = t.name;
    els.nowArtist.textContent = t.artist;
    els.nowAlbum.textContent = t.album ? "专辑 · " + t.album : "";
    els.list.querySelectorAll(".track-row").forEach(function (row) {
      row.classList.toggle("active", parseInt(row.dataset.index, 10) === index);
    });
    const activeRow = els.list.querySelector('.track-row[data-index="' + index + '"]');
    if (activeRow) activeRow.scrollIntoView({ block: "nearest" });

    if (play) {
      showPlaceholder("正在加载官方播放器…");
      els.player.src = "https://music.163.com/outchain/player?type=2&id=" +
        encodeURIComponent(t.id) + "&auto=1&height=90";
      clearTimeout(playerTimer);
      playerTimer = setTimeout(function () {
        if (active) hidePlaceholder();
      }, 3500);
      if (window.innerWidth < 760) {
        setTimeout(function () {
          const card = els.nowTitle.closest(".now-card");
          if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    }
  }

  window.MusicRoom = {
    enter: function () {
      if (!els) cache();
      active = true;
      if (!data) init();
      if (selected >= 0) {
        const row = els.list.querySelector('.track-row[data-index="' + selected + '"]');
        if (row) row.classList.add("active");
      }
    },
    exit: function () {
      // 离开听歌页时停止官方播放器，避免在别的页面里找不到暂停按钮。
      active = false;
      clearTimeout(playerTimer);
      if (els && els.player) {
        els.player.src = "about:blank";
        showPlaceholder("点左侧任意一首歌，官方播放器会出现在这里。");
      }
    },
    stop: function () {
      if (!els) return;
      clearTimeout(playerTimer);
      els.player.src = "about:blank";
      els.player.classList.remove("ready");
      showPlaceholder("点左侧任意一首歌，官方播放器会出现在这里。");
    }
  };
})();
