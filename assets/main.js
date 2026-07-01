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
  var THEMES = ["tokyo-night", "gruvbox", "dracula"];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var el = function (tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; };
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

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

  /* ---------- visitor geo (public IP, used by `whoami`) ---------- */
  // Windows desktop doesn't render flag emoji (shows the 2-letter code instead),
  // so prefer an <img> from flagcdn; fall back to the emoji where it works.
  // returns a DOM node (img with emoji/text fallback) or null — built via the
  // DOM so third-party emoji data never lands in an inline handler string.
  function flagNode(cc, emoji) {
    if (cc && cc.length === 2) {
      var img = el("img", "flag");
      img.src = "https://flagcdn.com/20x15/" + cc.toLowerCase() + ".png";
      img.width = 20; img.height = 15;
      img.alt = cc.toUpperCase();
      img.loading = "lazy";
      img.onerror = emoji
        ? function () { this.replaceWith(document.createTextNode(emoji)); }
        : function () { this.remove(); };
      return img;
    }
    return emoji ? document.createTextNode(emoji) : null;
  }

  function flagFromCC(cc) {
    if (!cc || cc.length !== 2) return "";
    var base = 0x1F1E6 - "A".charCodeAt(0);
    cc = cc.toUpperCase();
    return String.fromCodePoint(base + cc.charCodeAt(0)) +
           String.fromCodePoint(base + cc.charCodeAt(1));
  }

  // Tried in order; first reachable provider that returns an IP wins.
  // Some providers are unreachable from certain regions, hence the fallback.
  var GEO_PROVIDERS = [
    { url: "https://ipwho.is/", map: function (g) {
        if (!g || g.success === false || !g.ip) return null;
        return { ip: g.ip, city: g.city, region: g.region, country: g.country,
                 cc: g.country_code, flag: g.flag && g.flag.emoji,
                 isp: g.connection && g.connection.isp,
                 timezone: g.timezone && g.timezone.id };
      } },
    { url: "https://get.geojs.io/v1/ip/geo.json", map: function (g) {
        if (!g || !g.ip) return null;
        return { ip: g.ip, city: g.city, region: g.region, country: g.country,
                 cc: g.country_code, flag: flagFromCC(g.country_code),
                 isp: g.organization_name,
                 timezone: g.timezone };
      } },
    { url: "https://ipapi.co/json/", map: function (g) {
        if (!g || g.error || !g.ip) return null;
        return { ip: g.ip, city: g.city, region: g.region, country: g.country_name,
                 cc: g.country_code, flag: flagFromCC(g.country_code),
                 isp: g.org,
                 timezone: g.timezone };
      } }
  ];

  // fetch with a hard timeout so a hanging provider doesn't stall the chain.
  function fetchTimeout(url, ms) {
    if (typeof AbortController === "undefined") return fetch(url);
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); return r; },
            function (e) { clearTimeout(t); throw e; });
  }

  /* ---------- AI/LLM news (public Hacker News search, used by `news`) ---------- */
  // Algolia HN API: free, CORS-enabled, no token. Latest stories mentioning LLM.
  function loadNews() {
    var cached = cacheGet("hn_news");
    if (cached) return Promise.resolve(cached);
    // restrict to title + no typo tolerance, else "llm" matches author nicks etc.
    var url = "https://hn.algolia.com/api/v1/search_by_date?query=LLM&tags=story" +
              "&hitsPerPage=8&restrictSearchableAttributes=title&typoTolerance=false";
    return fetchTimeout(url, 6000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.hits)) return null;
        var items = d.hits.filter(function (h) { return h.title; }).map(function (h) {
          return {
            title: h.title,
            url: h.url || "https://news.ycombinator.com/item?id=" + h.objectID,
            points: h.points || 0,
            created_at: h.created_at
          };
        });
        if (!items.length) return null;
        cacheSet("hn_news", items);
        return items;
      })
      .catch(function () { return null; });
  }

  function loadGeo() {
    var cached = cacheGet("geo");
    if (cached) return Promise.resolve(cached);
    var i = 0;
    function next() {
      if (i >= GEO_PROVIDERS.length) return null;
      var p = GEO_PROVIDERS[i++];
      return fetchTimeout(p.url, 4000)
        .then(function (r) { return r.json(); })
        .then(function (g) {
          var data = p.map(g);
          if (data && data.ip) { cacheSet("geo", data); return data; }
          return next();
        })
        .catch(function () { return next(); });
    }
    return next();
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

  // tiny bar chart from an array of counts, e.g. [0,2,5,1] -> "▁▄█▂"
  function sparkline(values) {
    var blocks = "▁▂▃▄▅▆▇█", max = 0, i, s = "";
    for (i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    for (i = 0; i < values.length; i++) {
      if (values[i] <= 0) { s += blocks.charAt(0); continue; }
      s += blocks.charAt(max <= 1 ? 3 : 1 + Math.round((values[i] / max) * (blocks.length - 2)));
    }
    return s;
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

  // repos idesyatov starred (used by `stars`); recently-starred first, cached.
  function getStars() {
    var cached = cacheGet("gh_stars");
    if (cached) return Promise.resolve(cached);
    return getJSON("https://api.github.com/users/" + USER + "/starred?per_page=10")
      .then(function (repos) {
        if (!Array.isArray(repos)) return null;
        cacheSet("gh_stars", repos);
        return repos;
      })
      .catch(function () { return null; });
  }

  // turn one raw GitHub event into a short line + link; null = skip (noisy type)
  function describeEvent(ev) {
    var repo = ev.repo && ev.repo.name;
    var p = ev.payload || {};
    var url = repo ? "https://github.com/" + repo : "https://github.com/" + USER;
    var text;
    switch (ev.type) {
      case "PushEvent":
        var n = p.size || (p.commits ? p.commits.length : 0);
        text = "pushed " + n + " commit" + (n === 1 ? "" : "s") + " to " + repo;
        break;
      case "CreateEvent":
        text = p.ref_type === "repository"
          ? "created repository " + repo
          : "created " + (p.ref_type || "ref") + (p.ref ? " " + p.ref : "") + " in " + repo;
        break;
      case "WatchEvent": text = "starred " + repo; break;
      case "ForkEvent": text = "forked " + repo; break;
      case "PublicEvent": text = "open-sourced " + repo; break;
      case "IssuesEvent":
        text = (p.action || "updated") + " issue in " + repo;
        if (p.issue && p.issue.html_url) url = p.issue.html_url;
        break;
      case "PullRequestEvent":
        var act = p.action;
        if (act === "closed" && p.pull_request && p.pull_request.merged) act = "merged";
        text = act + " PR in " + repo;
        if (p.pull_request && p.pull_request.html_url) url = p.pull_request.html_url;
        break;
      case "IssueCommentEvent":
        text = "commented in " + repo;
        if (p.comment && p.comment.html_url) url = p.comment.html_url;
        break;
      case "ReleaseEvent":
        text = "released " + (p.release && p.release.tag_name ? p.release.tag_name : "") + " in " + repo;
        if (p.release && p.release.html_url) url = p.release.html_url;
        break;
      default: return null;
    }
    return { text: text, url: url, created_at: ev.created_at };
  }

  // recent public GitHub activity (used by `activity`); cached as slim records.
  function getEvents() {
    var cached = cacheGet("gh_events");
    if (cached) return Promise.resolve(cached);
    return getJSON("https://api.github.com/users/" + USER + "/events/public?per_page=30")
      .then(function (events) {
        if (!Array.isArray(events) || !events.length) return null;
        var slim = events.map(function (ev) {
          var p = ev.payload || {};
          return {
            type: ev.type,
            created_at: ev.created_at,
            commits: ev.type === "PushEvent" ? (p.size || (p.commits ? p.commits.length : 0)) : 0,
            d: describeEvent(ev) // { text, url, created_at } or null
          };
        });
        cacheSet("gh_events", slim);
        return slim;
      })
      .catch(function () { return null; });
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
    var intro = out.innerHTML; // keep the hint line so `clear` doesn't wipe it
    var history = [], histIdx = 0;

    function print(text, cls) {
      var p = el("p", "term__line" + (cls ? " " + cls : ""));
      p.innerHTML = text; // callers pass pre-escaped / trusted markup
      out.appendChild(p);
      out.scrollTop = out.scrollHeight;
      return p;
    }

    var COMMANDS = {
      help: function () {
        print("commands: <span class='path'>help whoami stars news activity theme contact clear</span>");
        print("<span class='muted'>↑/↓ history · Tab autocomplete · just start typing to focus</span>");
      },
      theme: function (arg) {
        if (!arg) {
          print("current: <span class='path'>" + esc(currentTheme()) + "</span>");
          print("available: <span class='path'>" + THEMES.join(" ") + "</span> — usage: <span class='path'>theme &lt;name&gt;</span>");
          return;
        }
        if (THEMES.indexOf(arg) === -1) {
          print("unknown theme: " + esc(arg) + " — try <span class='path'>" + THEMES.join(" ") + "</span>", "err");
          return;
        }
        applyTheme(arg);
        print("theme set to <span class='path'>" + esc(arg) + "</span>");
      },
      whoami: function () {
        var line = print("<span class='muted'>resolving your network info…</span>");
        loadGeo().then(function (g) {
          if (!g || !g.ip) {
            line.innerHTML = "<span class='muted'>network info unavailable — try again later</span>";
            return;
          }
          var loc = [g.city, g.region, g.country].filter(Boolean).join(", ");
          line.innerHTML = "<span class='path'>ip:</span> " + esc(g.ip);
          if (loc) {
            var p = print("<span class='path'>location:</span> ");
            var fl = flagNode(g.cc, g.flag);
            if (fl) { p.appendChild(fl); p.appendChild(document.createTextNode(" ")); }
            p.appendChild(document.createTextNode(loc));
          }
          if (g.isp) print("<span class='path'>isp:</span> " + esc(g.isp));
          if (g.timezone) print("<span class='path'>timezone:</span> " + esc(g.timezone));
        });
      },
      stars: function () {
        var line = print("<span class='muted'>fetching starred repositories…</span>");
        getStars().then(function (repos) {
          if (!repos || !repos.length) {
            line.innerHTML = "<span class='muted'>stars unavailable — try again later</span>";
            return;
          }
          line.innerHTML = "<span class='muted'>" + repos.length + " repositories idesyatov starred · recent first</span>";
          repos.forEach(function (r) {
            var stars = r.stargazers_count > 0 ? " <span class='card__star'>★" + r.stargazers_count + "</span>" : "";
            var desc = r.description ? " <span class='muted'>— " + esc(r.description) + "</span>" : "";
            print("<a href='" + esc(r.html_url) + "' rel='noopener'>" + esc(r.full_name) + "</a>" + stars + desc);
          });
        });
      },
      news: function () {
        var line = print("<span class='muted'>fetching latest AI/LLM stories…</span>");
        loadNews().then(function (items) {
          if (!items || !items.length) {
            line.innerHTML = "<span class='muted'>news unavailable — try again later</span>";
            return;
          }
          line.innerHTML = "<span class='muted'>" + items.length + " latest LLM stories · via Hacker News</span>";
          items.forEach(function (n) {
            var meta = "<span class='muted'> · ▲" + n.points + " · " + esc(timeAgo(n.created_at)) + "</span>";
            print("<a href='" + esc(n.url) + "' rel='noopener'>" + esc(n.title) + "</a>" + meta);
          });
        });
      },
      activity: function () {
        var line = print("<span class='muted'>fetching recent GitHub activity…</span>");
        getEvents().then(function (evs) {
          if (!evs || !evs.length) {
            line.innerHTML = "<span class='muted'>activity unavailable — try again later</span>";
            return;
          }
          var c = { push: 0, commits: 0, pr: 0, star: 0, issue: 0, other: 0 };
          var days = [0, 0, 0, 0, 0, 0, 0]; // last 7 days, index 6 = today
          var now = Date.now();
          evs.forEach(function (e) {
            switch (e.type) {
              case "PushEvent": c.push++; c.commits += e.commits || 0; break;
              case "PullRequestEvent": c.pr++; break;
              case "WatchEvent": c.star++; break;
              case "IssuesEvent": case "IssueCommentEvent": c.issue++; break;
              default: c.other++;
            }
            var age = Math.floor((now - new Date(e.created_at).getTime()) / 86400000);
            if (age >= 0 && age < 7) days[6 - age]++;
          });

          line.innerHTML = "<span class='muted'>last active " + esc(timeAgo(evs[0].created_at)) +
                " · " + evs.length + " recent public events · via GitHub</span>";

          var parts = [];
          if (c.push) parts.push(c.push + " push" + (c.push === 1 ? "" : "es") +
                (c.commits ? " (" + c.commits + " commit" + (c.commits === 1 ? "" : "s") + ")" : ""));
          if (c.pr) parts.push(c.pr + " PR" + (c.pr === 1 ? "" : "s"));
          if (c.star) parts.push(c.star + " ★");
          if (c.issue) parts.push(c.issue + " issue" + (c.issue === 1 ? "" : "s"));
          if (c.other) parts.push(c.other + " other");
          print("<span class='path'>" + parts.join("</span> · <span class='path'>") + "</span>");
          print("<span class='muted'>7d</span> <span class='term__spark'>" + esc(sparkline(days)) + "</span>");

          var shown = 0, last = "";
          for (var j = 0; j < evs.length && shown < 6; j++) {
            var d = evs[j].d;
            if (!d || d.text === last) continue; // skip empties + repeats (e.g. auto-commits)
            last = d.text;
            print("<span class='muted'>" + esc(timeAgo(d.created_at)) + "</span> · " +
                  "<a href='" + esc(d.url) + "' rel='noopener'>" + esc(d.text) + "</a>");
            shown++;
          }
        });
      },
      contact: function () {
        print("github: <a href='https://github.com/" + USER + "' rel='noopener'>github.com/" + USER + "</a>");
      },
      clear: function () { out.innerHTML = intro; }
    };

    // block caret like the footer (green, blinking), positioned after the typed
    // text via an offscreen mirror — the native caret is hidden in CSS.
    var caret = el("span", "term__caret");
    var mirror = el("span", "term__mirror");
    input.parentNode.insertBefore(caret, input.nextSibling);
    form.appendChild(mirror);
    function syncCaret() {
      mirror.textContent = input.value;
      input.style.width = (mirror.offsetWidth + 2) + "px";
    }
    input.addEventListener("input", syncCaret);
    form.addEventListener("click", function () { input.focus(); });
    syncCaret();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = input.value.trim();
      input.value = "";
      syncCaret();
      if (!raw) return;
      history.push(raw);
      histIdx = history.length;
      print("<span class='user'>idesyatov@github</span><span class='sep'>:</span>" +
            "<span class='path'>~</span><span class='dollar'>$</span> " + esc(raw));
      var parts = raw.split(/\s+/);
      var cmd = parts[0].toLowerCase();
      if (COMMANDS[cmd]) COMMANDS[cmd](parts.slice(1).join(" "));
      else print("command not found: " + esc(cmd) + " — try <span class='path'>help</span>", "err");
    });

    // ↑/↓ walk command history, Tab completes against the command list
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        if (!history.length) return;
        e.preventDefault();
        if (histIdx > 0) histIdx--;
        input.value = history[histIdx] || "";
        syncCaret();
      } else if (e.key === "ArrowDown") {
        if (!history.length) return;
        e.preventDefault();
        if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
        else { histIdx = history.length; input.value = ""; }
        syncCaret();
      } else if (e.key === "Tab") {
        e.preventDefault();
        var prefix = input.value.trim().toLowerCase();
        if (!prefix) return;
        var matches = Object.keys(COMMANDS).filter(function (c) { return c.indexOf(prefix) === 0; });
        if (matches.length === 1) { input.value = matches[0]; syncCaret(); }
        else if (matches.length > 1) print("<span class='muted'>" + matches.join("  ") + "</span>");
      }
    });

    // start typing anywhere (no modifier, in no other field) → focus the terminal
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.key || e.key.length !== 1) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      input.focus();
    });
  }

  /* ---------- theme ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || THEMES[0];
  }
  function applyTheme(name) {
    if (THEMES.indexOf(name) === -1) name = THEMES[0];
    if (name === THEMES[0]) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", name);
    try { localStorage.setItem("theme", name); } catch (e) {}
    return name;
  }
  function savedTheme() {
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  }

  /* ---------- boot ---------- */
  applyTheme(savedTheme());
  loadSnapshot();
  loadProfile();
  loadRepos();
  initTerminal();
})();
