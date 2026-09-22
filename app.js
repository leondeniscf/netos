/* Nicole · app principal. Sem dependências. */
(() => {
  "use strict";

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- armazenamento (localStorage para texto, IndexedDB para mídia) ----------
  const LS = {
    get(k, def) { try { const v = localStorage.getItem("nicole:" + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem("nicole:" + k, JSON.stringify(v)); } catch { toast("Não consegui salvar (armazenamento cheio?)"); } },
  };

  const DB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((res, rej) => {
        const r = indexedDB.open("nicole", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("cards", { keyPath: "id" });
        r.onsuccess = () => { this._db = r.result; res(this._db); };
        r.onerror = () => rej(r.error);
      });
    },
    async tx(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction("cards", mode);
        const st = t.objectStore("cards");
        const out = fn(st);
        t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
        t.onerror = () => rej(t.error);
      });
    },
    all() { return this.tx("readonly", (st) => st.getAll()); },
    put(card) { return this.tx("readwrite", (st) => st.put(card)); },
    del(id) { return this.tx("readwrite", (st) => st.delete(id)); },
    clear() { return this.tx("readwrite", (st) => st.clear()); },
  };

  // ---------- navegação ----------
  const views = $$(".view");
  let current = "home";
  function go(name) {
    if (current === "album") Album.leave();
    views.forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    current = name;
    window.scrollTo(0, 0);
    if (name === "home") Home.render();
    if (name === "kids") { KidsView.reset(); KidsView.render(); }
    if (name === "guide") Guide.render();
    if (name === "album") Album.enter();
    if (name === "setup") Setup.render();
    if (name === "end") End.render();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) go(b.dataset.go);
  });


  // ---------- crianças ----------
  const PRON = {
    f: { ela: "ela", Ela: "Ela", dela: "dela", nela: "nela", sozinha: "sozinha", preocupada: "preocupada", de: "da" },
    m: { ela: "ele", Ela: "Ele", dela: "dele", nela: "nele", sozinha: "sozinho", preocupada: "preocupado", de: "do" },
  };
  const Kids = {
    all() { return LS.get("children", []); },
    save(list) { LS.set("children", list); },
    current() {
      const list = this.all();
      const id = LS.get("currentChild", null);
      return list.find((k) => k.id === id) || list[0] || null;
    },
    select(id) { LS.set("currentChild", id); },
    months(k) {
      if (!k?.birth) return 0;
      const b = new Date(k.birth + "T00:00:00"), n = new Date();
      let m = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
      if (n.getDate() < b.getDate()) m--;
      return Math.max(0, m);
    },
    ageLabel(k) {
      const m = this.months(k);
      if (m < 24) return m === 1 ? "1 mês" : `${m} meses`;
      const y = Math.floor(m / 12), r = m % 12;
      return `${y} ano${y > 1 ? "s" : ""}` + (r ? ` e ${r} ${r === 1 ? "mês" : "meses"}` : "");
    },
    band(k) { return this.months(k) < AGE_BANDS.bebe.max + 1 ? "bebe" : "dois"; },
    // Importa perfis passados no link (#kids=<base64 JSON>) uma única vez. Nada de nomes no código publicado.
    seed() {
      const m = location.hash.match(/^#kids=(.+)$/);
      if (!m) return;
      try {
        const list = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        if (!Array.isArray(list)) throw new Error();
        const existing = this.all();
        for (const k of list) {
          if (!k.name || !k.birth) continue;
          const id = String(k.name).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "") || uid();
          if (!existing.some((x) => x.id === id)) existing.push({ id, name: k.name, birth: k.birth, gender: k.gender === "m" ? "m" : "f" });
        }
        this.save(existing);
        if (!LS.get("currentChild", null) && existing[0]) this.select(existing[0].id);
        toast(`${list.length} crianças cadastradas`);
      } catch { toast("Link de cadastro inválido"); }
      history.replaceState(null, "", location.pathname + location.search);
    },
  };
  // substitui {ela}, {dela}, {nome}… conforme a criança atual
  function P(text, k = Kids.current()) {
    const map = PRON[k?.gender === "m" ? "m" : "f"];
    return String(text).replace(/\{(\w+)\}/g, (_, t) => t === "nome" ? (k?.name || "a criança") : (map[t] ?? _));
  }
  // chave de armazenamento por criança
  const kk = (key) => `${key}:${Kids.current()?.id || "none"}`;

  // ---------- início ----------
  const Home = {
    render() {
      const list = Kids.all(), k = Kids.current();
      $("#kids-row").innerHTML = list.map((c) => `
        <button class="kid ${c.id === k?.id ? "active" : ""}" data-kid="${c.id}">
          <span class="kn">${esc(c.name)}</span><span class="ka">${Kids.ageLabel(c)}</span></button>`).join("");
      if (!k) {
        $("#home-name").textContent = "Netos"; $("#home-age").textContent = "cadastre uma criança para começar";
        $("#home-note").textContent = ""; return;
      }
      const band = AGE_BANDS[Kids.band(k)];
      $("#home-name").textContent = k.name;
      $("#home-age").textContent = `${Kids.ageLabel(k)} · ${band.label.toLowerCase()}`;
      $("#home-note").innerHTML = esc(band.note) + (band.screens ? ` O álbum encerra sozinho depois de <strong>${Album.limitMin()}</strong> minutos.` : "");
      $("#home-album-card").classList.toggle("disabled", !band.screens);
      $("#home-album-desc").textContent = band.screens
        ? "Fotos da família com a voz de cada um. Para usar junto, poucos minutos."
        : `Bloqueado para ${k.name}: nenhuma tela antes dos 2 anos. Use o guia.`;
      $("#home-guide-desc").textContent = band.screens
        ? "Atividades de 10 minutos, marcos do desenvolvimento e diário. Só para você."
        : "Atividades de colo e chão, marcos de 2 e 4 meses e diário. Só para você.";
    },
  };
  $("#kids-row").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kid]"); if (!b) return;
    Kids.select(b.dataset.kid); Home.render();
  });
  $("#home-album-card").addEventListener("click", (e) => {
    const k = Kids.current();
    if (k && !AGE_BANDS[Kids.band(k)].screens) {
      e.stopPropagation(); e.preventDefault();
      toast(`${k.name} tem ${Kids.ageLabel(k)}. Sem tela nessa idade.`);
    }
  }, true);

  // ---------- gerenciar crianças ----------
  const KidsView = {
    render() {
      const list = Kids.all();
      $("#kids-list").innerHTML = list.map((c) => `
        <div class="kid-item"><span><span class="kn">${esc(c.name)}</span><br><span class="ka">${Kids.ageLabel(c)} · nasc. ${c.birth.split("-").reverse().join("/")} · ${c.gender === "m" ? "ele" : "ela"}</span></span>
        <span class="acts"><button data-edit="${c.id}">Editar</button><button data-remove="${c.id}">Remover</button></span></div>`).join("")
        || `<p class="hint">Nenhuma criança cadastrada.</p>`;
    },
    reset() {
      $("#kid-id").value = ""; $("#kid-name").value = ""; $("#kid-birth").value = ""; $("#kid-gender").value = "f";
      $("#kid-form-title").textContent = "Nova criança"; $("#kid-cancel").hidden = true;
    },
  };
  $("#kid-save").addEventListener("click", () => {
    const name = $("#kid-name").value.trim(), birth = $("#kid-birth").value, gender = $("#kid-gender").value;
    if (!name || !birth) return toast("Preencha nome e nascimento");
    const list = Kids.all(); const id = $("#kid-id").value;
    if (id) { const k = list.find((x) => x.id === id); Object.assign(k, { name, birth, gender }); }
    else { const nid = uid(); list.push({ id: nid, name, birth, gender }); if (list.length === 1) Kids.select(nid); }
    Kids.save(list); KidsView.reset(); KidsView.render(); toast("Salvo");
  });
  $("#kid-cancel").addEventListener("click", () => KidsView.reset());
  $("#kids-list").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"), rm = e.target.closest("[data-remove]");
    if (ed) {
      const k = Kids.all().find((x) => x.id === ed.dataset.edit);
      $("#kid-id").value = k.id; $("#kid-name").value = k.name; $("#kid-birth").value = k.birth; $("#kid-gender").value = k.gender;
      $("#kid-form-title").textContent = "Editar " + k.name; $("#kid-cancel").hidden = false;
      window.scrollTo(0, 0);
    }
    if (rm) {
      const k = Kids.all().find((x) => x.id === rm.dataset.remove);
      if (!confirm(`Remover ${k.name}? Marcos e diário dessa criança serão apagados.`)) return;
      Kids.save(Kids.all().filter((x) => x.id !== k.id));
      ["milestones", "diary", "done", "today"].forEach((key) => localStorage.removeItem(`nicole:${key}:${k.id}`));
      if (LS.get("currentChild") === k.id) LS.set("currentChild", Kids.all()[0]?.id || null);
      KidsView.render();
    }
  });

  // ---------- Guia do adulto ----------
  const Guide = {
    domain: "all",
    todayId: null,
    acts() { const b = Kids.band(Kids.current()); return ACTIVITIES.filter((a) => a.band === b); },
    render() {
      const k = Kids.current();
      $("#guide-title").textContent = k ? `Guia · ${k.name}` : "Guia do adulto";
      $("#tips-list").innerHTML = TIPS[Kids.band(k)].map((t) => `<li>${P(t)}</li>`).join("");
      $("#ms-hint").textContent = Kids.band(k) === "bebe"
        ? "Marcos típicos de 2 e 4 meses (CDC 2022). Marque o que você já viu. Se vários faltarem aos 4 meses, converse com o pediatra. Cada bebê tem seu ritmo."
        : "Marcos típicos entre 24 e 30 meses (CDC 2022 e SBP). Marque o que você já viu. Se vários faltarem aos 30 meses, converse com o pediatra. Cada criança tem seu ritmo.";
      this.renderToday();
      this.renderChips();
      this.renderActivities();
      this.renderMilestones();
      this.renderDiary();
    },
    pickToday(force) {
      const key = new Date().toISOString().slice(0, 10);
      const saved = LS.get(kk("today"), {});
      const acts = this.acts();
      if (!force && saved.date === key && acts.some((a) => a.id === saved.id)) return saved.id;
      const done = LS.get(kk("done"), {});
      const pool = acts.filter((a) => a.id !== saved.id);
      // prioriza domínios menos praticados
      const counts = {};
      Object.keys(DOMAINS).forEach((d) => (counts[d] = 0));
      Object.keys(done).forEach((id) => { const a = acts.find((x) => x.id === id); if (a) counts[a.domain] += done[id].length; });
      const min = Math.min(...Object.values(counts));
      const under = pool.filter((a) => counts[a.domain] === min);
      const pick = (under.length ? under : pool)[Math.floor(Math.random() * (under.length ? under : pool).length)];
      LS.set(kk("today"), { date: key, id: pick.id });
      return pick.id;
    },
    renderToday(force) {
      this.todayId = this.pickToday(force);
      const a = ACTIVITIES.find((x) => x.id === this.todayId);
      const d = DOMAINS[a.domain];
      $("#today-title").textContent = P(a.title);
      $("#today-domain").textContent = d.emoji + " " + d.label;
      $("#today-domain").style.color = d.color;
      $("#today-summary").textContent = P(a.summary);
    },
    renderChips() {
      const el = $("#domain-chips");
      const chips = [["all", "Todas", ""]].concat(Object.entries(DOMAINS).map(([k, v]) => [k, v.label, v.emoji]));
      el.innerHTML = chips.map(([k, l, e]) => `<button class="chip ${k === this.domain ? "active" : ""}" data-domain="${k}">${e} ${l}</button>`).join("");
    },
    renderActivities() {
      const done = LS.get(kk("done"), {});
      const list = this.acts().filter((a) => this.domain === "all" || a.domain === this.domain);
      $("#activity-list").innerHTML = list.map((a) => {
        const d = DOMAINS[a.domain];
        const n = (done[a.id] || []).length;
        return `<button class="act-item" data-act="${a.id}">
          <span class="dot" style="background:${d.color}22">${d.emoji}</span>
          <span><span class="t">${esc(P(a.title))}</span><br><span class="d">${esc(P(a.summary))}</span></span>
          ${n ? `<span class="done">${n}×</span>` : ""}
        </button>`;
      }).join("");
    },
    renderMilestones() {
      const checked = LS.get(kk("milestones"), {});
      const band = Kids.band(Kids.current());
      $("#milestone-groups").innerHTML = MILESTONES.filter((g) => g.band === band).map((g) => `
        <div class="ms-group"><h3>${esc(g.group)}</h3>
        ${g.items.map((m) => `<label class="ms-item ${checked[m.id] ? "checked" : ""}">
          <input type="checkbox" data-ms="${m.id}" ${checked[m.id] ? "checked" : ""}>
          <span class="txt">${esc(P(m.text))}</span><span class="age">${m.age} m</span></label>`).join("")}
        </div>`).join("");
    },
    renderDiary() {
      const items = LS.get(kk("diary"), []);
      $("#diary-list").innerHTML = items.length ? items.map((it) => `
        <div class="diary-item">
          <span class="tag">${esc(it.type)}</span>
          <span><span>${esc(it.text)}</span><br><span class="when">${fmtDate(it.ts)}</span></span>
          <button class="del" data-del="${it.id}" aria-label="Apagar">×</button>
        </div>`).join("") : `<p class="hint">Nenhum registro ainda. Anote palavras novas e momentos. Em um ano isso vale ouro.</p>`;
    },
    openActivity(id) {
      const a = ACTIVITIES.find((x) => x.id === id);
      const d = DOMAINS[a.domain];
      $("#act-title").textContent = P(a.title);
      $("#act-domain").textContent = d.emoji + " " + d.label;
      $("#act-domain").style.color = d.color;
      $("#act-summary").textContent = P(a.summary);
      $("#act-materials").innerHTML = a.materials.map((m) => `<li>${esc(P(m))}</li>`).join("");
      $("#act-steps").innerHTML = a.steps.map((m) => `<li>${esc(P(m))}</li>`).join("");
      $("#act-observe").innerHTML = a.observe.map((m) => `<li>${esc(P(m))}</li>`).join("");
      $("#act-words").textContent = a.words;
      $("#act-done").dataset.act = id;
      go("activity");
    },
  };

  $("#today-open").addEventListener("click", () => Guide.openActivity(Guide.todayId));
  $("#today-shuffle").addEventListener("click", () => Guide.renderToday(true));
  $("#guide-tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + t.dataset.tab));
  });
  $("#domain-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-domain]"); if (!c) return;
    Guide.domain = c.dataset.domain; Guide.renderChips(); Guide.renderActivities();
  });
  $("#activity-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (b) Guide.openActivity(b.dataset.act);
  });
  $("#act-done").addEventListener("click", (e) => {
    const done = LS.get(kk("done"), {});
    const id = e.currentTarget.dataset.act;
    (done[id] = done[id] || []).push(Date.now());
    LS.set(kk("done"), done);
    toast("Registrado. Repetir é ótimo.");
    go("guide");
  });
  $("#milestone-groups").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-ms]"); if (!cb) return;
    const checked = LS.get(kk("milestones"), {});
    if (cb.checked) checked[cb.dataset.ms] = Date.now(); else delete checked[cb.dataset.ms];
    LS.set(kk("milestones"), checked);
    cb.closest(".ms-item").classList.toggle("checked", cb.checked);
  });
  let diaryType = "palavra";
  $("#diary-types").addEventListener("click", (e) => {
    const c = e.target.closest("[data-type]"); if (!c) return;
    diaryType = c.dataset.type;
    $$("#diary-types .chip").forEach((x) => x.classList.toggle("active", x === c));
  });
  $("#diary-save").addEventListener("click", () => {
    const text = $("#diary-text").value.trim();
    if (!text) return toast("Escreva algo primeiro");
    const items = LS.get(kk("diary"), []);
    items.unshift({ id: uid(), type: diaryType, text, ts: Date.now() });
    LS.set(kk("diary"), items);
    $("#diary-text").value = "";
    Guide.renderDiary();
    toast("Salvo no diário");
  });
  $("#diary-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    if (!confirm("Apagar este registro?")) return;
    LS.set(kk("diary"), LS.get(kk("diary"), []).filter((it) => it.id !== b.dataset.del));
    Guide.renderDiary();
  });
  $("#diary-export").addEventListener("click", () => {
    const k = Kids.current();
    const items = LS.get(kk("diary"), []);
    const txt = `Diário · ${k?.name || ""}\n\n` + (items.slice().reverse().map((it) => `${fmtDate(it.ts)} · ${it.type}: ${it.text}`).join("\n") || "Diário vazio.");
    downloadText(`diario-${(k?.name || "crianca").toLowerCase()}.txt`, txt, "text/plain");
  });

  function downloadText(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- Álbum falante ----------
  const Album = {
    cards: [],
    urls: new Map(),
    audio: null,
    startedAt: 0,
    tick: null,
    holdTimer: null,
    holdStart: 0,
    limitMin() { return LS.get("limit", 8); },
    async load() {
      this.cards = (await DB.all()).sort((a, b) => a.created - b.created);
      this.urls.forEach((u) => URL.revokeObjectURL(u));
      this.urls.clear();
      this.cards.forEach((c) => this.urls.set(c.id, URL.createObjectURL(c.photo)));
    },
    async enter() {
      const k = Kids.current();
      if (k && !AGE_BANDS[Kids.band(k)].screens) { toast("Sem tela para bebês"); return go("home"); }
      await this.load();
      this.renderGrid();
      this.startedAt = Date.now();
      this.tick = setInterval(() => this.updateTimer(), 1000);
      this.updateTimer();
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    },
    leave() {
      clearInterval(this.tick); this.tick = null;
      this.stopAudio();
      Puzzle.close();
      Colors.close();
      Numbers.close();
      Shapes.close();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    },
    renderGrid() {
      const g = $("#album-grid");
      $("#album-empty").classList.toggle("show", false);
      g.innerHTML = (this.cards.length ? "" : `<button class="album-card montar" id="album-add" aria-label="Adicionar fotos"><span class="ic">📷</span><span class="name">Adicionar fotos</span></button>`) + this.cards.map((c) => `
        <button class="album-card" data-card="${c.id}" aria-label="${esc(c.name)}">
          <img src="${this.urls.get(c.id)}" alt="">
          <span class="name">${esc(c.name)}</span>
        </button>`).join("") + (this.cards.length ? `
        <button class="album-card montar" id="album-montar" aria-label="Montar quebra-cabeça">
          <span class="ic">🧩</span><span class="name">Montar</span>
        </button>` : "") + `
        <button class="album-card cores" id="album-cores" aria-label="Jogo de cores">
          <span class="ic">🎨</span><span class="name">Cores</span>
        </button>
        <button class="album-card contar" id="album-contar" aria-label="Jogo de contar">
          <span class="ic">🔢</span><span class="name">Contar</span>
        </button>
        <button class="album-card formas" id="album-formas" aria-label="Jogo de formas">
          <span class="ic">🔷</span><span class="name">Formas</span>
        </button>`;
    },
    updateTimer() {
      const elapsed = Date.now() - this.startedAt;
      const total = this.limitMin() * 60000;
      const left = Math.max(0, total - elapsed);
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $("#album-timer").textContent = $("#puzzle-timer").textContent = $("#colors-timer").textContent = $("#numbers-timer").textContent = $("#shapes-timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (left <= 0) go("end");
    },
    stopAudio() {
      if (this.audio) { this.audio.pause(); this.audio.src = ""; this.audio = null; }
      $$(".album-card.playing").forEach((c) => c.classList.remove("playing"));
    },
    lastId: null,
    play(id) {
      const c = this.cards.find((x) => x.id === id); if (!c) return;
      this.lastId = id;
      this.stopAudio();
      const el = $(`[data-card="${id}"]`);
      el.classList.add("playing");
      if (c.audio) {
        const a = new Audio(URL.createObjectURL(c.audio));
        this.audio = a;
        a.onended = () => { el.classList.remove("playing"); URL.revokeObjectURL(a.src); };
        a.play().catch(() => el.classList.remove("playing"));
      } else if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(c.name);
        u.lang = "pt-BR"; u.rate = 0.85;
        u.onend = () => el.classList.remove("playing");
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } else {
        setTimeout(() => el.classList.remove("playing"), 1200);
      }
    },
  };


  // ---------- Quebra-cabeça (dentro da sessão do álbum) ----------
  const Puzzle = {
    card: null, pieces: [], img: null, board: null, drag: null, open: false,
    count() { return Math.min(4, Math.max(2, LS.get("pieces", 2))); },
    layout(n) { return n === 4 ? { cols: 2, rows: 2 } : { cols: n, rows: 1 }; },
    async start(cardId) {
      const pool = Album.cards; if (!pool.length) return;
      const c = pool.find((x) => x.id === cardId) || pool[Math.floor(Math.random() * pool.length)];
      this.card = c; this.open = true;
      Album.stopAudio();
      $("#puzzle").hidden = false; $("#puzzle-done").hidden = true;
      $("#puzzle-name").textContent = c.name;
      $("#puzzle-board").classList.remove("done");
      $$(".puzzle-piece, .puzzle-slot", $("#puzzle-stage")).forEach((el) => el.remove());
      await new Promise((res) => { const im = new Image(); im.onload = () => { this.img = im; res(); }; im.onerror = res; im.src = Album.urls.get(c.id); });
      requestAnimationFrame(() => this.build());
    },
    close() { this.open = false; $("#puzzle").hidden = true; this.drag = null; },
    build() {
      const stage = $("#puzzle-stage"), st = stage.getBoundingClientRect();
      $$(".puzzle-piece, .puzzle-slot", stage).forEach((el) => el.remove());
      const n = this.count(), { cols, rows } = this.layout(n);
      const landscape = st.width > st.height * 1.1;
      // tabuleiro: quadrado que cabe na metade do palco, deixando espaço para as peças soltas
      const side = Math.floor(landscape ? Math.min(st.height - 24, st.width * 0.5 - 24) : Math.min(st.width - 24, st.height * 0.5 - 16));
      const bx = landscape ? 12 : Math.floor((st.width - side) / 2), by = 8;
      const board = $("#puzzle-board");
      Object.assign(board.style, { left: bx + "px", top: by + "px", width: side + "px", height: side + "px" });
      // imagem "cover" no tabuleiro
      const iw = this.img?.naturalWidth || side, ih = this.img?.naturalHeight || side;
      const sc = Math.max(side / iw, side / ih), dw = Math.round(iw * sc), dh = Math.round(ih * sc);
      const ox = Math.round((side - dw) / 2), oy = Math.round((side - dh) / 2);
      const url = Album.urls.get(this.card.id);
      board.style.setProperty("--img", `url("${url}")`);
      board.style.setProperty("--size", `${dw}px ${dh}px`);
      board.style.setProperty("--pos", `${ox}px ${oy}px`);
      this.bg = { dw, dh, ox, oy };
      this.board = { x: bx, y: by, side, pw: side / cols, ph: side / rows };
      // zona de peças soltas
      const zone = landscape
        ? { x: bx + side + 16, y: 8, w: st.width - side - 40, h: st.height - 16 }
        : { x: 12, y: by + side + 16, w: st.width - 24, h: st.height - side - by - 24 };
      this.pieces = [];
      const order = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
      // peças soltas em grade: 2x2 para 4 peças; fila (retrato) ou coluna (paisagem) para 2 e 3
      const lay = n === 4 ? { c: 2, r: 2 } : landscape ? { c: 1, r: n } : { c: n, r: 1 };
      const gap = 10;
      const pw = this.board.pw, ph = this.board.ph;
      const scale = Math.max(0.35, Math.min(1, (zone.w - gap * (lay.c + 1)) / lay.c / pw, (zone.h - gap * (lay.r + 1)) / lay.r / ph));
      const cellW = zone.w / lay.c, cellH = zone.h / lay.r;
      order.forEach((i, k) => {
        const col = i % cols, row = Math.floor(i / cols);
        const slot = document.createElement("div");
        slot.className = "puzzle-slot";
        Object.assign(slot.style, { left: bx + col * pw + "px", top: by + row * ph + "px", width: pw + "px", height: ph + "px" });
        stage.appendChild(slot);
        const el = document.createElement("div");
        el.className = "puzzle-piece"; el.dataset.i = i;
        const w = pw * scale, h = ph * scale;
        Object.assign(el.style, {
          width: w + "px", height: h + "px",
          backgroundImage: `url("${url}")`,
          backgroundSize: `${dw * scale}px ${dh * scale}px`,
          backgroundPosition: `${(ox - col * pw) * scale}px ${(oy - row * ph) * scale}px`,
        });
        const jitter = () => (Math.random() - 0.5) * 10;
        const cx = k % lay.c, cy = Math.floor(k / lay.c);
        const x = zone.x + cx * cellW + (cellW - w) / 2 + jitter();
        const y = zone.y + cy * cellH + (cellH - h) / 2 + jitter();
        el.style.left = Math.max(0, Math.min(st.width - w, x)) + "px";
        el.style.top = Math.max(0, Math.min(st.height - h, y)) + "px";
        stage.appendChild(el);
        this.pieces.push({ i, col, row, el, scale, locked: false, tx: bx + col * pw, ty: by + row * ph });
      });
    },
    onDown(e) {
      const el = e.target.closest(".puzzle-piece"); if (!el || !this.open) return;
      const p = this.pieces.find((x) => x.el === el); if (!p || p.locked) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.drag = { p, dx: e.clientX - r.left, dy: e.clientY - r.top };
      el.classList.add("drag");
      try { el.setPointerCapture(e.pointerId); } catch {}
    },
    onMove(e) {
      if (!this.drag) return;
      const st = $("#puzzle-stage").getBoundingClientRect();
      const { p, dx, dy } = this.drag;
      p.el.style.left = e.clientX - st.left - dx + "px";
      p.el.style.top = e.clientY - st.top - dy + "px";
    },
    onUp() {
      if (!this.drag) return;
      const { p } = this.drag; this.drag = null;
      p.el.classList.remove("drag");
      const cx = parseFloat(p.el.style.left) + p.el.offsetWidth / 2, cy = parseFloat(p.el.style.top) + p.el.offsetHeight / 2;
      const tx = p.tx + this.board.pw / 2, ty = p.ty + this.board.ph / 2;
      const tol = Math.min(this.board.pw, this.board.ph) * 0.45; // encaixe generoso
      if (Math.hypot(cx - tx, cy - ty) < tol) {
        p.locked = true;
        p.el.classList.add("locked");
        const { dw, dh, ox, oy } = this.bg;
        Object.assign(p.el.style, {
          left: p.tx + "px", top: p.ty + "px", width: this.board.pw + "px", height: this.board.ph + "px",
          backgroundSize: `${dw}px ${dh}px`,
          backgroundPosition: `${ox - p.col * this.board.pw}px ${oy - p.row * this.board.ph}px`,
        });
        if (this.pieces.every((x) => x.locked)) this.finish();
      }
    },
    finish() {
      $("#puzzle-board").classList.add("done");
      // a única recompensa: a voz da pessoa da foto
      const c = this.card;
      if (c.audio) { const a = new Audio(URL.createObjectURL(c.audio)); a.onended = () => URL.revokeObjectURL(a.src); a.play().catch(() => {}); }
      else if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(c.name); u.lang = "pt-BR"; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); }
      setTimeout(() => { if (this.open) $("#puzzle-done").hidden = false; }, 1800);
    },
  };
  const pstage = $("#puzzle-stage");
  pstage.addEventListener("pointerdown", (e) => Puzzle.onDown(e));
  pstage.addEventListener("pointermove", (e) => Puzzle.onMove(e));
  ["pointerup", "pointercancel"].forEach((ev) => pstage.addEventListener(ev, () => Puzzle.onUp()));
  $("#puzzle-back").addEventListener("click", () => Puzzle.close());
  $("#puzzle-again").addEventListener("click", () => {
    const others = Album.cards.filter((c) => c.id !== Puzzle.card?.id);
    Puzzle.start(others.length ? others[Math.floor(Math.random() * others.length)].id : Puzzle.card.id);
  });
  window.addEventListener("resize", () => { if (Puzzle.open && !Puzzle.pieces.some((p) => p.locked)) Puzzle.build(); });


  // ---------- Jogo de cores (dentro da sessão do álbum) ----------
  const COLORS = [
    { id: "vermelho", name: "vermelho", hex: "#e0322b" },
    { id: "azul", name: "azul", hex: "#2f6fd6" },
    { id: "amarelo", name: "amarelo", hex: "#f2c12e" },
    { id: "verde", name: "verde", hex: "#3aa655" },
    { id: "laranja", name: "laranja", hex: "#f07f1d" },
    { id: "roxo", name: "roxo", hex: "#8b4fc2" },
  ];
  const Colors = {
    open: false, target: null, last: null, busy: false, wrong: 0, rounds: 0,
    options() { return LS.get("colors", {}).options === 3 ? 3 : 2; },
    set() { return COLORS.slice(0, LS.get("colors", {}).set === 6 ? 6 : 3); },
    start() {
      this.open = true; this.rounds = 0;
      Album.stopAudio();
      $("#colors").hidden = false;
      this.round();
    },
    close() { this.open = false; $("#colors").hidden = true; speechSynthesis?.cancel?.(); },
    say(text) {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR"; u.rate = 0.8;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    },
    round() {
      const set = this.set(), n = Math.min(this.options(), set.length);
      const pool = set.filter((c) => c.id !== this.last?.id);
      this.target = pool[Math.floor(Math.random() * pool.length)];
      this.last = this.target;
      const others = set.filter((c) => c.id !== this.target.id).sort(() => Math.random() - 0.5).slice(0, n - 1);
      const shown = [this.target, ...others].sort(() => Math.random() - 0.5);
      $("#colors-prompt").textContent = `Cadê o ${this.target.name}?`;
      $("#colors-stage").innerHTML = shown.map((c) => `<button class="color-blob" data-color="${c.id}" style="background:${c.hex}" aria-label="${c.name}"></button>`).join("");
      this.busy = false; this.wrong = 0;
      this.say(`Cadê o ${this.target.name}?`);
    },
    tap(id) {
      if (this.busy || !this.open) return;
      const c = COLORS.find((x) => x.id === id);
      if (id !== this.target.id) {
        // erro: sem "não", só a cor certa pulsa e a pergunta repete
        this.wrong++;
        const t = $(`[data-color="${this.target.id}"]`);
        t.classList.remove("hint"); void t.offsetWidth; t.classList.add("hint");
        if (this.wrong === 1) this.say(`${c.name}. Cadê o ${this.target.name}?`);
        return;
      }
      this.busy = true; this.rounds++;
      const flash = $("#colors-flash");
      flash.style.background = c.hex;
      $("#colors-flash-name").textContent = c.name;
      flash.classList.add("show");
      this.say(c.name);
      setTimeout(() => {
        flash.classList.remove("show");
        if (!this.open) return;
        if (this.rounds >= 8) { this.close(); toast("Chega de cores por agora. Vamos achar cores de verdade pela casa?"); return; }
        setTimeout(() => this.open && this.round(), 300);
      }, 1700);
    },
  };
  $("#colors-stage").addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-color]"); if (b) { e.preventDefault(); Colors.tap(b.dataset.color); }
  });
  $("#colors-back").addEventListener("click", () => Colors.close());


  // ---------- Jogo de contar (dentro da sessão do álbum) ----------
  const NUM_WORDS = ["", "um", "dois", "três", "quatro", "cinco"];
  const TOKEN_COLORS = ["#e0322b", "#2f6fd6", "#f2c12e", "#3aa655", "#f07f1d"];
  const Numbers = {
    open: false, n: 0, count: 0, rounds: 0, last: 0, card: null, busy: false,
    max() { return LS.get("numbersMax", 3) === 5 ? 5 : 3; },
    start() {
      this.open = true; this.rounds = 0; this.last = 0;
      this.card = Album.cards.find((c) => c.id === Album.lastId) || null;
      Album.stopAudio();
      $("#numbers").hidden = false;
      this.round();
    },
    close() { this.open = false; $("#numbers").hidden = true; speechSynthesis?.cancel?.(); },
    say(text) {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR"; u.rate = 0.8;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    },
    round() {
      const max = this.max();
      // sobe devagar: nas primeiras rodadas só 1 e 2; evita repetir o mesmo número
      const ceil = this.rounds < 2 ? Math.min(2, max) : max;
      let n; do { n = 1 + Math.floor(Math.random() * ceil); } while (n === this.last && ceil > 1);
      this.n = n; this.last = n; this.count = 0; this.busy = false;
      const color = TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)];
      const bg = this.card ? `url("${Album.urls.get(this.card.id)}") center/cover no-repeat` : color;
      $("#numbers-prompt").textContent = "Vamos contar!";
      const stage = $("#numbers-stage"); stage.innerHTML = "";
      for (let i = 0; i < n; i++) {
        const t = document.createElement("button");
        t.className = "num-token"; t.dataset.i = i; t.setAttribute("aria-label", `objeto ${i + 1}`);
        t.style.background = bg;
        stage.appendChild(t);
      }
      this.say("Vamos contar!");
    },
    tap(el) {
      if (this.busy || !this.open || el.classList.contains("counted")) return;
      this.count++;
      el.classList.add("counted"); el.dataset.n = this.count;
      this.say(NUM_WORDS[this.count]);
      if (this.count < this.n) return;
      this.busy = true; this.rounds++;
      const flash = $("#numbers-flash");
      const label = this.card ? `${NUM_WORDS[this.n]} · ${this.card.name}` : NUM_WORDS[this.n];
      $("#numbers-flash-digit").textContent = this.n;
      $("#numbers-flash-word").textContent = label;
      setTimeout(() => {
        if (!this.open) return;
        flash.classList.add("show");
        this.say(NUM_WORDS[this.n] + (this.card ? " " + this.card.name : ""));
        if (this.card?.audio) setTimeout(() => { const a = new Audio(URL.createObjectURL(this.card.audio)); a.onended = () => URL.revokeObjectURL(a.src); a.play().catch(() => {}); }, 900);
        setTimeout(() => {
          flash.classList.remove("show");
          if (!this.open) return;
          if (this.rounds >= 8) { this.close(); toast("Chega de contar por agora. Vamos contar degraus de verdade?"); return; }
          setTimeout(() => this.open && this.round(), 300);
        }, 2000);
      }, 700);
    },
  };
  $("#numbers-stage").addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".num-token"); if (t) { e.preventDefault(); Numbers.tap(t); }
  });
  $("#numbers-back").addEventListener("click", () => Numbers.close());


  // ---------- Jogo de formas (caixa de encaixe, dentro da sessão do álbum) ----------
  const SHAPES = [
    { id: "circulo", name: "círculo" },
    { id: "quadrado", name: "quadrado" },
    { id: "triangulo", name: "triângulo" },
    { id: "estrela", name: "estrela" },
  ];
  const Shapes = {
    open: false, items: [], drag: null, rounds: 0, busy: false,
    count() { return Math.min(4, Math.max(2, LS.get("shapesCount", 2))); },
    start() { this.open = true; this.rounds = 0; Album.stopAudio(); $("#shapes").hidden = false; requestAnimationFrame(() => this.build()); },
    close() { this.open = false; $("#shapes").hidden = true; this.drag = null; speechSynthesis?.cancel?.(); },
    say(text) {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR"; u.rate = 0.8;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    },
    build() {
      const stage = $("#shapes-stage"); stage.innerHTML = "";
      const st = stage.getBoundingClientRect();
      const n = this.count(), shapes = SHAPES.slice(0, n);
      const landscape = st.width > st.height * 1.1;
      // tabuleiro com os buracos numa metade, peças soltas na outra
      const board = landscape
        ? { x: 12, y: 12, w: st.width / 2 - 18, h: st.height - 24 }
        : { x: 12, y: 8, w: st.width - 24, h: st.height / 2 - 14 };
      const zone = landscape
        ? { x: st.width / 2 + 6, y: 12, w: st.width / 2 - 18, h: st.height - 24 }
        : { x: 12, y: st.height / 2 + 6, w: st.width - 24, h: st.height / 2 - 14 };
      const b = document.createElement("div"); b.className = "shape-board";
      Object.assign(b.style, { left: board.x + "px", top: board.y + "px", width: board.w + "px", height: board.h + "px" });
      stage.appendChild(b);
      // tamanho da forma: cabe n em fila (retrato) ou coluna (paisagem)
      const along = landscape ? board.h : board.w, across = landscape ? board.w : board.h;
      const size = Math.floor(Math.min(along / n - 16, across - 28, 200));
      const colors = TOKEN_COLORS.slice().sort(() => Math.random() - 0.5);
      const holeOrder = shapes.slice().sort(() => Math.random() - 0.5);
      const pieceOrder = shapes.slice().sort(() => Math.random() - 0.5);
      const pos = (area, k, total) => landscape
        ? { x: area.x + (area.w - size) / 2, y: area.y + (k + 0.5) * (area.h / total) - size / 2 }
        : { x: area.x + (k + 0.5) * (area.w / total) - size / 2, y: area.y + (area.h - size) / 2 };
      this.items = shapes.map((sh) => ({ sh, locked: false }));
      holeOrder.forEach((sh, k) => {
        const p = pos(board, k, n);
        const h = document.createElement("div"); h.className = `shape shape-hole ${sh.id}`;
        Object.assign(h.style, { left: p.x + "px", top: p.y + "px", width: size + "px", height: size + "px" });
        stage.appendChild(h);
        const it = this.items.find((x) => x.sh === sh); it.hole = h; it.hx = p.x; it.hy = p.y;
      });
      pieceOrder.forEach((sh, k) => {
        const p = pos(zone, k, n);
        const el = document.createElement("div"); el.className = `shape shape-piece ${sh.id}`;
        el.dataset.shape = sh.id;
        Object.assign(el.style, { left: p.x + "px", top: p.y + "px", width: size + "px", height: size + "px", background: colors[k % colors.length] });
        stage.appendChild(el);
        const it = this.items.find((x) => x.sh === sh); it.el = el; it.ox = p.x; it.oy = p.y;
      });
      this.size = size; this.busy = false;
      $("#shapes-prompt").textContent = "Encaixa!";
    },
    onDown(e) {
      const el = e.target.closest(".shape-piece"); if (!el || !this.open || this.busy) return;
      const it = this.items.find((x) => x.el === el); if (!it || it.locked) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.drag = { it, dx: e.clientX - r.left, dy: e.clientY - r.top };
      el.classList.add("drag");
      try { el.setPointerCapture(e.pointerId); } catch {}
    },
    onMove(e) {
      if (!this.drag) return;
      const st = $("#shapes-stage").getBoundingClientRect();
      const { it, dx, dy } = this.drag;
      it.el.style.left = e.clientX - st.left - dx + "px";
      it.el.style.top = e.clientY - st.top - dy + "px";
    },
    onUp() {
      if (!this.drag) return;
      const { it } = this.drag; this.drag = null;
      it.el.classList.remove("drag");
      const cx = parseFloat(it.el.style.left) + this.size / 2, cy = parseFloat(it.el.style.top) + this.size / 2;
      const tol = this.size * 0.5;
      // buraco mais próximo do ponto onde soltou
      let near = null, best = Infinity;
      for (const o of this.items) { const d = Math.hypot(cx - (o.hx + this.size / 2), cy - (o.hy + this.size / 2)); if (d < best) { best = d; near = o; } }
      if (near === it && best < tol) {
        it.locked = true;
        it.el.classList.add("locked"); it.hole.classList.add("filled");
        it.el.style.left = it.hx + "px"; it.el.style.top = it.hy + "px";
        this.say(it.sh.name);
        if (this.items.every((x) => x.locked)) this.finish();
        return;
      }
      // errou o buraco ou soltou longe: a peça volta e o buraco certo pulsa
      it.el.style.left = it.ox + "px"; it.el.style.top = it.oy + "px";
      if (best < tol) { it.hole.classList.remove("hint"); void it.hole.offsetWidth; it.hole.classList.add("hint"); this.say("não coube"); }
    },
    finish() {
      this.busy = true; this.rounds++;
      $("#shapes-prompt").textContent = "Encaixou!";
      setTimeout(() => {
        if (!this.open) return;
        if (this.rounds >= 6) { this.close(); toast("Chega de formas por agora. Que tal a caixa de sapato com furos?"); return; }
        this.build();
      }, 1600);
    },
  };
  const sstage = $("#shapes-stage");
  sstage.addEventListener("pointerdown", (e) => Shapes.onDown(e));
  sstage.addEventListener("pointermove", (e) => Shapes.onMove(e));
  ["pointerup", "pointercancel"].forEach((ev) => sstage.addEventListener(ev, () => Shapes.onUp()));
  $("#shapes-back").addEventListener("click", () => Shapes.close());
  window.addEventListener("resize", () => { if (Shapes.open && !Shapes.items.some((i) => i.locked)) Shapes.build(); });

  $("#album-grid").addEventListener("pointerdown", (e) => {
    if (e.target.closest("#album-montar")) { Puzzle.start(Album.lastId); return; }
    if (e.target.closest("#album-formas")) { Shapes.start(); return; }
    if (e.target.closest("#album-contar")) { Numbers.start(); return; }
    if (e.target.closest("#album-cores")) { Colors.start(); return; }
    if (e.target.closest("#album-add")) { go("setup"); return; }
    const b = e.target.closest("[data-card]"); if (b) Album.play(b.dataset.card);
  });
  // impede zoom por duplo toque e seleção dentro do álbum
  $("#view-album").addEventListener("touchend", (e) => { if (e.target.closest(".album-card")) e.preventDefault(); }, { passive: false });

  // sair: segurar 2 s (a criança não consegue por acidente)
  const exitBtn = $("#album-exit");
  const HOLD_MS = 2000;
  function holdStart(e) {
    e.preventDefault();
    Album.holdStart = Date.now();
    try { exitBtn.setPointerCapture(e.pointerId); } catch {}
    Album.holdTimer = setInterval(() => {
      const p = Math.min(100, ((Date.now() - Album.holdStart) / HOLD_MS) * 100);
      exitBtn.style.setProperty("--p", p + "%");
      if (p >= 100) { holdEnd(); go("home"); }
    }, 40);
  }
  function holdEnd() {
    clearInterval(Album.holdTimer); Album.holdTimer = null;
    exitBtn.style.setProperty("--p", "0%");
  }
  exitBtn.addEventListener("pointerdown", holdStart);
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => exitBtn.addEventListener(ev, holdEnd));

  // configurar: também exige segurar, para a criança não abrir
  let setupHold;
  const setupBtn = $("#album-setup-btn");
  setupBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); setupHold = setTimeout(() => go("setup"), 1200); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => setupBtn.addEventListener(ev, () => clearTimeout(setupHold)));
  $("#album-empty-setup").addEventListener("click", () => go("setup"));

  // ---------- Fim de sessão ----------
  const End = {
    render() {
      const pick = END_ACTIVITIES[Math.floor(Math.random() * END_ACTIVITIES.length)];
      $("#end-title").textContent = P(pick.title);
      $("#end-summary").textContent = P(pick.summary);
    },
  };

  // ---------- Configurar álbum ----------
  const Setup = {
    photo: null, audio: null, rec: null, chunks: [], previewUrl: null,
    async render() {
      $("#limit-select").value = String(Album.limitMin());
      $("#pieces-select").value = String(Puzzle.count());
      $("#colors-options").value = String(Colors.options());
      $("#numbers-max").value = String(Numbers.max());
      $("#shapes-count").value = String(Shapes.count());
      $("#colors-set").value = String(Colors.set().length);
      await Album.load();
      $("#setup-list").innerHTML = Album.cards.length ? Album.cards.map((c) => `
        <div class="setup-item"><img src="${Album.urls.get(c.id)}" alt=""><span class="n">${esc(c.name)}</span>
        <button class="x" data-rm="${c.id}" aria-label="Remover">×</button></div>`).join("")
        : `<p class="hint">Nenhuma foto ainda.</p>`;
      this.validate();
    },
    validate() {
      const ok = !!this.photo && $("#card-name").value.trim().length > 0;
      $("#card-save").disabled = !ok;
    },
    reset() {
      this.photo = null; this.audio = null; this.chunks = [];
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      $("#photo-preview").hidden = true; $("#photo-preview").src = "";
      $("#photo-drop-label").hidden = false;
      $("#photo-input").value = ""; $("#card-name").value = "";
      $("#rec-status").textContent = "sem áudio"; $("#rec-play").disabled = true;
      this.validate();
    },
  };

  // reduz a foto para caber no armazenamento (máx. 900 px)
  function shrinkImage(file) {
    return new Promise((res) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 900;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => res(b || file), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }

  $("#photo-input").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    Setup.photo = await shrinkImage(f);
    if (Setup.previewUrl) URL.revokeObjectURL(Setup.previewUrl);
    Setup.previewUrl = URL.createObjectURL(Setup.photo);
    $("#photo-preview").src = Setup.previewUrl; $("#photo-preview").hidden = false;
    $("#photo-drop-label").hidden = true;
    Setup.validate();
  });
  $("#card-name").addEventListener("input", () => Setup.validate());

  $("#rec-btn").addEventListener("click", async () => {
    const btn = $("#rec-btn");
    if (Setup.rec && Setup.rec.state === "recording") { Setup.rec.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Gravação não disponível neste navegador");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      Setup.rec = rec; Setup.chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && Setup.chunks.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        Setup.audio = new Blob(Setup.chunks, { type: rec.mimeType || mime || "audio/webm" });
        btn.textContent = "● Gravar de novo"; btn.classList.remove("on");
        $("#rec-status").textContent = "áudio gravado"; $("#rec-play").disabled = false;
      };
      rec.start();
      btn.textContent = "■ Parar"; btn.classList.add("on");
      $("#rec-status").textContent = "gravando… fale o nome e uma frase curta";
      setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 10000); // máx. 10 s
    } catch (err) {
      toast("Sem permissão para o microfone");
    }
  });
  $("#rec-play").addEventListener("click", () => {
    if (!Setup.audio) return;
    const a = new Audio(URL.createObjectURL(Setup.audio));
    a.onended = () => URL.revokeObjectURL(a.src);
    a.play();
  });
  $("#card-save").addEventListener("click", async () => {
    const name = $("#card-name").value.trim();
    if (!Setup.photo || !name) return;
    await DB.put({ id: uid(), name, photo: Setup.photo, audio: Setup.audio, created: Date.now() });
    toast(`${name} adicionado ao álbum`);
    Setup.reset();
    Setup.render();
  });
  $("#setup-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    const c = Album.cards.find((x) => x.id === b.dataset.rm);
    if (!confirm(`Remover "${c?.name}" do álbum?`)) return;
    await DB.del(b.dataset.rm);
    Setup.render();
  });
  const saveColors = () => { LS.set("colors", { options: Number($("#colors-options").value), set: Number($("#colors-set").value) }); toast("Cores salvas"); };
  $("#colors-options").addEventListener("change", saveColors);
  $("#shapes-count").addEventListener("change", (e) => { LS.set("shapesCount", Number(e.target.value)); toast("Formas salvas"); });
  $("#numbers-max").addEventListener("change", (e) => { LS.set("numbersMax", Number(e.target.value)); toast("Contagem salva"); });
  $("#colors-set").addEventListener("change", saveColors);
  $("#pieces-select").addEventListener("change", (e) => { LS.set("pieces", Number(e.target.value)); toast("Peças salvas"); });
  $("#limit-select").addEventListener("change", (e) => {
    LS.set("limit", Number(e.target.value));
    toast("Limite salvo");
  });

  // ---------- Backup ----------
  const blobToB64 = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const b64ToBlob = async (d) => (await fetch(d)).blob();

  $("#backup-export").addEventListener("click", async () => {
    await Album.load();
    const cards = [];
    for (const c of Album.cards) {
      cards.push({ id: c.id, name: c.name, created: c.created, photo: await blobToB64(c.photo), audio: c.audio ? await blobToB64(c.audio) : null });
    }
    const store = {};
    Object.keys(localStorage).filter((key) => key.startsWith("nicole:")).forEach((key) => { store[key] = localStorage.getItem(key); });
    const data = { app: "nicole", version: 2, exported: Date.now(), cards, store };
    downloadText(`nicole-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), "application/json");
    toast("Backup gerado");
  });
  $("#backup-import").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "nicole" || !Array.isArray(data.cards)) throw new Error("formato");
      if (!confirm(`Importar ${data.cards.length} fotos e os dados das crianças? Isso substitui o que está no aparelho.`)) return;
      await DB.clear();
      for (const c of data.cards) {
        await DB.put({ id: c.id || uid(), name: c.name, created: c.created || Date.now(), photo: await b64ToBlob(c.photo), audio: c.audio ? await b64ToBlob(c.audio) : null });
      }
      Object.keys(localStorage).filter((key) => key.startsWith("nicole:")).forEach((key) => localStorage.removeItem(key));
      if (data.store) Object.entries(data.store).forEach(([key, v]) => localStorage.setItem(key, v));
      else { LS.set("diary:nicole", data.diary || []); LS.set("milestones:nicole", data.milestones || {}); LS.set("done:nicole", data.done || {}); LS.set("limit", data.limit || 8); }
      Kids.seed();
      toast("Backup importado");
      Setup.render();
    } catch {
      toast("Arquivo de backup inválido");
    } finally { e.target.value = ""; }
  });

  // ---------- init ----------
  Kids.seed();
  Home.render();
  if (!Kids.all().length) go("kids");
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
