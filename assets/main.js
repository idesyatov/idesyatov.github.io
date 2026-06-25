/* idesyatov.github.io — live data + interactive terminal
 * Constraints: only unauthenticated public GitHub API, max 2 requests,
 * cached in localStorage (TTL 45 min), graceful fallback to stats.json. */
(function () {
  "use strict";

  var USER = "idesyatov";
  var TTL = 45 * 60 * 1000; // 45 min
  var LANG_COLORS = {
    Go: "#00ADD8", TypeScript: "#3178c6", Shell: "#89e051", Rust: "#dea584",
    Nix: "#9aa5ce", Python: "#3572A5", Ruby: "#701516", Haskell: "#5e5086"
  };
  // Curated featured order (real repos from the API). Others appended after.
  var FEATURED = [
    "http-runner", "wharf", "ssl-watch", "rscan", "socks-monitor",
    "t0015", "bs4a", "homebrew-tap", "j4f", "j4kube"
  ];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var el = function (tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; };
  var esc = function (s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

  /* ---------- localStorage cache ---------- */
  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.t) > TTL) return null;
      return obj.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) {}
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  /* ---------- snapshot stats (heavy metrics, never computed in-browser) ---------- */
  function renderLanguages(langs) {
    var ul = $("#langs");
    if (!ul) return;
    ul.innerHTML = "";
    langs.forEach(function (l) {
      var li = el("li");
      li.innerHTML =
        '<span class="lang__name">' + esc(l.name) + '</span>' +
        '<span class="lang__bar"><span class="lang__fill"></span></span>' +
        '<span class="lang__pct">' + esc(l.pct) + '%</span>';
      var fill = $(".lang__fill", li);
      fill.style.width = Math.max(2, Math.min(100, l.pct)) + "%";
      fill.style.background = l.color || LANG_COLORS[l.name] || "#9aa5ce";
      ul.appendChild(li);
    });
  }

  function renderStats(code) {
    var ul = $("#stats");
    if (!ul) return;
    var items = [
      ["Languages", code.languages],
      ["Code", code.totalCodeKB + " KB"],
      ["Commits 2026", code.commits2026],
      ["Pull Requests", code.pullRequests],
      ["Commits 7d", code.commits7d]
    ];
    ul.innerHTML = "";
    items.forEach(function (it) {
      var li = el("li");
      li.innerHTML = "<span>" + esc(it[0]) + ":</span> <b>" + esc(it[1]) + "</b>";
      ul.appendChild(li);
    });
  }

  function setStat(name, value) {
    var node = document.querySelector('[data-stat="' + name + '"]');
    if (node && value != null) node.textContent = value;
  }

  function loadSnapshot() {
    return getJSON("stats.json").then(function (s) {
      if (s.languages) renderLanguages(s.languages);
      if (s.code) renderStats(s.code);
      if (s.profile) {
        setStat("followers", s.profile.followers);
        setStat("public_repos", s.profile.public_repos);
      }
      var note = $("#stats-note");
      if (note && s.updated) {
        note.hidden = false;
        note.textContent = "↳ snapshot " + s.updated + " · heavy metrics are not computed in-browser (API limits)";
      }
      return s;
    }).catch(function () {/* page still works without it */});
  }

  /* ---------- live profile (1 request) ---------- */
  function loadProfile() {
    var cached = cacheGet("gh_profile");
    var apply = function (p) {
      if (!p) return;
      setStat("followers", p.followers);
      setStat("public_repos", p.public_repos);
    };
    if (cached) { apply(cached); return; }
    getJSON("https://api.github.com/users/" + USER)
      .then(function (p) { cacheSet("gh_profile", p); apply(p); })
      .catch(function () {/* fallback values from snapshot stay */});
  }

  /* ---------- live repositories (1 request) ---------- */
  function langColor(name) { return LANG_COLORS[name] || "#9aa5ce"; }

  function timeAgo(iso) {
    if (!iso) return "";
    var d = (Date.now() - new Date(iso).getTime()) / 1000;
    var units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(d / units[i][1]);
      if (n >= 1) return n + units[i][0] + " ago";
    }
    return "just now";
  }

  function repoCard(r) {
    var li = el("li", "card");
    var head = el("div", "card__head");
    var a = el("a", "card__name");
    a.href = r.html_url; a.rel = "noopener"; a.textContent = r.name;
    head.appendChild(a);
    if (r.stargazers_count > 0) {
      var star = el("span", "card__star");
      star.textContent = "★ " + r.stargazers_count;
      head.appendChild(star);
    }
    li.appendChild(head);

    if (r.description) {
      var desc = el("p", "card__desc");
      desc.textContent = r.description;
      li.appendChild(desc);
    }

    if (r.topics && r.topics.length) {
      var tp = el("div", "card__topics");
      r.topics.slice(0, 4).forEach(function (t) {
        var s = el("span", "topic"); s.textContent = t; tp.appendChild(s);
      });
      li.appendChild(tp);
    }

    var meta = el("div", "card__meta");
    if (r.language) {
      var lang = el("span", "card__lang");
      var dot = el("span", "dotlang"); dot.style.background = langColor(r.language);
      lang.appendChild(dot);
      lang.appendChild(document.createTextNode(r.language));
      meta.appendChild(lang);
    }
    if (r.pushed_at) {
      var pushed = el("span");
      pushed.textContent = "pushed " + timeAgo(r.pushed_at);
      meta.appendChild(pushed);
    }
    li.appendChild(meta);
    return li;
  }

  function orderRepos(repos) {
    var byName = {};
    repos.forEach(function (r) { if (!r.fork && !r.archived) byName[r.name] = r; });
    var seen = {}, out = [];
    FEATURED.forEach(function (n) { if (byName[n]) { out.push(byName[n]); seen[n] = 1; } });
    // append remaining non-fork repos with a description, by recent push
    Object.keys(byName).forEach(function (n) { if (!seen[n] && byName[n].description) out.push(byName[n]); });
    return out;
  }

  function renderProjects(repos) {
    var ul = $("#projects");
    var status = $("#projects-status");
    if (!ul) return;
    ul.innerHTML = "";
    var ordered = orderRepos(repos);
    ordered.forEach(function (r) { ul.appendChild(repoCard(r)); });
    if (status) { status.hidden = true; status.textContent = ""; }
  }

  function showSkeletons() {
    var ul = $("#projects");
    if (!ul) return;
    for (var i = 0; i < 6; i++) ul.appendChild(el("li", "skeleton"));
  }

  function projectsError() {
    var status = $("#projects-status");
    var ul = $("#projects");
    if (ul) ul.innerHTML = "";
    if (status) {
      status.hidden = false;
      status.textContent = "GitHub API unavailable (rate-limited?) — see the full repo list below.";
    }
  }

  function loadRepos() {
    var cached = cacheGet("gh_repos");
    if (cached) { renderProjects(cached); return; }
    showSkeletons();
    getJSON("https://api.github.com/users/" + USER + "/repos?sort=pushed&per_page=100")
      .then(function (repos) {
        if (!Array.isArray(repos)) throw new Error("bad payload");
        cacheSet("gh_repos", repos);
        renderProjects(repos);
      })
      .catch(projectsError);
  }

  /* ---------- interactive terminal (bonus) ---------- */
  function initTerminal() {
    var form = $("#term-form"), input = $("#term-input"), out = $("#term-out");
    if (!form || !input || !out) return;

    function print(text, cls) {
      var p = el("p", "term__line" + (cls ? " " + cls : ""));
      p.innerHTML = text; // callers pass pre-escaped / trusted markup
      out.appendChild(p);
      out.scrollTop = out.scrollHeight;
    }

    var COMMANDS = {
      help: function () {
        print("available: <span class='path'>help whoami projects stack contact clear</span>");
      },
      whoami: function () {
        print("idesyatov — DevOps · SRE · Cloud Native");
        print("<span class='muted'>platform engineering · GitOps · reliability · scalability</span>");
      },
      projects: function () {
        print("featured: " + FEATURED.map(function (n) {
          return "<a href='https://github.com/" + USER + "/" + n + "' rel='noopener'>" + n + "</a>";
        }).join(" "));
      },
      stack: function () {
        print("Docker Kubernetes Terraform Ansible CI/CD Prometheus Grafana Linux Git Networking");
      },
      contact: function () {
        print("github: <a href='https://github.com/" + USER + "' rel='noopener'>github.com/" + USER + "</a>");
      },
      clear: function () { out.innerHTML = ""; }
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = input.value.trim();
      input.value = "";
      if (!raw) return;
      print("<span class='user'>idesyatov@github</span><span class='sep'>:</span>" +
            "<span class='path'>~</span><span class='dollar'>$</span> " + esc(raw));
      var cmd = raw.split(/\s+/)[0].toLowerCase();
      if (COMMANDS[cmd]) COMMANDS[cmd]();
      else print("command not found: " + esc(cmd) + " — try <span class='path'>help</span>", "err");
    });
  }

  /* ---------- boot ---------- */
  loadSnapshot();
  loadProfile();
  loadRepos();
  initTerminal();
})();
