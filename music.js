/* =========================================================
   听歌 · 完整 43 首网易云歌单 + 本地音量控制
   ========================================================= */
(function () {
  "use strict";

  let els = null;
  let bound = false;
  let active = false;
  let selected = -1;
  let query = "";
  let data = null;
  let seeking = false;
  let volume = 80;

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
      audio: $("netease-audio"),
      toggle: $("music-toggle"),
      prev: $("music-prev"),
      next: $("music-next"),
      seek: $("audio-seek"),
      current: $("audio-current"),
      duration: $("audio-duration"),
      volume: $("music-volume"),
      volumeLabel: $("volume-label"),
      status: $("audio-status")
    };
  }

  function init() {
    if (!els) cache();
    data = window.NETEASE_PLAYLIST || { tracks: [] };
    els.cover.src = data.cover || "";
    els.name.textContent = data.name || "歌单";
    els.owner.textContent = data.owner || "OoKr4z";
    els.count.textContent = String(data.tracks.length);
    try {
      const saved = parseInt(localStorage.getItem("music-volume") || "80", 10);
      if (isFinite(saved)) volume = Math.max(0, Math.min(100, saved));
    } catch (e) { /* ignore */ }
    els.audio.volume = volume / 100;
    els.volume.value = String(volume);
    els.volumeLabel.textContent = volume + "%";
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
    els.toggle.addEventListener("click", function () {
      if (!els.audio.src) {
        if (data.tracks.length) selectTrack(Math.max(0, selected), true);
        return;
      }
      if (els.audio.paused) {
        audioPlay();
      } else {
        els.audio.pause();
      }
    });
    els.prev.addEventListener("click", function () {
      if (!data.tracks.length) return;
      selectTrack((selected - 1 + data.tracks.length) % data.tracks.length, true);
    });
    els.next.addEventListener("click", function () {
      if (!data.tracks.length) return;
      selectTrack((selected + 1) % data.tracks.length, true);
    });
    els.seek.addEventListener("input", function () {
      seeking = true;
      const d = els.audio.duration;
      if (isFinite(d) && d > 0) {
        els.audio.currentTime = (parseInt(els.seek.value, 10) / 1000) * d;
        els.current.textContent = formatTime(els.audio.currentTime);
      }
    });
    ["change", "pointerup", "touchend"].forEach(function (evt) {
      els.seek.addEventListener(evt, function () { seeking = false; });
    });
    els.volume.addEventListener("input", function () {
      volume = Math.max(0, Math.min(100, parseInt(els.volume.value, 10) || 0));
      els.audio.volume = volume / 100;
      els.volumeLabel.textContent = volume + "%";
      try { localStorage.setItem("music-volume", String(volume)); } catch (e) { /* ignore */ }
    });

    els.audio.addEventListener("loadedmetadata", function () {
      els.duration.textContent = formatTime(els.audio.duration);
    });
    els.audio.addEventListener("timeupdate", function () {
      if (seeking) return;
      const d = els.audio.duration;
      if (isFinite(d) && d > 0) els.seek.value = String(Math.round(els.audio.currentTime / d * 1000));
      els.current.textContent = formatTime(els.audio.currentTime);
      if (isFinite(d)) els.duration.textContent = formatTime(d);
    });
    els.audio.addEventListener("play", function () {
      els.toggle.textContent = "⏸";
      els.toggle.setAttribute("aria-label", "暂停");
      els.status.textContent = "正在播放 · 网易云音乐";
      els.nowLabel.textContent = "NOW PLAYING";
    });
    els.audio.addEventListener("pause", function () {
      els.toggle.textContent = "▶";
      els.toggle.setAttribute("aria-label", "播放");
      if (selected >= 0 && !els.audio.ended) els.nowLabel.textContent = "PAUSED";
    });
    els.audio.addEventListener("waiting", function () {
      els.status.textContent = "缓冲中…";
    });
    els.audio.addEventListener("playing", function () {
      els.status.textContent = "正在播放 · 网易云音乐";
    });
    els.audio.addEventListener("ended", function () {
      if (data.tracks.length > 1) selectTrack((selected + 1) % data.tracks.length, true);
      else {
        els.toggle.textContent = "▶";
        els.status.textContent = "播放结束";
      }
    });
    els.audio.addEventListener("error", function () {
      els.toggle.textContent = "▶";
      els.status.textContent = "这首歌暂时不能播放（版权 / 会员限制）";
    });
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

  function streamUrl(id) {
    return "https://music.163.com/song/media/outer/url?id=" + encodeURIComponent(id) + ".mp3";
  }

  function audioPlay() {
    const p = els.audio.play();
    if (p && p.catch) {
      p.catch(function () {
        els.status.textContent = "播放失败，可能是版权 / 会员限制";
        els.toggle.textContent = "▶";
      });
    }
  }

  function selectTrack(index, play) {
    if (!data || !data.tracks[index]) return;
    const t = data.tracks[index];
    const changed = selected !== index;
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

    if (changed || !els.audio.src) {
      els.audio.src = streamUrl(t.id);
      els.audio.load();
      els.current.textContent = "0:00";
      els.duration.textContent = formatTime(t.duration);
      els.seek.value = "0";
    }
    if (play) {
      audioPlay();
      if (window.innerWidth < 760) {
        setTimeout(function () {
          const card = els.nowTitle.closest(".now-card");
          if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    }
    if (!play) els.status.textContent = "点播放按钮开始";
  }

  window.MusicRoom = {
    enter: function () {
      if (!els) cache();
      active = true;
      if (!data) init();
      if (els.audio) els.audio.volume = volume / 100;
      if (selected >= 0) {
        const row = els.list.querySelector('.track-row[data-index="' + selected + '"]');
        if (row) row.classList.add("active");
      }
    },
    exit: function () {
      active = false;
      if (els && els.audio) els.audio.pause();
    },
    stop: function () {
      if (!els || !els.audio) return;
      els.audio.pause();
      try { els.audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
  };
})();
