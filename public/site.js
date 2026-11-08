// Infinite Fitness U0 review build: behaviour for the static mockup.
// Patterns ported from the Success Studio static build (src/js/site.js) and FASTER components/motion.tsx:
// opaque header on scroll · desktop dropdowns · phone menu (Esc, outside tap, scroll lock) · booking drawer with studio lock ·
// lead forms in preview mode (nothing is sent) · review clamp + Read more modal (and team bios) · text-us picker ·
// video dialog (style guide) · studio cards' Today line · reveals, word reveal,
// scroll-scrubbed statement, hero frame that grows on scroll · links to later-unit pages show a preview toast.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const APP = document.documentElement.hasAttribute("data-app"); // the Next.js site; without it this is the static mockup
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Header: opaque white + hairline once scrolling starts (D-014) ----------
  const header = $("[data-header]");
  const onScrollHeader = () => header && header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  // ---------- Desktop dropdowns: hover or keyboard focus opens; Esc / leaving closes; closed panels are inert ----------
  $$("[data-menu]").forEach((wrap) => {
    const link = $("a[aria-expanded]", wrap);
    const panel = $(".menu-panel", wrap);
    let dismissed = false, timer = 0;
    const set = (open) => { panel.classList.toggle("is-open", open); panel.inert = !open; link.setAttribute("aria-expanded", String(open)); };
    set(false);
    wrap.addEventListener("mouseenter", () => { clearTimeout(timer); dismissed = false; set(true); });
    wrap.addEventListener("mouseleave", () => { dismissed = false; timer = setTimeout(() => set(false), 160); });
    wrap.addEventListener("focusin", (e) => { if (!dismissed || panel.contains(e.target)) { dismissed = false; set(true); } });
    wrap.addEventListener("focusout", (e) => { if (!wrap.contains(e.relatedTarget)) { dismissed = false; set(false); } });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !panel.classList.contains("is-open")) return;
      dismissed = true; set(false);
      if (wrap.contains(document.activeElement)) link.focus();
    });
  });

  // ---------- Phone menu (below 1280) ----------
  const toggle = $("[data-menu-toggle]");
  const mob = $("[data-mob-menu]");
  const syncAcc = () => $$("[data-acc]", mob || document).forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    const open = btn.getAttribute("aria-expanded") === "true";
    if (!panel) return;
    panel.classList.toggle("is-open", open);
    panel.inert = !open;
    const live = open && mob.classList.contains("is-open");
    $$("[data-acc-link]", panel).forEach((a) => { a.tabIndex = live ? 0 : -1; });
  });
  const setMenu = (open) => {
    if (!toggle || !mob) return;
    mob.classList.toggle("is-open", open);
    mob.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    $(".menu-icon", toggle).classList.toggle("is-open", open);
    header.classList.toggle("is-open", open);
    document.documentElement.classList.toggle("menu-locked", open);
    $$("main, footer, .skip").forEach((el) => { el.inert = open; });
    $$(".mob-item", mob).forEach((el, i) => {
      el.style.transitionDelay = open ? `${60 + i * 40}ms` : "0ms";
      const f = el.matches("a, button") ? el : $("button", el);
      if (f) f.tabIndex = open ? 0 : -1;
    });
    syncAcc();
  };
  if (toggle && mob) {
    setMenu(false);
    toggle.addEventListener("click", () => setMenu(!mob.classList.contains("is-open")));
    $$("[data-acc]", mob).forEach((btn) => btn.addEventListener("click", () => {
      btn.setAttribute("aria-expanded", String(btn.getAttribute("aria-expanded") !== "true"));
      syncAcc();
    }));
    // An outside tap only dismisses the menu: it must not also press whatever sits under it (capture phase).
    document.addEventListener("click", (e) => {
      if (mob.classList.contains("is-open") && !header.contains(e.target)) { e.preventDefault(); e.stopPropagation(); setMenu(false); }
    }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && mob.classList.contains("is-open")) { setMenu(false); toggle.focus(); } });
    window.matchMedia("(min-width: 1280px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });
  }
  const closeMenu = () => mob && mob.classList.contains("is-open") && setMenu(false);

  // ---------- Toast + routing (the review build has three pages; other stems are later units) ----------
  const toast = $("[data-toast]");
  let toastTimer = 0;
  const say = (msg) => {
    if (!toast) return;
    // An open dialog sits in the top layer over a blurred backdrop: the toast goes inside it so it stays readable (and is not inert)
    const host = document.querySelector("dialog[open]") || document.body;
    if (toast.parentNode !== host) { toast.classList.remove("is-on"); host.append(toast); void toast.offsetWidth; }
    toast.textContent = msg;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2800);
  };
  const ROUTES = { "/": "index.html", "/programs/small-group-personal-training": "small-group.html", "/programs/private-personal-training": "private-training.html", "/programs": "programs.html",
    "/getting-started": "getting-started.html", "/new-to-exercise": "new-to-exercise.html", "/women-over-40": "women-over-40.html", "/injuries-and-joint-pain": "injuries-and-joint-pain.html",
    "/results": "results.html", "/success-stories/jennifer": "story-jennifer.html", "/success-stories/cindy": "story-cindy.html", "/success-stories/lauren": "story-lauren.html", "/locations": "locations.html", "/locations/shoal-creek": "shoal-creek.html", "/locations/steiner-ranch": "steiner-ranch.html",
    "/locations/roundrock": "round-rock.html", "/about": "about.html", "/team": "team.html", "/faq": "faq.html", "/book": "book.html", "/careers": "careers.html",
    "/privacy-policy": "privacy-policy.html", "/terms-of-service": "terms-of-service.html", "/accessibility": "accessibility.html" };

  // ---------- Dialog helper: open with showModal; close on X / outside / Esc; focus back to the opener ----------
  const dialogs = new Map();
  const setupDialog = (dlg, cardSel, onClose) => {
    if (!dlg || typeof dlg.showModal !== "function") return null;
    let opener = null;
    $$("[data-close]", dlg).forEach((b) => b.addEventListener("click", () => dlg.close()));
    dlg.addEventListener("click", (e) => { if (!e.target.closest(cardSel)) dlg.close(); });
    dlg.addEventListener("close", () => { onClose && onClose(); if (opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null; });
    const open = (from) => { opener = from || document.activeElement; closeMenu(); if (!dlg.open) dlg.showModal(); };
    dialogs.set(dlg, open);
    return open;
  };

  // ---------- Lead forms: preview mode. Valid submit → in-place success with the preview note; nothing is sent ----------
  // A field that is empty or wrong after you leave it (or on send) gets aria-invalid and its own message under it, linked by
  // aria-describedby; on send, focus moves to the first field to fix. The phone hint is advice only (never blocks sending).
  const describe = (input, id, on) => {
    const p = document.getElementById(id);
    if (!p) return;
    p.hidden = !on;
    const ids = (input.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
    if (on) ids.push(id);
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" ")); else input.removeAttribute("aria-describedby");
  };
  const oddPhone = (v) => { const d = v.replace(/\D/g, ""); return d.length > 0 && d.length !== 10 && !(d.length === 11 && d[0] === "1"); };
  const checkField = (i) => {
    const bad = !i.validity.valid;
    if (bad) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid");
    describe(i, `${i.id}-err`, bad);
    if (i.type === "tel") describe(i, `${i.id}-hint`, !bad && oddPhone(i.value));
    return !bad;
  };
  const setupForm = (form) => {
    const select = form.elements.namedItem("studio");
    form._all = Array.from(select.options).map((o) => o.cloneNode(true));
    form._t0 = Date.now();
    form.noValidate = true; // the inline messages replace the browser's bubble (without this script the browser still validates)
    $$(".input", form).forEach((i) => {
      i.addEventListener("blur", () => { i.classList.add("touched"); checkField(i); });
      i.addEventListener(i.tagName === "SELECT" ? "change" : "input", () => { if (i.classList.contains("touched")) checkField(i); });
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const bad = $$(".input", form).filter((i) => { i.classList.add("touched"); return !checkField(i); });
      if (bad.length) { bad[0].focus(); return; }
      const btn = $("button[type=submit]", form);
      const root = form.closest("[data-form-root]");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      const done = (preview) => {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        const ok = $("[data-form-success]", root);
        $(".preview-note", ok).hidden = !preview;
        form.hidden = true;
        ok.hidden = false;
        ok.focus({ preventScroll: true });
        ok.scrollIntoView({ block: "nearest" });
      };
      if (!APP) {
        // Mockup: no fetch, no dataLayer event, no lead.
        console.info("[preview] lead form submitted, not sent:", form.dataset.formId, select.value);
        setTimeout(() => done(true), 600);
        return;
      }
      const body = Object.fromEntries(new FormData(form));
      body.elapsed_ms = Date.now() - form._t0;
      body.page = location.pathname + location.search;
      fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => r.json().then((j) => { if (!r.ok || !j.ok) throw new Error("lead"); return j; }))
        .then((j) => {
          // Delivered leads only: a preview, spam drop or failed delivery must never count as a conversion
          if (j.delivered && window.dataLayer) {
            window.dataLayer.push({ event: "generate_lead", lead_location: select.selectedOptions[0].textContent, event_id: crypto.randomUUID(), interest: body.interest || "free_session", user_data: { email: body.email, phone_number: body.phone } });
          }
          done(j.preview);
        })
        .catch(() => {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
          const phone = select.selectedOptions[0] && select.selectedOptions[0].dataset.phone;
          const e = $("[data-form-error]", form);
          e.textContent = `That didn't send. Please try again${phone ? ` or call ${phone}` : ""}.`;
          e.hidden = false;
        });
    });
  };
  const resetForm = (form, studio) => {
    const root = form.closest("[data-form-root]");
    const select = form.elements.namedItem("studio");
    form.reset();
    $$(".input", form).forEach((i) => { i.classList.remove("touched"); i.removeAttribute("aria-invalid"); i.removeAttribute("aria-describedby"); });
    $$(".field-error, .field-hint", form).forEach((p) => { p.hidden = true; });
    select.replaceChildren(...form._all.map((o) => o.cloneNode(true)).filter((o) => !studio || o.value === studio));
    if (studio) { select.value = studio; select.options[0].selected = true; form.dataset.locked = studio; } else delete form.dataset.locked;
    $("[data-form-error]", form).hidden = true;
    $("[data-form-success]", root).hidden = true;
    form.hidden = false;
  };
  $$("form[data-lead]").forEach((f) => { if (!f.closest("[inert]")) setupForm(f); });

  // ---------- Booking drawer: every [data-book] opens it; data-studio locks the select to that one studio ----------
  const drawer = $("[data-book-modal]");
  const openDrawer = setupDialog(drawer, ".book-panel");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-book]");
    if (!b || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (!openDrawer) { say("Your browser can't open the booking drawer here."); return; }
    if (b.closest("[data-finder-modal]")) b.closest("dialog").close();
    const form = $("form[data-lead]", drawer);
    // On a studio page every Book button stays with that studio, the header's included
    const here = $("main form[data-locked]");
    resetForm(form, b.dataset.studio || (here ? here.dataset.locked : ""));
    openDrawer(b);
    $(".book-panel", drawer).scrollTop = 0;
    // Focus the heading (not a field): no keyboard pops up on phones and no ring flashes on a mouse open; Tab reaches the select next.
    $("#dr-title").focus();
  });

  // ---------- Studio finder: a ZIP or the browser's location sorts the studios nearest first, on a map.
  // Mockup stand-ins until the Google Maps key arrives (D-056): Leaflet with OpenStreetMap tiles, greyed in CSS, loaded only when a map is shown.
  const STUDIOS = JSON.parse(($("[data-studios]") || { textContent: "[]" }).textContent);
  const miles = (a, b) => {
    const r = (d) => (d * Math.PI) / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(h));
  };
  const nearest = (you) => STUDIOS.map((s) => ({ ...s, mi: you ? Math.max(1, Math.round(miles(you, s))) : null })).sort((a, b) => (a.mi ?? 0) - (b.mi ?? 0));
  let leaflet = null;
  const loadMap = () => leaflet || (leaflet = new Promise((ok, no) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; js.onload = () => ok(window.L); js.onerror = no;
    document.head.append(css, js);
  }));
  const drawMap = async (el, rows, you) => {
    const L = await loadMap();
    if (el._map) el._map.remove();
    const map = (el._map = L.map(el, { scrollWheelZoom: false, attributionControl: true }));
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(map);
    const pin = (cls, html) => L.divIcon({ className: "", html: `<span class="${cls}">${html}</span>`, iconSize: [0, 0] });
    const pts = rows.map((s) => {
      const text = s.mi == null ? s.name : `${s.name} · ${s.mi} mi`;
      L.marker([s.lat, s.lng], { icon: pin("mpin", `<i></i><b>${text}</b>`), title: s.name }).addTo(map).on("click", () => { window.location.href = APP ? s.href : ROUTES[s.href] || "#"; });
      return [s.lat, s.lng];
    });
    if (you) { L.marker([you.lat, you.lng], { icon: pin("mpin is-you", "<b>You</b>"), interactive: false }).addTo(map); pts.push([you.lat, you.lng]); }
    map.fitBounds(pts, { paddingTopLeft: [48, 48], paddingBottomRight: [150, 48], maxZoom: 13 });
    return map;
  };
  const zipPlace = async (zip) => {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) throw new Error("zip");
    const p = (await r.json()).places[0];
    return { lat: Number(p.latitude), lng: Number(p.longitude) };
  };
  const myPlace = () => new Promise((ok, no) => {
    if (!navigator.geolocation) { no(new Error("geo")); return; }
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), no, { timeout: 10000 });
  });
  const FIND_MSG = { zip: "Please enter a 5-digit ZIP code.", nozip: "We couldn't find that ZIP code. Please check it and try again.", geo: "We couldn't get your location. Please enter your ZIP code instead." };

  const finderDlg = $("[data-finder-modal]");
  const openFinder = setupDialog(finderDlg, ".fmodal-card");
  const showFinder = (rows, you, label, from) => {
    if (!openFinder) return;
    $("[data-fm-title]", finderDlg).textContent = `${rows.length} studios near ${label}`;
    const list = $("[data-flist]", finderDlg);
    list.replaceChildren(...rows.map((s, i) => {
      const li = document.createElement("li");
      li.className = "frow";
      li.innerHTML = `<div class="frow-top"><h3></h3>${i === 0 ? '<span class="frow-tag">Nearest to you</span>' : ""}<span class="frow-mi"></span></div><p class="frow-addr"></p><div class="frow-ctas"><a class="btn btn-primary btn-sm" href="/book" data-book data-studio="${s.key}"><span>Book your free <span class="tok">1-1</span> session</span></a><a class="link-mono" href="${s.href}">Studio details</a></div>`;
      $("h3", li).textContent = s.name;
      $(".frow-mi", li).textContent = `${s.mi} mi`;
      $(".frow-addr", li).textContent = `${s.street}, ${s.city}`;
      return li;
    }));
    openFinder(from);
    $("[data-fm-title]", finderDlg).focus();
    drawMap($("[data-map]", finderDlg), rows, you).then((m) => setTimeout(() => m.invalidateSize(), 60)).catch(() => { $("[data-map]", finderDlg).hidden = true; });
  };
  $$("[data-finder]").forEach((f) => {
    const input = f.elements.namedItem("zip"), err = $("[data-finder-error]", f);
    const fail = (k) => { err.textContent = FIND_MSG[k]; err.hidden = false; };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const zip = input.value.trim();
      if (!/^\d{5}$/.test(zip)) { fail("zip"); input.focus(); return; }
      try { const you = await zipPlace(zip); showFinder(nearest(you), you, zip, input); } catch { fail("nozip"); }
    });
    $("[data-finder-geo]", f).addEventListener("click", async (e) => {
      err.hidden = true;
      try { const you = await myPlace(); showFinder(nearest(you), you, "you", e.currentTarget); } catch { fail("geo"); }
    });
  });

  // Locations page: the same finder sorts the studio list and redraws the map beside it. Studio pages: one pin.
  const locMap = $("[data-loc-map]");
  if (locMap) {
    const f = $("[data-loc-finder]"), list = $("[data-loc-list]"), err = $("[data-finder-error]", f);
    const fail = (k) => { err.textContent = FIND_MSG[k]; err.hidden = false; };
    const apply = (you) => {
      const rows = nearest(you);
      rows.forEach((s, i) => {
        const li = $(`[data-loc="${s.key}"]`, list);
        $(".lrow-n", li).textContent = String(i + 1).padStart(2, "0");
        $("[data-loc-mi]", li).textContent = `${s.mi} mi`;
        list.append(li);
      });
      drawMap(locMap, rows, you);
    };
    drawMap(locMap, STUDIOS.map((s) => ({ ...s, mi: null })), null).catch(() => { locMap.hidden = true; });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const zip = f.elements.namedItem("zip").value.trim();
      if (!/^\d{5}$/.test(zip)) { fail("zip"); return; }
      try { apply(await zipPlace(zip)); } catch { fail("nozip"); }
    });
    $("[data-finder-geo]", f).addEventListener("click", async () => {
      err.hidden = true;
      try { apply(await myPlace()); } catch { fail("geo"); }
    });
  }
  $$("[data-studio-map]").forEach((el) => {
    drawMap(el, STUDIOS.filter((s) => s.key === el.dataset.studioMap).map((s) => ({ ...s, mi: null })), null).catch(() => { el.hidden = true; });
  });

  // Reviews wall tabs
  $$("[data-tabs]").forEach((bar) => {
    const tabs = $$("[data-tab]", bar);
    tabs.forEach((t) => t.addEventListener("click", () => tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute("aria-selected", String(on));
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    })));
  });

  // ---------- Pricing pop-up: every [data-pricing] opens it; its own form, tagged interest=pricing ----------
  const pricing = $("[data-pricing-modal]");
  const openPricing = setupDialog(pricing, ".pmodal-card");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pricing]");
    if (!b || !openPricing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    resetForm($("form[data-lead]", pricing), "");
    openPricing(b);
    $(".pmodal-card", pricing).scrollTop = 0;
    $("#pr-title").focus();
  });

  // /book?studio=<key>: a Book link opened without the drawer keeps its studio
  const bookForm = $("form[data-form-id=bk]");
  const asked = new URLSearchParams(location.search).get("studio");
  if (bookForm && Array.from(bookForm.elements.namedItem("studio").options).some((o) => o.value && o.value === asked)) resetForm(bookForm, asked);

  // ---------- Text-us picker (mobile icon; sms: rows with a prefilled note) ----------
  const textDlg = $("[data-text-modal]");
  const openText = setupDialog(textDlg, ".tmodal-card");
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-text-open]");
    if (t && openText) { e.preventDefault(); openText(t); $(".tmodal-card", textDlg).focus(); }
    const row = e.target.closest("a[data-text]");
    if (row && textDlg && textDlg.open) setTimeout(() => textDlg.close(), 0);
  });

  // ---------- Reviews and team bios: clamp only when JS can open the modal; "Read more" / "Read bio" show only when the text overflows ----------
  const rDlg = $("[data-review-modal]");
  const openReview = setupDialog(rDlg, ".rmodal-card");
  if (openReview) {
    const texts = $$("[data-review-text], [data-bio-text]").filter((p) => !p.closest("[inert]"));
    const sync = (p) => {
      const btn = $("[data-review-open], [data-bio-open]", p.closest("[data-review], [data-bio]"));
      if (btn && p.clientHeight) btn.hidden = p.scrollHeight <= p.clientHeight + 1;
    };
    texts.forEach((p) => p.setAttribute("data-clamp", ""));
    if ("ResizeObserver" in window) { const ro = new ResizeObserver((es) => es.forEach((en) => sync(en.target))); texts.forEach((p) => ro.observe(p)); }
    else texts.forEach(sync);
    if (document.fonts) document.fonts.ready.then(() => texts.forEach(sync));
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-review-open]");
      if (!btn) return;
      const src = btn.closest("[data-review]");
      const d = src.dataset;
      const full = $("template[data-review-full]", src);
      const n = Number(d.rating) || 5;
      const st = $("[data-rm-stars]", rDlg);
      st.hidden = $("[data-rm-src]", rDlg).hidden = false;
      st.setAttribute("aria-label", `${n} out of 5 stars`);
      const off = document.createElement("span");
      off.className = "off";
      off.textContent = "★".repeat(5 - n);
      st.replaceChildren("★".repeat(n), off);
      $("[data-rm-src]", rDlg).href = d.href;
      const srcSr = $("[data-rm-src-sr]", rDlg);
      srcSr.textContent = srcSr.dataset.tpl.replace("{studio}", d.studio);
      const title = $("[data-rm-title]", rDlg);
      title.textContent = title.dataset.reviewTpl.replace("{name}", d.author);
      $("[data-rm-text]", rDlg).textContent = full ? full.content.textContent : $("[data-review-text]", src).textContent;
      $("[data-rm-author]", rDlg).textContent = d.author;
      $("[data-rm-studio]", rDlg).textContent = d.studio;
      openReview(btn);
      $(".rmodal-card", rDlg).scrollTop = 0;
      $(".rmodal-card", rDlg).focus();
    });
    // Team bios: the same window in bio mode (no stars, no Google link); name and title in the caption
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bio-open]");
      if (!btn) return;
      const src = btn.closest("[data-bio]");
      $("[data-rm-stars]", rDlg).hidden = $("[data-rm-src]", rDlg).hidden = true;
      const title = $("[data-rm-title]", rDlg);
      title.textContent = title.dataset.bioTpl.replace("{name}", src.dataset.name);
      $("[data-rm-text]", rDlg).textContent = $("[data-bio-text]", src).textContent;
      $("[data-rm-author]", rDlg).textContent = src.dataset.name;
      $("[data-rm-studio]", rDlg).textContent = src.dataset.role;
      openReview(btn);
      $(".rmodal-card", rDlg).scrollTop = 0;
      $(".rmodal-card", rDlg).focus();
    });
  }

  // ---------- Video dialog: nothing loads from YouTube until a click; then a youtube-nocookie player in the dialog; closing it
  // (Esc, the ×, a click outside) removes the player, so only one ever plays ----------
  const vDlg = $("[data-video-modal]");
  const vFrame = vDlg && $("[data-vm-frame]", vDlg);
  const openVideo = setupDialog(vDlg, ".vm-card", () => vFrame.replaceChildren());
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-yt-play]");
    if (!b || !openVideo) return;
    e.preventDefault();
    const d = b.dataset;
    $("[data-vm-name]", vDlg).textContent = d.ytName;
    $("[data-vm-caption]", vDlg).textContent = d.ytCaption || "";
    $(".vm-card", vDlg).classList.toggle("is-portrait", d.ytShape === "portrait");
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(d.ytPlay)}?autoplay=1&rel=0&playsinline=1${d.ytStart ? `&start=${d.ytStart}` : ""}`;
    f.title = vDlg.dataset.titleTpl.replace("{name}", d.ytName);
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    vFrame.replaceChildren(f);
    openVideo(b);
  });

  // ---------- Studio cards: today's hours in Austin's time zone, shown once the script runs (no line before) ----------
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Chicago" }).format(new Date());
  $$("[data-today]").forEach((el) => {
    $("[data-today-text]", el).textContent = JSON.parse(el.dataset.today)[today] || el.dataset.closed;
    el.hidden = false;
  });

  // ---------- Links to pages built in later units: preview toast instead of a 404 ----------
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (APP || !a || e.defaultPrevented || a.hasAttribute("data-book") || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    const href = a.getAttribute("href");
    if (!href.startsWith("/")) return;
    const path = href.split(/[?#]/)[0];
    e.preventDefault();
    closeMenu();
    if (ROUTES[path]) { window.location.href = ROUTES[path]; return; }
    say(`Preview build: ${path} is built in a later unit.`);
  });

  // ---------- Footer year ----------
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  // ---------- Motion ----------
  // fire cb once when el passes enterAt × viewport height, or has been scrolled past (FASTER motion.tsx watch())
  const watch = (el, enterAt, cb) => {
    let done = false;
    const fire = () => { if (done) return; done = true; cb(); io.disconnect(); window.removeEventListener("scroll", check); };
    const check = () => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight * enterAt || r.bottom < 0) fire(); };
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) fire(); }, { rootMargin: `0px 0px -${Math.round((1 - enterAt) * 100)}% 0px` });
    io.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    check();
  };
  // Word reveal: wrap words (text nodes split on spaces; inline children kept whole)
  $$("[data-words]").forEach((h) => {
    const label = h.textContent.replace(/\s+/g, " ").trim();
    const parts = [];
    Array.from(h.childNodes).forEach((node) => {
      if (node.nodeType === 3) node.textContent.split(/(\s+)/).forEach((w) => parts.push(w.trim() ? w : (w ? " " : "")));
      else parts.push(node);
    });
    h.replaceChildren();
    let i = 0;
    parts.forEach((p) => {
      if (p === "" ) return;
      if (p === " ") { h.append(" "); return; }
      const s = document.createElement("span");
      s.className = "w";
      s.setAttribute("aria-hidden", "true");
      s.style.transitionDelay = `${i++ * 50}ms`;
      if (typeof p === "string") s.textContent = p; else s.append(p);
      h.append(s);
    });
    h.setAttribute("aria-label", label);
    if (h.hasAttribute("data-now")) requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add("is-in")));
    else watch(h, 0.85, () => h.classList.add("is-in"));
  });
  $$(".reveal, .stagger").forEach((el) => watch(el, 0.88, () => el.classList.add("is-in")));
  $$(".enter[data-now]").forEach((el) => requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in"))));

  // Scroll-scrubbed statement: characters light 0.5 → 1 as the paragraph rises, at every width (FASTER scrubs phones too).
  // FASTER dims to 0.28 (about 1.9:1 on white); 0.5 (#888, 3.54:1) keeps unlit large text above WCAG's 3:1.
  $$("[data-scrub]").forEach((p) => {
    const text = p.textContent;
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    p.replaceChildren(sr, ...text.split(" ").flatMap((w, i) => {
      const span = document.createElement("span");
      span.className = "nowrap";
      span.setAttribute("aria-hidden", "true");
      Array.from(w).forEach((ch) => { const c = document.createElement("span"); c.className = "scrub-c"; c.textContent = ch; span.append(c); });
      return i ? [" ", span] : [span];
    }));
    if (reduced) return;
    const chars = $$(".scrub-c", p);
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = p.getBoundingClientRect(), vh = window.innerHeight;
      const prog = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.5 + r.height * 0.6)));
      const lit = prog * chars.length;
      chars.forEach((c, i) => { c.style.opacity = i < lit ? "1" : "0.5"; });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
  });

  // Hero frame grows from the inset box to full bleed on scroll (FASTER ExpandOnScroll: 1312×480 r24 → 1440×820 r0; phones 300 → 340)
  $$("[data-grow]").forEach((el) => {
    if (reduced) return;
    let cur = 0, target = 0, raf = 0;
    const apply = () => {
      const mobile = window.innerWidth < 768;
      const parent = el.parentElement;
      const pr = parent.getBoundingClientRect();
      const bleed = pr.left + (parseFloat(getComputedStyle(parent).paddingLeft) || 0);
      const i0 = mobile ? 0 : 24, r0 = mobile ? 16 : 24, h0 = mobile ? 300 : 480, g = mobile ? 40 : 340;
      const k = 1 - Math.pow(1 - cur, 2);
      const m = i0 + (-bleed - i0) * k;
      el.style.marginLeft = `${m}px`;
      el.style.marginRight = `${m}px`;
      el.style.borderRadius = `${r0 * (1 - k)}px`;
      el.style.height = `${h0 + g * k}px`;
      const z0 = mobile ? 1.38 : 1.22;
      el.style.setProperty("--z", String(z0 - (z0 - 1) * k)); // the still eases back from a close crop to the full frame as it grows
    };
    const measure = () => {
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      target = Math.min(1, Math.max(0, (vh * 0.26 - r.top + (parseFloat(el.style.marginTop) || 0)) / (vh * 0.26 + 40)));
    };
    const tick = () => {
      cur += (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.002) cur = target;
      apply();
      raf = cur === target ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => { measure(); if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", () => { measure(); cur = target; apply(); });
    measure(); cur = target; apply();
  });

  // Last line on purpose: if anything above fails, the head script's 2.5 s fallback removes .js and shows every hidden element.
  window.IFA_READY = true;
})();
