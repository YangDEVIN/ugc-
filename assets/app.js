(function () {
  "use strict";

  var state = {
    manifest: null,
    activeGuideId: null,   // null 表示当前在首页
    docsCache: {},         // file -> parsed json
    collapsedKeys: {}      // key -> true（折叠状态记录：文档模块级 / 一级标题 / 二级标题）
  };

  var els = {};

  var GUIDE_META = {
    changezhuang: {
      desc: "涵盖新手引导、关卡难度、换装玩法、商业化道具、UI美术等完整设计与制作参考。",
      color: "#4a6cf7"
    },
    mailiang: {
      desc: "买量地图的功能入口、皮肤/翅膀商店、付费点、AI辅助制图等商业化制作全流程教程。",
      color: "#ff8a3d"
    }
  };

  function qs(sel) { return document.querySelector(sel); }

  function init() {
    els.tabs = qs("#tabs");
    els.toc = qs("#toc");
    els.content = qs("#content");
    els.loading = qs("#loading");
    els.homeView = qs("#homeView");
    els.homeCards = qs("#homeCards");
    els.sidebar = qs("#sidebar");
    els.sidebarMask = qs("#sidebarMask");
    els.menuBtn = qs("#menuBtn");
    els.closeBtn = qs("#closeBtn");
    els.backTop = qs("#backTop");
    els.sidebarTitle = qs("#sidebarTitle");
    els.brandHome = qs("#brandHome");
    els.bodyWrap = qs("#bodyWrap");

    els.menuBtn.addEventListener("click", openSidebar);
    els.closeBtn.addEventListener("click", closeSidebar);
    els.sidebarMask.addEventListener("click", closeSidebar);
    els.backTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    els.brandHome.addEventListener("click", showHome);
    els.brandHome.style.cursor = "pointer";
    window.addEventListener("scroll", onScroll);

    createLightbox();

    fetch("data/manifest.json")
      .then(function (r) { return r.json(); })
      .then(function (manifest) {
        state.manifest = manifest;
        renderTabs();
        renderHomeCards();
        showHome();
      })
      .catch(function (err) {
        els.loading.style.display = "block";
        els.loading.textContent = "内容加载失败：" + err;
      });
  }

  function openSidebar() {
    els.sidebar.classList.add("open");
    els.sidebarMask.classList.add("show");
    els.menuBtn.classList.add("active");
  }
  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.sidebarMask.classList.remove("show");
    els.menuBtn.classList.remove("active");
  }

  function onScroll() {
    if (window.scrollY > 300) {
      els.backTop.classList.add("show");
    } else {
      els.backTop.classList.remove("show");
    }
    if (state.activeGuideId) highlightActiveToc();
  }

  function renderTabs() {
    els.tabs.innerHTML = "";

    var homeBtn = document.createElement("button");
    homeBtn.className = "tab-btn tab-home";
    homeBtn.textContent = "首页";
    homeBtn.addEventListener("click", showHome);
    els.tabs.appendChild(homeBtn);

    state.manifest.guides.forEach(function (g) {
      var btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.textContent = g.title;
      btn.dataset.guideId = g.id;
      btn.addEventListener("click", function () { loadGuide(g.id); });
      els.tabs.appendChild(btn);
    });
  }

  function setActiveTab(guideId) {
    var btns = els.tabs.querySelectorAll(".tab-btn");
    btns.forEach(function (b) {
      var isHome = b.classList.contains("tab-home");
      if (guideId === null) {
        b.classList.toggle("active", isHome);
      } else {
        b.classList.toggle("active", b.dataset.guideId === guideId);
      }
    });
  }

  function renderHomeCards() {
    els.homeCards.innerHTML = "";
    state.manifest.guides.forEach(function (g) {
      var meta = GUIDE_META[g.id] || { desc: "", color: "#4a6cf7" };
      var card = document.createElement("div");
      card.className = "home-card";
      card.style.setProperty("--card-color", meta.color);
      card.innerHTML =
        '<div class="home-card-title">' + escapeHtml(g.title) + '</div>' +
        '<div class="home-card-desc">' + escapeHtml(meta.desc) + '</div>' +
        '<div class="home-card-meta">共 ' + g.docs.length + ' 篇文档</div>' +
        '<div class="home-card-arrow">进入指南 →</div>';
      card.addEventListener("click", function () { loadGuide(g.id); });
      els.homeCards.appendChild(card);
    });
  }

  function showHome() {
    state.activeGuideId = null;
    setActiveTab(null);
    closeSidebar();
    els.bodyWrap.classList.add("home-mode"); // 首页隐藏侧边栏目录
    els.homeView.style.display = "block";
    els.loading.style.display = "none";
    document.querySelectorAll(".doc-section").forEach(function (s) { s.remove(); });
    window.scrollTo({ top: 0 });
  }

  function loadGuide(guideId) {
    closeSidebar();
    els.bodyWrap.classList.remove("home-mode");
    if (state.activeGuideId === guideId) return;
    state.activeGuideId = guideId;
    setActiveTab(guideId);
    els.homeView.style.display = "none";
    els.loading.style.display = "block";
    els.loading.textContent = "正在加载内容...";
    document.querySelectorAll(".doc-section").forEach(function (s) { s.remove(); });
    els.toc.innerHTML = "";

    var guide = state.manifest.guides.find(function (g) { return g.id === guideId; });
    if (!guide) return;
    els.sidebarTitle.textContent = guide.title;

    var fetches = guide.docs.map(function (docMeta) {
      if (state.docsCache[docMeta.file]) {
        return Promise.resolve(state.docsCache[docMeta.file]);
      }
      return fetch(docMeta.file)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          state.docsCache[docMeta.file] = data;
          return data;
        });
    });

    Promise.all(fetches)
      .then(function (docsData) {
        renderGuide(guide, docsData);
        window.scrollTo({ top: 0 });
      })
      .catch(function (err) {
        els.loading.textContent = "内容加载失败：" + err;
      });
  }

  // 将文档中原始的标题 level（可能跳跃、不连续）归一化为相对层级 1~5
  function normalizeLevels(blocks) {
    var headingLevels = [];
    blocks.forEach(function (b) {
      if (b.type === "heading" && headingLevels.indexOf(b.level) === -1) {
        headingLevels.push(b.level);
      }
    });
    headingLevels.sort(function (a, b) { return a - b; });
    var map = {};
    headingLevels.forEach(function (lv, idx) {
      map[lv] = Math.min(idx + 1, 5);
    });
    return map;
  }

  function renderGuide(guide, docsData) {
    els.loading.style.display = "none";
    var contentHtml = [];
    var anchorCounter = 0;
    var tocDocs = []; // { docId, title, isNew, items: [{anchorId, level, text, isNew}] }

    guide.docs.forEach(function (docMeta, docIdx) {
      var data = docsData[docIdx];
      var levelMap = normalizeLevels(data.blocks);
      var tocItems = [];

      contentHtml.push('<section class="doc-section" data-doc-id="' + docMeta.id + '">');

      data.blocks.forEach(function (block) {
        if (block.type === "heading") {
          anchorCounter++;
          var anchorId = "h-" + docMeta.id + "-" + anchorCounter;
          var normLv = levelMap[block.level] || 1;
          contentHtml.push(
            '<h' + Math.min(normLv + 1, 6) + ' id="' + anchorId + '" class="block-heading-' + normLv + '">' +
              escapeHtml(block.text) +
            "</h" + Math.min(normLv + 1, 6) + ">"
          );
          tocItems.push({
            anchorId: anchorId,
            level: normLv,
            text: block.text,
            isNew: !!block.isNew
          });
        } else if (block.type === "para") {
          contentHtml.push('<p class="block-para">' + escapeHtml(block.text) + "</p>");
        } else if (block.type === "image") {
          var src = docMeta.imgBase + "/" + block.src;
          contentHtml.push(
            '<div class="block-image"><img src="' + src + '" loading="lazy" alt="配图"></div>'
          );
        } else if (block.type === "table") {
          contentHtml.push('<div class="block-table">' + mdTableToHtml(block.md) + "</div>");
        }
      });

      contentHtml.push("</section>");
      tocDocs.push({
        docId: docMeta.id,
        title: docMeta.title,
        isNew: !!docMeta.isNew,
        items: tocItems
      });
    });

    els.content.insertAdjacentHTML("beforeend", contentHtml.join(""));
    renderToc(guide.id, tocDocs);

    els.content.querySelectorAll(".block-image img").forEach(function (img) {
      img.addEventListener("click", function () { openLightbox(img.src); });
    });

    highlightActiveToc();
  }

  function dotHtml(isNew) {
    return isNew ? '<span class="toc-dot" title="有更新"></span>' : "";
  }

  // 递归构建可折叠目录树：
  // - 文档模块（doc）自身可折叠
  // - level 1 标题可折叠（包裹其下所有 level>=2，直到下一个 level<=1）
  // - level 2 标题可折叠（包裹其下所有 level>=3，直到下一个 level<=2）
  // - level >=3 直接铺开显示
  function buildItemsHtml(items, startIdx, endIdx, guideId, docId) {
    var html = [];
    var i = startIdx;
    while (i < endIdx) {
      var item = items[i];

      if (item.level === 1 || item.level === 2) {
        var j = i + 1;
        while (j < endIdx && items[j].level > item.level) j++;
        var hasChildren = j > i + 1;

        if (hasChildren) {
          var groupKey = "grp-" + guideId + "-" + docId + "-" + item.anchorId;
          var collapsed = state.collapsedKeys[groupKey] !== false;
          html.push(
            '<div class="toc-group' + (collapsed ? " collapsed" : "") + '" data-group-key="' + groupKey + '">' +
              '<div class="toc-item toc-parent toc-lv-' + item.level + '" data-anchor="' + item.anchorId + '">' +
                '<span class="toc-caret">▾</span>' +
                '<span class="toc-label">' + escapeHtml(item.text) + '</span>' +
                dotHtml(item.isNew) +
              '</div>' +
              '<div class="toc-children">' +
                buildItemsHtml(items, i + 1, j, guideId, docId) +
              '</div>' +
            '</div>'
          );
        } else {
          html.push(
            '<a class="toc-item toc-lv-' + item.level + '" data-anchor="' + item.anchorId + '">' +
              '<span class="toc-label">' + escapeHtml(item.text) + '</span>' +
              dotHtml(item.isNew) +
            '</a>'
          );
        }
        i = j;
      } else {
        html.push(
          '<a class="toc-item toc-lv-' + item.level + '" data-anchor="' + item.anchorId + '">' +
            '<span class="toc-label">' + escapeHtml(item.text) + '</span>' +
            dotHtml(item.isNew) +
          '</a>'
        );
        i++;
      }
    }
    return html.join("");
  }

  function renderToc(guideId, tocDocs) {
    var html = [];

    tocDocs.forEach(function (doc) {
      var docGroupKey = "doc-" + guideId + "-" + doc.docId;
      var docCollapsed = state.collapsedKeys[docGroupKey] !== false;
      html.push(
        '<div class="toc-doc-group' + (docCollapsed ? " collapsed" : "") + '" data-doc-group-key="' + docGroupKey + '">' +
          '<div class="toc-doc-title toc-doc-parent">' +
            '<span class="toc-caret toc-doc-caret">▾</span>' +
            '<span class="toc-label">' + escapeHtml(doc.title) + '</span>' +
            dotHtml(doc.isNew) +
          '</div>' +
          '<div class="toc-doc-children">' +
            buildItemsHtml(doc.items, 0, doc.items.length, guideId, doc.docId) +
          '</div>' +
        '</div>'
      );
    });

    els.toc.innerHTML = html.join("");

    // 文档模块折叠
    els.toc.querySelectorAll(".toc-doc-parent").forEach(function (headEl) {
      headEl.addEventListener("click", function () {
        var group = headEl.closest(".toc-doc-group");
        var key = group.dataset.docGroupKey;
        var willCollapse = !group.classList.contains("collapsed");
        group.classList.toggle("collapsed", willCollapse);
        state.collapsedKeys[key] = willCollapse;
      });
    });

    // 标题级折叠（一级/二级）
    els.toc.querySelectorAll(".toc-parent").forEach(function (parentEl) {
      parentEl.addEventListener("click", function (e) {
        if (e.target.classList.contains("toc-caret")) {
          e.stopPropagation();
          var group = parentEl.closest(".toc-group");
          var key = group.dataset.groupKey;
          var willCollapse = !group.classList.contains("collapsed");
          group.classList.toggle("collapsed", willCollapse);
          state.collapsedKeys[key] = willCollapse;
          return;
        }
        jumpToAnchor(parentEl.dataset.anchor);
      });
    });

    els.toc.querySelectorAll(".toc-item:not(.toc-parent)").forEach(function (a) {
      a.addEventListener("click", function () {
        jumpToAnchor(a.dataset.anchor);
      });
    });
  }

  function jumpToAnchor(id) {
    var target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    closeSidebar();
  }

  function highlightActiveToc() {
    var headings = els.content.querySelectorAll("[id^='h-']");
    if (!headings.length) return;
    var activeId = null;
    var offset = 90;
    for (var i = 0; i < headings.length; i++) {
      var rect = headings[i].getBoundingClientRect();
      if (rect.top - offset <= 0) {
        activeId = headings[i].id;
      } else {
        break;
      }
    }
    if (!activeId) activeId = headings[0].id;

    // 先清空所有高亮
    els.toc.querySelectorAll(".toc-item.active").forEach(function (a) {
      a.classList.remove("active");
    });

    var currentEl = els.toc.querySelector('.toc-item[data-anchor="' + activeId + '"]');
    if (!currentEl) return;
    currentEl.classList.add("active");

    // 常驻高亮：沿 DOM 向上追溯所属的一级/二级标题组、以及文档模块标题，即便处于折叠状态也保持高亮
    var groupEl = currentEl.closest(".toc-group");
    while (groupEl) {
      var parentHead = groupEl.querySelector(".toc-parent");
      if (parentHead) parentHead.classList.add("active");
      groupEl = groupEl.parentElement ? groupEl.parentElement.closest(".toc-group") : null;
    }

    var docGroupEl = currentEl.closest(".toc-doc-group");
    if (docGroupEl) {
      var docHead = docGroupEl.querySelector(".toc-doc-parent");
      if (docHead) docHead.classList.add("active");
    }
  }

  function mdTableToHtml(md) {
    var lines = md.trim().split("\n").filter(function (l) { return l.trim().length; });
    if (lines.length < 2) return "";
    var rowsRaw = lines.filter(function (l, idx) { return idx !== 1; }); // skip separator row
    var html = "<table>";
    rowsRaw.forEach(function (line, idx) {
      var cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
      var tag = idx === 0 ? "th" : "td";
      html += "<tr>" + cells.map(function (c) {
        return "<" + tag + ">" + c.replace(/<br>/g, "<br>") + "</" + tag + ">";
      }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createLightbox() {
    var box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = '<img src="" alt="预览">';
    document.body.appendChild(box);
    box.addEventListener("click", function () { box.classList.remove("show"); });
    els.lightbox = box;
    els.lightboxImg = box.querySelector("img");
  }

  function openLightbox(src) {
    els.lightboxImg.src = src;
    els.lightbox.classList.add("show");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
