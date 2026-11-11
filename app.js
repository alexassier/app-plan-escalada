(() => {
  "use strict";
  const FILE = window.PLAN;
  const TIPOS = FILE.tipos;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const empty = (v) => v == null || v === "";
  const newId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* JSON con claves ordenadas, para comparar versiones sin depender del orden */
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => ((a[x] = v[x]), a), {}) : v));
  const hash = (o) => { const s = canon(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

  /* ---------- almacenamiento en el dispositivo ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
  };
  const K = { plan: "escalada.plan", tests: "escalada.tests", done: "escalada.hecho", view: "escalada.vista", gh: "escalada.github" };
  let gh = store.get(K.gh, null); // conexión con GitHub: { repo, branch, token, sha, pending, lastSync, error }
  const ghOn = () => !!(gh && gh.repo && gh.token);

  /* ---------- datos: plan-data.js es el punto de partida ---------- */
  const mkEx = (id, v) => ({ id, nombre: v.nombre, tipo: v.tipo, series: v.series ?? null, reps: v.reps ?? null, rpe: v.rpe ?? null, descanso: v.descanso ?? null, nota: v.nota || "" });
  function normalizePlan(p) {
    return {
      inicio: p.inicio,
      mesociclos: p.mesociclos.map((m, mi) => ({
        nombre: m.nombre,
        objetivo: m.objetivo || "",
        dias: m.dias.map((d, di) => ({
          titulo: d.titulo,
          ejercicios: d.ejercicios.map((e, i) => Array.isArray(e)
            ? mkEx(`m${mi}d${di}e${i}`, { nombre: e[0], tipo: e[1], series: e[2], reps: e[3], rpe: e[4], descanso: e[5], nota: e[6] })
            : mkEx(e.id || newId(), e)),
        })),
      })),
    };
  }
  const noIds = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k === "id" ? undefined : v)));
  const fileData = {
    plan: () => normalizePlan(clone({ inicio: FILE.inicio, mesociclos: FILE.mesociclos })),
    tests: () => clone({ atleta: FILE.atleta, tests: FILE.tests }),
  };
  const fileHash = { plan: hash(noIds(fileData.plan())), tests: hash(fileData.tests()) };
  const valid = {
    plan: (d) => d && typeof d.inicio === "string" && Array.isArray(d.mesociclos) && d.mesociclos.every((m) => Array.isArray(m.dias)),
    tests: (d) => d && d.atleta && Array.isArray(d.tests),
  };

  const conflict = { plan: false, tests: false };
  function loadSection(sec) {
    const local = store.get(K[sec], null);
    if (local && valid[sec](local.data)) {
      const same = hash(sec === "plan" ? noIds(local.data) : local.data) === fileHash[sec];
      conflict[sec] = !ghOn() && !same && local.base !== fileHash[sec];
      return sec === "plan" ? normalizePlan(local.data) : local.data;
    }
    return fileData[sec]();
  }
  let plan = loadSection("plan");
  let T = loadSection("tests"); // { atleta, tests }

  let persisted = false;
  function save(sec, quiet) {
    const prev = store.get(K[sec], null);
    const ok = store.set(K[sec], { base: prev?.base ?? fileHash[sec], guardado: Date.now(), data: sec === "plan" ? plan : T });
    if (!quiet) toast(ok ? "Guardado en este móvil" : "No se ha podido guardar. ¿Navegación privada?");
    if (ok && !persisted && navigator.storage?.persist) { persisted = true; navigator.storage.persist().catch(() => {}); }
    if (ok) scheduleSync();
    return ok;
  }

  /* marcas de "hecho": antes iban por posición, ahora por id de ejercicio */
  const done = store.get(K.done, {});
  Object.keys(done).forEach((k) => {
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(k);
    if (m) { done[`${m[1]}:m${Math.floor(m[1] / 4)}d${m[2]}e${m[3]}`] = 1; delete done[k]; }
  });
  store.set(K.done, done);
  const keyOf = (w, id) => `${w}:${id}`;

  /* ---------- fechas ---------- */
  const DAY = 864e5;
  const fmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
  const fmtLong = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });
  const short = (d) => fmt.format(d).replace(".", "");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDay = (s) => { const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; };
  const longDay = (s) => { const d = parseDay(s); return d ? fmtLong.format(d) : "sin fecha"; };

  /* ---------- semanas ---------- */
  let start, weeks, totalWeeks, rawCurrent, current;
  function buildWeeks() {
    start = parseDay(plan.inicio) || today;
    weeks = [];
    plan.mesociclos.forEach((m, mi) => {
      for (let k = 0; k < 4; k++) {
        const n = mi * 4 + k;
        const from = new Date(start.getTime() + n * 7 * DAY);
        const to = new Date(from.getTime() + 6 * DAY);
        weeks.push({ n, mi, k, meso: m, rest: k === 0, from, to, load: k === 0 ? 0.22 + mi * 0.06 : 0.45 + k * 0.13 + mi * 0.06 });
      }
    });
    totalWeeks = weeks.length;
    rawCurrent = Math.floor((today - start) / (7 * DAY));
    current = rawCurrent >= 0 && rawCurrent < totalWeeks ? rawCurrent : -1;
  }
  buildWeeks();

  /* La carga de cada semana sale de la plantilla del mesociclo */
  function prescribe(ex, w) {
    let { series: sets, rpe } = ex;
    if (typeof sets === "number" && sets > 1) {
      if (w.rest) sets = Math.max(1, Math.round(sets * 0.6));
      else if (w.k === 3) sets = sets + 1;
    }
    if (typeof rpe === "number") {
      if (w.rest) rpe = Math.max(4, rpe - 2);
      else if (w.k === 3) rpe = Math.min(10, rpe + 1);
    }
    return { id: ex.id, name: ex.nombre, type: ex.tipo, sets, reps: ex.reps, rpe, rest: ex.descanso, note: ex.nota };
  }

  /* ---------- estado ---------- */
  const saved = store.get(K.view, {});
  let selWeek = current >= 0 ? current : Math.min(Math.max(saved.week ?? 0, 0), totalWeeks - 1);
  let selDay = null;
  let editing = false;

  function weekCounts(w) {
    let total = 0, ok = 0;
    w.meso.dias.forEach((d) => d.ejercicios.forEach((e) => { total++; if (done[keyOf(w.n, e.id)]) ok++; }));
    return { total, ok };
  }
  function dayCounts(w, di) {
    const list = w.meso.dias[di].ejercicios;
    let ok = 0; list.forEach((e) => { if (done[keyOf(w.n, e.id)]) ok++; });
    return { total: list.length, ok };
  }
  function firstOpenDay(w) {
    for (let di = 0; di < w.meso.dias.length; di++) { const c = dayCounts(w, di); if (c.ok < c.total) return di; }
    return 0;
  }

  /* ---------- cabecera ---------- */
  function renderBar() {
    const t = $("#bar-now");
    if (current >= 0) t.textContent = `Semana ${current + 1} de ${totalWeeks}, ${weeks[current].meso.nombre.toLowerCase()}`;
    else if (rawCurrent < 0) t.textContent = `Empieza el ${fmtLong.format(start)}`;
    else t.textContent = "Plan terminado. Toca hacer tests.";
  }

  /* ---------- aviso si plan-data.js ha cambiado ---------- */
  function renderNotice(sec) {
    if (ghOn()) conflict[sec] = false;
    const box = $(`#notice-${sec}`);
    box.hidden = !conflict[sec];
    if (!conflict[sec]) return;
    box.innerHTML = sec === "plan"
      ? `<p><strong>Hay una versión nueva del plan en el archivo.</strong> En este móvil sigues viendo el plan con tus cambios.</p>
         <div class="notice__acts"><button class="btn btn--sm btn--primary" type="button" data-act="take-file" data-sec="plan">Usar el plan nuevo</button><button class="btn btn--sm" type="button" data-act="keep-local" data-sec="plan">Mantener el mío</button></div>`
      : `<p><strong>Los tests del archivo han cambiado.</strong> Estás viendo los resultados apuntados en este móvil.</p>
         <div class="notice__acts"><button class="btn btn--sm" type="button" data-act="take-file" data-sec="tests">Usar los del archivo</button><button class="btn btn--sm btn--primary" type="button" data-act="keep-local" data-sec="tests">Mantener los míos</button></div>`;
  }

  /* ---------- topo de semanas ---------- */
  function renderTopo() {
    const box = $("#weeks");
    box.innerHTML = "";
    box.style.gridTemplateColumns = `repeat(${totalWeeks}, 1fr)`;
    const pts = weeks.map((w, i) => [((i + 0.5) / totalWeeks) * 1200, 100 - w.load * 100]);
    let d = pts.length ? `M0 ${100 - 0.12 * 100} L ${pts[0][0]} ${pts[0][1]}` : "";
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    $("#rope").setAttribute("d", d);

    weeks.forEach((w, i) => {
      const c = weekCounts(w);
      const b = el("button", "wk" + (w.rest ? " wk--rest" : " wk--load") + (w.k === 3 ? " wk--anchor" : "") + (i === current ? " wk--now" : ""));
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.week = i;
      b.style.setProperty("--y", w.load);
      b.setAttribute("aria-label", `Semana ${i + 1}, ${w.rest ? "descarga" : "carga"}, ${short(w.from)} a ${short(w.to)}${i === current ? ", esta semana" : ""}${c.ok ? `, ${c.ok} de ${c.total} hechos` : ""}`);
      const pct = c.total ? c.ok / c.total : 0;
      b.innerHTML = `
        ${i === current ? '<span class="wk__now">Hoy</span>' : ""}
        <span class="wk__bolt" style="--p:${pct}"></span>
        <span class="wk__num">${i + 1}</span>`;
      box.append(b);
    });

    const mesos = $("#mesos");
    mesos.innerHTML = "";
    mesos.style.gridTemplateColumns = `repeat(${plan.mesociclos.length}, 1fr)`;
    plan.mesociclos.forEach((m, mi) => {
      const a = weeks[mi * 4], z = weeks[mi * 4 + 3];
      const s = el("div", "meso");
      s.innerHTML = `<p class="meso__name">${esc(m.nombre)}</p><p class="meso__range">Semanas ${mi * 4 + 1} a ${mi * 4 + 4}<span class="meso__dates">, ${short(a.from)} a ${short(z.to)}</span></p>`;
      mesos.append(s);
    });
    markWeek();
  }

  function markWeek() {
    $$(".wk").forEach((b) => {
      const on = +b.dataset.week === selWeek;
      b.classList.toggle("is-sel", on);
      b.setAttribute("aria-selected", on);
      b.tabIndex = on ? 0 : -1;
    });
  }

  /* ---------- semana ---------- */
  function renderWeek() {
    const w = weeks[selWeek];
    if (selDay == null || selDay >= w.meso.dias.length) selDay = firstOpenDay(w);
    $("#week-name").textContent = `Semana ${selWeek + 1}`;
    $("#week-meta").innerHTML = `<span class="phase phase--${w.rest ? "rest" : "load"}">${w.rest ? "Descarga" : "Carga"}</span> ${esc(w.meso.nombre)}, del ${short(w.from)} al ${short(w.to)}`;
    $("#week-goal").textContent = w.rest
      ? `Semana suave: menos series y RPE más bajo para asimilar. ${w.meso.objetivo}`
      : w.k === 3 ? `Semana más dura del bloque: una serie más y RPE +1. ${w.meso.objetivo}` : w.meso.objetivo;
    const eb = $("#edit-bar");
    eb.hidden = !editing;
    eb.innerHTML = editing
      ? `<p>Editas el bloque <strong>${esc(w.meso.nombre)}</strong>: los cambios valen para sus 4 semanas.</p><button class="btn btn--sm" type="button" data-act="meso">${icon("edit")}Nombre y objetivo</button>`
      : "";
    $("#prev-week").disabled = selWeek === 0;
    $("#next-week").disabled = selWeek === totalWeeks - 1;
    updateProgress();
    renderDays();
    markWeek();
    store.set(K.view, { week: selWeek });
  }

  function updateProgress() {
    const c = weekCounts(weeks[selWeek]);
    const p = $("#week-progress");
    p.innerHTML = c.total && c.ok === c.total ? `${icon("check")}Semana completa` : `<strong>${c.ok}</strong> de ${c.total} ejercicios hechos`;
    p.classList.toggle("is-complete", c.total > 0 && c.ok === c.total);
  }

  function renderDays() {
    const w = weeks[selWeek];
    const tabs = $("#day-tabs"), panels = $("#day-panels");
    tabs.innerHTML = ""; panels.innerHTML = "";

    w.meso.dias.forEach((d, di) => {
      const c = dayCounts(w, di);
      const full = c.total > 0 && c.ok === c.total;
      const t = el("button", "dtab");
      t.type = "button";
      t.id = `tab-${di}`;
      t.setAttribute("role", "tab");
      t.setAttribute("aria-controls", `panel-${di}`);
      t.dataset.day = di;
      t.innerHTML = `<span class="dtab__n">Día ${di + 1}</span><span class="dtab__t">${esc(d.titulo)}</span><span class="dtab__c${full ? " is-done" : ""}">${full ? icon("check") : `${c.ok}/${c.total}`}</span>`;
      tabs.append(t);

      const p = el("div", "dpanel");
      p.id = `panel-${di}`;
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-labelledby", `tab-${di}`);
      p.innerHTML = `<div class="dpanel__head"><h3 class="dpanel__title"><span>Día ${di + 1}</span> ${esc(d.titulo)}</h3>${editing ? `<button class="btn btn--sm" type="button" data-act="day" data-d="${di}">${icon("edit")}Editar día</button>` : ""}</div>`;
      const ul = el("ul", "exlist");
      d.ejercicios.forEach((raw, i) => ul.append(exerciseItem(prescribe(raw, w), w.n, di, i)));
      p.append(ul);
      if (!d.ejercicios.length) p.append(el("p", "empty", editing ? "Este día no tiene ejercicios todavía." : "Día sin ejercicios. Descanso."));
      if (editing) {
        const add = el("button", "add-btn", `${icon("plus")}Añadir ejercicio`);
        add.type = "button"; add.dataset.act = "add-ex"; add.dataset.d = di;
        p.append(add);
      }
      panels.append(p);
    });
    if (editing) {
      const add = el("button", "dtab dtab--add", `${icon("plus")}<span>Añadir día</span>`);
      add.type = "button";
      add.dataset.act = "add-day";
      tabs.append(add);
    }
    markDay();
  }

  function cell(label, value) {
    return empty(value) ? "" : `<div class="rx__c"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  }

  function exerciseItem(ex, wn, di, i) {
    const k = keyOf(wn, ex.id);
    const type = TIPOS[ex.type] || { nombre: ex.type || "Sin tipo", color: "var(--muted)" };
    const li = el("li", "ex" + (done[k] ? " is-done" : ""));
    li.style.setProperty("--tc", type.color);
    const id = `ex-${wn}-${ex.id}`;
    const q = encodeURIComponent(ex.name + " escalada ejercicio");
    const multi = typeof ex.sets === "number" && ex.sets > 1;
    const side = editing
      ? `<button class="ex__video ex__edit" type="button" data-act="ex" data-d="${di}" data-i="${i}">${icon("edit")}<span>Editar</span></button>`
      : ex.type === "roca" ? "" : `<a class="ex__video" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">${icon("play")}<span>Ver vídeo</span></a>`;
    li.innerHTML = `
      <input class="ex__check" type="checkbox" id="${id}" ${done[k] ? "checked" : ""}>
      <label class="ex__box" for="${id}" aria-hidden="true">${icon("check")}</label>
      <div class="ex__body">
        <label class="ex__name" for="${id}">${esc(ex.name)}</label>
        <p class="ex__type"><span class="ex__dot"></span>${esc(type.nombre)}</p>
        <dl class="rx">
          ${multi ? cell("Series", ex.sets) : ""}
          ${cell(multi ? "Reps" : "Duración", ex.reps)}
          ${cell("RPE", typeof ex.rpe === "number" ? ex.rpe.toLocaleString("es-ES") : ex.rpe)}
          ${cell("Descanso", ex.rest)}
        </dl>
        ${ex.note ? `<p class="ex__note">${esc(ex.note)}</p>` : ""}
      </div>
      ${side}`;
    li.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) done[k] = 1; else delete done[k];
      store.set(K.done, done);
      li.classList.toggle("is-done", e.target.checked);
      refreshCounts();
    });
    return li;
  }

  function refreshCounts() {
    const w = weeks[selWeek];
    $$(".dtab[data-day]").forEach((t) => {
      const c = dayCounts(w, +t.dataset.day);
      const full = c.total > 0 && c.ok === c.total;
      const span = t.querySelector(".dtab__c");
      span.classList.toggle("is-done", full);
      span.innerHTML = full ? icon("check") : `${c.ok}/${c.total}`;
    });
    updateProgress();
    const b = $(`.wk[data-week="${selWeek}"] .wk__bolt`);
    const c = weekCounts(w);
    if (b) b.style.setProperty("--p", c.total ? c.ok / c.total : 0);
  }

  function markDay() {
    $$(".dtab[data-day]").forEach((t) => {
      const on = +t.dataset.day === selDay;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    });
    $$(".dpanel").forEach((p, i) => { p.hidden = i !== selDay; });
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("is-editing", on);
    const b = $("#edit-plan");
    b.setAttribute("aria-pressed", on);
    b.innerHTML = on ? `${icon("check")}Terminar` : `${icon("edit")}Editar plan`;
    renderWeek();
  }

  /* ---------- tests ---------- */
  const GRADES = "ABCDE";
  function delta(a, b, mejor) {
    if (empty(b)) return { dir: "none", text: "Pendiente" };
    if (empty(a)) return { dir: "none", text: "Nuevo" };
    if (mejor === "letra") {
      const d = GRADES.indexOf(a) - GRADES.indexOf(b); // positivo = mejora
      return { dir: d > 0 ? "up" : d < 0 ? "down" : "eq", text: d === 0 ? "Igual" : d > 0 ? "Mejora" : "Baja" };
    }
    const diff = b - a;
    const pct = a ? (diff / Math.abs(a)) * 100 : 0;
    const good = mejor === "baja" ? diff < 0 : diff > 0;
    if (Math.abs(pct) < 0.5) return { dir: "eq", text: "Igual" };
    return { dir: good ? "up" : "down", text: `${diff > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")} %` };
  }
  const num = (v, u) => empty(v) ? `<span class="dash">—</span>` : (typeof v === "number" ? v.toLocaleString("es-ES") : esc(v)) + (u ? `<small> ${esc(u)}</small>` : "");
  function chip(dlt) {
    const ic = { up: "up", down: "down", eq: "eq", none: "dot" }[dlt.dir];
    return `<span class="chip chip--${dlt.dir}">${icon(ic)}${dlt.text}</span>`;
  }

  function renderTests() {
    const a = T.atleta;
    $("#tests-dates").textContent = `Del ${longDay(a.fechaAntes)} al ${longDay(a.fechaAhora)}`;
    const dp = !empty(a.peso.ahora) && !empty(a.peso.antes) ? a.peso.ahora - a.peso.antes : null;
    $("#athlete").innerHTML = `
      <div><dt>Altura</dt><dd>${num(a.altura.valor, a.altura.unidad)}</dd></div>
      <div><dt>Peso</dt><dd>${num(a.peso.ahora, a.peso.unidad)}${dp != null && Math.abs(dp) >= 0.05 ? ` <span class="athlete__d">${dp > 0 ? "+" : "−"}${Math.abs(dp).toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg</span>` : ""}</dd></div>
      <div><dt>Boulder</dt><dd>${num(a.grado.boulder)}</dd></div>
      <div><dt>Vía</dt><dd>${num(a.grado.via)}</dd></div>`;

    const tally = { up: 0, down: 0, eq: 0, none: 0 };
    const root = $("#test-groups");
    root.innerHTML = "";
    T.tests.forEach((g, gi) => {
      const sec = el("section", "tgroup");
      sec.innerHTML = `<div class="tgroup__head"><h3 class="tgroup__title">${esc(g.grupo)}</h3><button class="icon-btn icon-btn--sm" type="button" data-act="group" data-g="${gi}" aria-label="Editar grupo ${esc(g.grupo)}">${icon("edit")}</button></div><div class="thead" aria-hidden="true"><div class="tval"><span></span><span>Antes</span><span>Ahora</span><span>Cambio</span></div><div class="tval"><span></span><span>Antes</span><span>Ahora</span><span>Cambio</span></div></div>`;
      const list = el("ul", "tlist");
      g.items.forEach((t, ti) => {
        const li = el("li", "trow");
        let rows = "";
        if (t.lados) {
          rows = Object.entries(t.lados).map(([side, [x, y]]) => {
            const dl = delta(x, y, t.mejor); tally[dl.dir]++;
            return `<span class="tval"><span class="tval__side">${side === "izq" ? "Izq." : "Dcha."}</span><span class="tval__before">${num(x, t.unidad)}</span><span class="tval__now">${num(y, t.unidad)}</span>${chip(dl)}</span>`;
          }).join("");
        } else {
          const dl = delta(t.antes, t.ahora, t.mejor); tally[dl.dir]++;
          rows = `<span class="tval"><span class="tval__side"></span><span class="tval__before">${num(t.antes, t.unidad)}</span><span class="tval__now">${num(t.ahora, t.unidad)}</span>${chip(dl)}</span>`;
        }
        li.innerHTML = `<button class="trow__btn" type="button" data-act="test" data-g="${gi}" data-t="${ti}"><span class="trow__name">${esc(t.nombre)}<span class="trow__pen">${icon("edit")}<span class="sr">Editar</span></span></span><span class="trow__vals">${rows}</span></button>`;
        list.append(li);
      });
      sec.append(list);
      const add = el("button", "add-btn", `${icon("plus")}Añadir test`);
      add.type = "button"; add.dataset.act = "add-test"; add.dataset.g = gi;
      sec.append(add);
      root.append(sec);
    });
    const total = tally.up + tally.down + tally.eq;
    $("#tests-sum").innerHTML = `
      <span class="sumbar" aria-hidden="true">
        <span style="flex:${tally.up}" class="sumbar__up"></span><span style="flex:${tally.eq}" class="sumbar__eq"></span><span style="flex:${tally.down}" class="sumbar__down"></span><span style="flex:${tally.none}" class="sumbar__none"></span>
      </span>
      <span><strong>${tally.up}</strong> mejoran, <strong>${tally.eq}</strong> igual y <strong>${tally.down}</strong> bajan, de ${total} medidas${tally.none ? `. <strong>${tally.none}</strong> pendientes` : ""}</span>`;
    renderNotice("tests");
  }

  /* ---------- hoja de edición (dialog) ---------- */
  const sheet = $("#sheet");
  const form = $("#sheet-form");
  let sheetCfg = null;
  function openSheet(cfg) {
    sheetCfg = cfg;
    form.innerHTML = `
      <header class="sheet__head">
        <div><h2 class="sheet__title" id="sheet-title">${esc(cfg.title)}</h2>${cfg.sub ? `<p class="sheet__sub">${cfg.sub}</p>` : ""}</div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon("x")}</button>
      </header>
      <div class="sheet__body">${cfg.body}</div>
      ${cfg.onSave || cfg.extra ? `<footer class="sheet__foot">${cfg.extra || ""}<span class="sheet__sp"></span>${cfg.onSave ? `<button type="button" class="btn btn--cancel" data-close>Cancelar</button><button type="submit" class="btn btn--primary">${esc(cfg.saveLabel || "Guardar")}</button>` : ""}</footer>` : ""}`;
    if (cfg.onOpen) cfg.onOpen(form);
    if (!sheet.open) sheet.showModal();
    form.querySelector(".sheet__body").scrollTop = 0;
  }
  function closeSheet() { if (sheet.open) sheet.close(); }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!sheetCfg?.onSave) return;
    $$(".field.is-bad", form).forEach((f) => f.classList.remove("is-bad"));
    const res = sheetCfg.onSave(new FormData(form), form);
    if (res !== false) closeSheet();
  });
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) { closeSheet(); return; }
    const b = e.target.closest("[data-sheet-act]");
    if (!b) return;
    if (b.dataset.confirm && !b.classList.contains("is-armed")) {
      b.classList.add("is-armed");
      b.dataset.label = b.innerHTML;
      b.innerHTML = `${icon("trash")}${esc(b.dataset.confirm)}`;
      setTimeout(() => { if (b.isConnected) { b.classList.remove("is-armed"); b.innerHTML = b.dataset.label; } }, 3500);
      return;
    }
    sheetCfg?.onAction?.(b.dataset.sheetAct, b, form);
  });
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  /* campos */
  const attr = (v) => esc(v ?? "");
  const fText = (name, label, v, o = {}) => `<label class="field${o.wide === false ? "" : ""}"><span class="field__l">${label}</span><input class="input" type="${o.type || "text"}" name="${name}" value="${attr(v)}" ${o.req ? "required" : ""} ${o.mode ? `inputmode="${o.mode}"` : ""} ${o.ph ? `placeholder="${attr(o.ph)}"` : ""} autocomplete="off"></label>`;
  const fNum = (name, label, v, o = {}) => fText(name, label, empty(v) ? "" : String(v).replace(".", ","), { ...o, mode: "decimal" });
  const fSelect = (name, label, v, opts) => `<label class="field"><span class="field__l">${label}</span><span class="select"><select class="input" name="${name}">${opts.map(([val, txt]) => `<option value="${attr(val)}"${String(val) === String(v ?? "") ? " selected" : ""}>${esc(txt)}</option>`).join("")}</select></span></label>`;
  const fGrade = (name, label, v) => `<fieldset class="field"><legend class="field__l">${label}</legend><div class="seg">${[..."ABCDE", ""].map((g) => `<label class="seg__o"><input type="radio" name="${name}" value="${g}"${(v ?? "") === g ? " checked" : ""}><span>${g || "—"}</span></label>`).join("")}</div></fieldset>`;
  const row = (...f) => `<div class="frow">${f.join("")}</div>`;
  const hint = (t) => `<p class="hint">${t}</p>`;
  const parseNum = (s) => { s = String(s ?? "").trim().replace(",", "."); if (s === "") return null; const n = Number(s); return isNaN(n) ? NaN : n; };
  const bad = (f, name) => { f.querySelector(`[name="${name}"]`)?.closest(".field")?.classList.add("is-bad"); f.querySelector(`[name="${name}"]`)?.focus(); return false; };
  const txt = (fd, k) => String(fd.get(k) ?? "").trim();

  /* ----- test ----- */
  const sideNames = { izq: "Izquierda", dcha: "Derecha" };
  function valuesHTML(mejor, lados, v) {
    const f = mejor === "letra" ? (n, l, x) => fGrade(n, l, x) : (n, l, x) => fNum(n, l, x);
    if (lados) {
      const wrap = mejor === "letra" ? (...x) => x.join("") : row;
      return ["izq", "dcha"].map((s) => `<div class="fside"><p class="fside__t">${sideNames[s]}</p>${wrap(f(`${s}_antes`, "Antes", v[`${s}_antes`]), f(`${s}_ahora`, "Ahora", v[`${s}_ahora`]))}</div>`).join("");
    }
    return mejor === "letra" ? f("antes", "Antes", v.antes) + f("ahora", "Ahora", v.ahora) : row(f("antes", "Antes", v.antes), f("ahora", "Ahora", v.ahora));
  }
  function readValues(fd, mejor, lados) {
    const keys = lados ? ["izq_antes", "izq_ahora", "dcha_antes", "dcha_ahora"] : ["antes", "ahora"];
    const out = {};
    keys.forEach((k) => { const r = fd.get(k); out[k] = r == null ? null : mejor === "letra" ? (r || null) : String(r); });
    return out;
  }
  function testSheet(gi, ti) {
    const isNew = ti == null;
    const t = isNew ? { nombre: "", antes: null, ahora: null, unidad: "", mejor: "sube" } : T.tests[gi].items[ti];
    const vals = t.lados
      ? { izq_antes: t.lados.izq?.[0], izq_ahora: t.lados.izq?.[1], dcha_antes: t.lados.dcha?.[0], dcha_ahora: t.lados.dcha?.[1] }
      : { antes: t.antes, ahora: t.ahora };
    openSheet({
      title: isNew ? "Nuevo test" : t.nombre,
      sub: isNew ? `En ${esc(T.tests[gi].grupo)}` : `${esc(T.tests[gi].grupo)} · Antes: ${esc(longDay(T.atleta.fechaAntes))}. Ahora: ${esc(longDay(T.atleta.fechaAhora))}`,
      body: `
        <div class="fvals" id="fvals">${valuesHTML(t.mejor, !!t.lados, vals)}</div>
        <details class="more"${isNew ? " open" : ""}><summary>Nombre, unidad y tipo de medida</summary><div class="more__in">
          ${fText("nombre", "Nombre", t.nombre, { req: true })}
          ${row(fText("unidad", "Unidad", t.unidad, { ph: "kg, s, cm, reps" }), fSelect("mejor", "Mejor si", t.mejor, [["sube", "Sube el número"], ["baja", "Baja el número"], ["letra", "Nota A–E (A mejor)"]]))}
          <label class="check"><input type="checkbox" name="lados"${t.lados ? " checked" : ""}><span>Izquierda y derecha por separado</span></label>
        </div></details>`,
      extra: isNew ? "" : `<button type="button" class="btn btn--ghost btn--danger" data-sheet-act="del" data-confirm="¿Borrar test?">${icon("trash")}Borrar</button>`,
      onOpen(f) {
        let mejor = t.mejor, lados = !!t.lados;
        f.addEventListener("change", (e) => {
          if (e.target.name !== "mejor" && e.target.name !== "lados") return;
          const fd = new FormData(f);
          const cur = readValues(fd, mejor, lados);
          const nm = fd.get("mejor"), nl = fd.get("lados") === "on";
          if ((nm === "letra") !== (mejor === "letra")) Object.keys(cur).forEach((k) => (cur[k] = null));
          if (nl && !lados) { cur.izq_antes = cur.dcha_antes = cur.antes; cur.izq_ahora = cur.dcha_ahora = cur.ahora; }
          if (!nl && lados) { cur.antes = cur.izq_antes; cur.ahora = cur.izq_ahora; }
          mejor = nm; lados = nl;
          $("#fvals", f).innerHTML = valuesHTML(mejor, lados, cur);
        });
      },
      onAction(act) {
        if (act === "del") { T.tests[gi].items.splice(ti, 1); save("tests"); renderTests(); closeSheet(); }
      },
      onSave(fd, f) {
        const nombre = txt(fd, "nombre");
        if (!nombre) { f.querySelector("details").open = true; return bad(f, "nombre"); }
        const mejor = fd.get("mejor"), lados = fd.get("lados") === "on";
        const raw = readValues(fd, mejor, lados);
        const v = {};
        for (const k in raw) {
          if (mejor === "letra") v[k] = raw[k];
          else { const n = parseNum(raw[k]); if (Number.isNaN(n)) return bad(f, k); v[k] = n; }
        }
        const unidad = mejor === "letra" ? "" : txt(fd, "unidad");
        const nt = { nombre };
        if (lados) nt.lados = { izq: [v.izq_antes, v.izq_ahora], dcha: [v.dcha_antes, v.dcha_ahora] };
        else { nt.antes = v.antes; nt.ahora = v.ahora; }
        if (unidad) nt.unidad = unidad;
        nt.mejor = mejor;
        if (isNew) T.tests[gi].items.push(nt); else T.tests[gi].items[ti] = nt;
        save("tests");
        renderTests();
      },
    });
  }

  function groupSheet(gi) {
    const isNew = gi == null;
    const g = isNew ? { grupo: "" } : T.tests[gi];
    openSheet({
      title: isNew ? "Nuevo grupo de tests" : "Grupo de tests",
      body: fText("grupo", "Nombre del grupo", g.grupo, { req: true, ph: "Movilidad, Fuerza…" }),
      extra: isNew ? "" : `<button type="button" class="btn btn--ghost btn--danger" data-sheet-act="del" data-confirm="¿Borrar con sus ${g.items.length} tests?">${icon("trash")}Borrar grupo</button>`,
      onAction(act) { if (act === "del") { T.tests.splice(gi, 1); save("tests"); renderTests(); closeSheet(); } },
      onSave(fd, f) {
        const name = txt(fd, "grupo");
        if (!name) return bad(f, "grupo");
        if (isNew) T.tests.push({ grupo: name, items: [] }); else g.grupo = name;
        save("tests"); renderTests();
      },
    });
  }

  function athleteSheet() {
    const a = T.atleta;
    openSheet({
      title: "Tus datos",
      body: `
        ${row(fNum("altura", `Altura (${esc(a.altura.unidad)})`, a.altura.valor), fNum("peso", `Peso ahora (${esc(a.peso.unidad)})`, a.peso.ahora))}
        ${row(fText("boulder", "Grado en boulder", a.grado.boulder), fText("via", "Grado en vía", a.grado.via))}
        ${fNum("pesoAntes", `Peso antes (${esc(a.peso.unidad)})`, a.peso.antes)}
        ${row(fText("fechaAntes", "Fecha tests antes", a.fechaAntes, { type: "date" }), fText("fechaAhora", "Fecha tests ahora", a.fechaAhora, { type: "date" }))}`,
      onSave(fd, f) {
        const nums = {};
        for (const k of ["altura", "peso", "pesoAntes"]) { const n = parseNum(fd.get(k)); if (Number.isNaN(n)) return bad(f, k); nums[k] = n; }
        a.altura.valor = nums.altura; a.peso.ahora = nums.peso; a.peso.antes = nums.pesoAntes;
        a.grado.boulder = txt(fd, "boulder"); a.grado.via = txt(fd, "via");
        a.fechaAntes = txt(fd, "fechaAntes") || a.fechaAntes; a.fechaAhora = txt(fd, "fechaAhora") || a.fechaAhora;
        save("tests"); renderTests();
      },
    });
  }

  function newRoundSheet() {
    openSheet({
      title: "Nueva tanda de tests",
      sub: "Para cuando vuelvas a hacer los tests.",
      body: `<p class="lead">Los resultados de <strong>Ahora</strong> pasan a <strong>Antes</strong>, y <strong>Ahora</strong> se queda vacío para que apuntes los nuevos uno a uno. El peso también.</p>
        ${fText("fecha", "Fecha de los nuevos tests", isoDay(today), { type: "date" })}`,
      saveLabel: "Empezar tanda",
      onSave(fd) {
        const prev = clone(T);
        const a = T.atleta;
        a.fechaAntes = a.fechaAhora;
        a.fechaAhora = txt(fd, "fecha") || isoDay(today);
        if (!empty(a.peso.ahora)) a.peso.antes = a.peso.ahora;
        T.tests.forEach((g) => g.items.forEach((t) => {
          if (t.lados) Object.keys(t.lados).forEach((s) => { const [x, y] = t.lados[s]; t.lados[s] = [empty(y) ? x : y, null]; });
          else { if (!empty(t.ahora)) t.antes = t.ahora; t.ahora = null; }
        }));
        save("tests", true);
        renderTests();
        toast("Tanda nueva lista. Toca cada test para apuntarlo.", { action: "Deshacer", run() { T = prev; save("tests", true); renderTests(); toast("Deshecho"); } });
      },
    });
  }

  /* ----- plan ----- */
  const tipoOpts = () => Object.entries(TIPOS).map(([k, t]) => [k, t.nombre]);
  function exSheet(di, i) {
    const w = weeks[selWeek];
    const day = w.meso.dias[di];
    const isNew = i == null;
    const e = isNew ? mkEx(newId(), { nombre: "", tipo: Object.keys(TIPOS)[0] }) : day.ejercicios[i];
    const n = day.ejercicios.length;
    openSheet({
      title: isNew ? "Nuevo ejercicio" : e.nombre,
      sub: `${esc(w.meso.nombre)} · Día ${di + 1}, ${esc(day.titulo)}`,
      body: `
        ${fText("nombre", "Ejercicio", e.nombre, { req: true })}
        ${fSelect("tipo", "Tipo", e.tipo, tipoOpts())}
        ${row(fNum("series", "Series", e.series), fText("reps", "Reps o duración", e.reps, { ph: "8, 10 s, 15 min" }))}
        ${row(fNum("rpe", "RPE", e.rpe, { ph: "1–10" }), fText("descanso", "Descanso", e.descanso, { ph: "2 min" }))}
        ${fText("nota", "Nota", e.nota, { ph: "Opcional" })}
        ${hint("Pon lo de una semana de carga normal. En la semana de descarga la web baja series y RPE sola, y en la última del bloque suma una serie y +1 de RPE.")}`,
      extra: isNew ? "" : `
        <button type="button" class="icon-btn" data-sheet-act="up" aria-label="Subir"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
        <button type="button" class="icon-btn" data-sheet-act="down" aria-label="Bajar"${i === n - 1 ? " disabled" : ""}>${icon("down")}</button>
        <button type="button" class="btn btn--ghost btn--danger" data-sheet-act="del" data-confirm="¿Borrar?">${icon("trash")}Borrar</button>`,
      onAction(act) {
        const list = day.ejercicios;
        if (act === "del") list.splice(i, 1);
        else { const j = act === "up" ? i - 1 : i + 1; [list[i], list[j]] = [list[j], list[i]]; }
        save("plan"); renderTopo(); renderWeek(); closeSheet();
      },
      onSave(fd, f) {
        const nombre = txt(fd, "nombre");
        if (!nombre) return bad(f, "nombre");
        const series = parseNum(fd.get("series")); if (Number.isNaN(series)) return bad(f, "series");
        const rpe = parseNum(fd.get("rpe")); if (Number.isNaN(rpe) || (rpe != null && (rpe < 1 || rpe > 10))) return bad(f, "rpe");
        const ne = mkEx(e.id, { nombre, tipo: fd.get("tipo"), series: series == null ? null : Math.round(series), reps: txt(fd, "reps") || null, rpe, descanso: txt(fd, "descanso") || null, nota: txt(fd, "nota") });
        if (isNew) day.ejercicios.push(ne); else day.ejercicios[i] = ne;
        save("plan"); renderTopo(); renderWeek();
      },
    });
  }

  function daySheet(di) {
    const w = weeks[selWeek];
    const isNew = di == null;
    const d = isNew ? { titulo: "", ejercicios: [] } : w.meso.dias[di];
    openSheet({
      title: isNew ? "Nuevo día" : `Día ${di + 1}`,
      sub: `Bloque ${esc(w.meso.nombre)}`,
      body: fText("titulo", "Nombre del día", d.titulo, { req: true, ph: "Dedos y volumen" }),
      extra: isNew || w.meso.dias.length < 2 ? "" : `<button type="button" class="btn btn--ghost btn--danger" data-sheet-act="del" data-confirm="¿Borrar día y ${d.ejercicios.length} ejercicios?">${icon("trash")}Borrar día</button>`,
      onAction(act) { if (act === "del") { w.meso.dias.splice(di, 1); selDay = Math.max(0, di - 1); save("plan"); renderTopo(); renderWeek(); closeSheet(); } },
      onSave(fd, f) {
        const t = txt(fd, "titulo");
        if (!t) return bad(f, "titulo");
        if (isNew) { w.meso.dias.push({ titulo: t, ejercicios: [] }); selDay = w.meso.dias.length - 1; } else d.titulo = t;
        save("plan"); renderTopo(); renderWeek();
      },
    });
  }

  function mesoSheet() {
    const m = weeks[selWeek].meso;
    openSheet({
      title: "Bloque de 4 semanas",
      body: `${fText("nombre", "Nombre", m.nombre, { req: true })}<label class="field"><span class="field__l">Objetivo</span><textarea class="input" name="objetivo" rows="3">${esc(m.objetivo)}</textarea></label>`,
      onSave(fd, f) {
        const n = txt(fd, "nombre");
        if (!n) return bad(f, "nombre");
        m.nombre = n; m.objetivo = txt(fd, "objetivo");
        save("plan"); renderBar(); renderTopo(); renderWeek();
      },
    });
  }

  /* ---------- ajustes, copia de seguridad e instalación ---------- */
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function lastSaved() {
    const t = Math.max(store.get(K.plan, {})?.guardado || 0, store.get(K.tests, {})?.guardado || 0);
    return t ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(t)) : null;
  }

  function settingsSheet() {
    const ls = lastSaved();
    const install = standalone() ? "" : `
      <section class="sset"><h3>Usarla como app</h3>
        ${installPrompt ? `<button type="button" class="btn btn--primary" data-sheet-act="install">${icon("phone")}Instalar en el móvil</button>`
          : `<p class="lead">${isIOS ? "En Safari, toca <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>." : "En el menú del navegador, toca <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar app</strong>."} Se abrirá a pantalla completa y funciona sin conexión.</p>`}
      </section>`;
    openSheet({
      title: "Ajustes",
      sub: ls ? `Tus cambios se guardan en este dispositivo. Último cambio: ${esc(ls)}.` : "Tus cambios se guardan en este dispositivo.",
      body: `
        <section class="sset"><h3>Plan</h3>
          ${fText("inicio", "Lunes de la semana 1", plan.inicio, { type: "date" })}
        </section>
        ${ghSection()}
        <section class="sset"><h3>Copia de seguridad</h3>
          <p class="lead">Si borras los datos del navegador o cambias de móvil, se pierde lo apuntado. Guarda una copia de vez en cuando.</p>
          <div class="sset__btns">
            <button type="button" class="btn" data-sheet-act="export">${icon("download")}Guardar copia</button>
            <button type="button" class="btn" data-sheet-act="import">${icon("upload")}Cargar copia</button>
            <button type="button" class="btn" data-sheet-act="planfile">${icon("download")}Descargar plan-data.js</button>
          </div>
          ${ghOn() ? "" : hint("plan-data.js lleva tu plan y tus tests actuales. Si no conectas GitHub, puedes subirlo a mano en lugar del antiguo.")}
          <input type="file" id="import-file" accept="application/json,.json" hidden>
        </section>
        ${install}
        <section class="sset"><h3>Empezar de cero</h3>
          <p class="lead">Borra lo editado en este móvil y vuelve a lo que hay en ${ghOn() ? "GitHub" : "plan-data.js"}. Los ejercicios marcados como hechos se mantienen.</p>
          <div class="sset__btns"><button type="button" class="btn btn--danger" data-sheet-act="reset" data-confirm="Pulsa otra vez para borrar">${icon("trash")}Volver a ${ghOn() ? "lo de GitHub" : "plan-data.js"}</button></div>
        </section>`,
      saveLabel: "Guardar",
      onOpen(f) {
        $("#import-file", f).addEventListener("change", (e) => { const file = e.target.files[0]; if (file) importFile(file); e.target.value = ""; });
      },
      onAction(act, b, f) {
        if (act === "export") exportBackup();
        else if (act === "import") $("#import-file", f).click();
        else if (act === "planfile") exportPlanFile();
        else if (act === "install" && installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; closeSheet(); }); }
        else if (act.startsWith("gh-")) ghAction(act, f);
        else if (act === "reset" && ghOn()) {
          store.del(K.plan); store.del(K.tests);
          gh.sha = null; gh.pending = false; ghSave(); remoteConflict = null;
          closeSheet(); pull();
        }
        else if (act === "reset") {
          store.del(K.plan); store.del(K.tests);
          plan = fileData.plan(); T = fileData.tests(); conflict.plan = conflict.tests = false;
          renderAll(); closeSheet(); toast("Vuelves a tener el plan de plan-data.js");
        }
      },
      onSave(fd, f) {
        const v = txt(fd, "inicio");
        if (!parseDay(v)) return bad(f, "inicio");
        if (v !== plan.inicio) { plan.inicio = v; save("plan"); renderAll(); }
      },
    });
  }

  async function deliver(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    try {
      const file = new File([blob], name, { type: mime });
      if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (err) { if (err?.name === "AbortError") return; }
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Descargado ${name}`);
  }

  function exportBackup() {
    const data = { app: "plan-escalada", version: 1, exportado: new Date().toISOString(), plan, tests: T, hecho: done };
    deliver(`escalada-copia-${isoDay(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
  }

  function planFileText() {
    const trim = (a) => { while (a.length > 2 && empty(a[a.length - 1])) a.pop(); return a; };
    const out = {
      inicio: plan.inicio,
      atleta: T.atleta,
      tests: T.tests,
      tipos: TIPOS,
      mesociclos: plan.mesociclos.map((m) => ({ nombre: m.nombre, objetivo: m.objetivo, dias: m.dias.map((d) => ({ titulo: d.titulo, ejercicios: d.ejercicios.map((e) => trim([e.nombre, e.tipo, e.series, e.reps, e.rpe, e.descanso, e.nota || null])) })) })),
    };
    const head = `/*
  PLAN DE ESCALADA · datos editables
  ----------------------------------
  Todo lo que ves en la web sale de este archivo. Cambia los números,
  nombres o ejercicios y recarga la página. También se edita desde la
  propia web: si está conectada a GitHub, la web guarda aquí cada cambio.

  - inicio: lunes de la semana 1 (AAAA-MM-DD).
  - tests: "antes" y "ahora". mejor: "sube" si un número más alto es mejor,
    "baja" si más bajo es mejor, "letra" para notas A–E (A es la mejor).
    null = sin resultado todavía.
  - mesociclos: cada uno tiene 4 semanas; la primera es de descarga.
  - Cada ejercicio: [nombre, tipo, series, reps, rpe, descanso, nota opcional]
*/

`;
    return head + "window.PLAN = " + JSON.stringify(out, null, 2) + ";\n";
  }
  function exportPlanFile() { deliver("plan-data.js", planFileText(), "text/javascript"); }

  /* ---------- sincronización con GitHub ----------
     La web guarda plan-data.js en tu repositorio con la API de GitHub.
     Cada cambio se sube a los pocos segundos; al abrir, trae lo último. */
  const GH = "https://api.github.com";
  const FILE_PATH = "plan-data.js";
  let ghBusy = false, ghTimer = null, applyingRemote = false, remoteConflict = null, lastPull = 0;
  const ghSave = () => store.set(K.gh, gh);
  const b64e = (str) => { let bin = ""; new TextEncoder().encode(str).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
  const b64d = (str) => new TextDecoder().decode(Uint8Array.from(atob(str.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const ghMsg = (st) => st === 401 ? "GitHub no acepta la clave: está mal copiada o ha caducado."
    : st === 403 ? "La clave no tiene permiso para escribir. Dale permiso de «Contents: Read and write»."
    : st === 404 ? "No encuentro el repositorio. Revisa el nombre y que la clave tenga acceso a él."
    : `GitHub ha respondido con un error (${st}).`;

  async function ghFetch(url, opt = {}) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store", ...opt, headers: { Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opt.body ? { "Content-Type": "application/json" } : {}) } });
    } catch { const e = new Error("Sin conexión"); e.offline = true; throw e; }
    if (!res.ok) { const e = new Error(ghMsg(res.status)); e.status = res.status; throw e; }
    return res.json();
  }
  const ghGetFile = () => ghFetch(`${GH}/repos/${gh.repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(gh.branch)}`);
  const ghPutFile = (body) => ghFetch(`${GH}/repos/${gh.repo}/contents/${FILE_PATH}`, { method: "PUT", body: JSON.stringify(body) });

  function parsePlanFile(text) {
    const w = {};
    new Function("window", text)(w); // es tu propio plan-data.js, el mismo que carga la web
    const P = w.PLAN;
    if (!valid.plan(P) || !valid.tests(P)) throw new Error("El plan-data.js de GitHub no tiene el formato esperado.");
    return P;
  }
  const sameAsLocal = (P) => hash(noIds(normalizePlan(clone({ inicio: P.inicio, mesociclos: P.mesociclos })))) === hash(noIds(plan)) && hash({ atleta: P.atleta, tests: P.tests }) === hash(T);
  function adopt(P) {
    plan = normalizePlan(clone({ inicio: P.inicio, mesociclos: P.mesociclos }));
    T = clone({ atleta: P.atleta, tests: P.tests });
    applyingRemote = true;
    save("plan", true); save("tests", true);
    applyingRemote = false;
    renderAll();
  }

  function scheduleSync() {
    if (!ghOn() || applyingRemote) return;
    gh.pending = true; ghSave(); renderSync();
    clearTimeout(ghTimer);
    ghTimer = setTimeout(syncNow, 2500);
  }

  async function pushNow() {
    const body = { message: "Actualiza el plan desde la app", content: b64e(planFileText()), branch: gh.branch };
    if (gh.sha) body.sha = gh.sha;
    try {
      const r = await ghPutFile(body);
      gh.sha = r.content.sha; gh.pending = false;
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      // el archivo ha cambiado en GitHub desde la última vez
      const f = await ghGetFile();
      const P = parsePlanFile(b64d(f.content));
      if (sameAsLocal(P)) { gh.sha = f.sha; gh.pending = false; }
      else remoteConflict = { P, sha: f.sha };
    }
  }

  async function ghRun(job) {
    if (!ghOn()) return;
    if (ghBusy) { clearTimeout(ghTimer); ghTimer = setTimeout(() => ghRun(job), 1500); return; }
    ghBusy = true;
    try { await job(); gh.error = null; gh.lastSync = Date.now(); }
    catch (e) { gh.error = e.offline ? null : e.message; if (!e.offline) toast(e.message); }
    finally { ghBusy = false; if (gh) ghSave(); renderSync(); }
  }
  const syncNow = () => ghRun(async () => { if (gh.pending && !remoteConflict) await pushNow(); });
  const pull = () => ghRun(async () => {
    lastPull = Date.now();
    let f;
    try { f = await ghGetFile(); }
    catch (e) { if (e.status === 404) { gh.sha = null; await pushNow(); return; } throw e; }
    if (f.sha === gh.sha) { if (gh.pending && !remoteConflict) await pushNow(); return; }
    const P = parsePlanFile(b64d(f.content));
    if (sameAsLocal(P)) { gh.sha = f.sha; gh.pending = false; }
    else if (!gh.pending) { adopt(P); gh.sha = f.sha; toast("Actualizado con lo último de GitHub"); }
    else remoteConflict = { P, sha: f.sha };
  });

  function renderSync() {
    const b = $(".icon-btn--bar");
    b.classList.toggle("has-dot", ghOn() && !!(gh.pending || gh.error || remoteConflict));
    b.classList.toggle("has-error", ghOn() && !!(gh.error || remoteConflict));
    const box = $("#notice-sync");
    if (remoteConflict && box.hidden) { window.scrollTo({ top: 0, behavior: "smooth" }); toast("Hay cambios en GitHub y en este móvil. Elige arriba cuál guardar."); }
    box.hidden = !remoteConflict;
    box.innerHTML = remoteConflict ? `<p><strong>Hay cambios en GitHub y también en este móvil.</strong> Elige con cuál te quedas; el otro se pierde.</p>
      <div class="notice__acts"><button class="btn btn--sm btn--primary" type="button" data-act="gh-mine">Subir lo de este móvil</button><button class="btn btn--sm" type="button" data-act="gh-theirs">Usar lo de GitHub</button></div>` : "";
    const st = $("#gh-status");
    if (st) st.innerHTML = ghStatusText();
  }
  function resolveConflict(mine) {
    if (!remoteConflict) return;
    const { P, sha } = remoteConflict;
    remoteConflict = null;
    gh.sha = sha;
    if (mine) { gh.pending = true; syncNow(); }
    else { gh.pending = false; adopt(P); ghSave(); renderSync(); toast("Usando lo de GitHub"); }
  }

  const when = (t) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
  function ghStatusText() {
    if (!ghOn()) return "";
    if (gh.error) return `<span class="gh-st gh-st--bad">${esc(gh.error)}</span>`;
    if (remoteConflict) return `<span class="gh-st gh-st--bad">Tienes que elegir qué versión guardar (aviso arriba).</span>`;
    if (gh.pending) return `<span class="gh-st gh-st--wait">Hay cambios sin subir${navigator.onLine ? "" : ". Se subirán cuando tengas conexión"}.</span>`;
    return `<span class="gh-st gh-st--ok">${icon("check")}Todo subido${gh.lastSync ? `. Última vez: ${esc(when(gh.lastSync))}` : ""}.</span>`;
  }

  function ghSection() {
    if (ghOn()) {
      return `<section class="sset"><h3>GitHub</h3>
        <p class="lead">Conectada a <strong>${esc(gh.repo)}</strong> (rama ${esc(gh.branch)}). Cada cambio se guarda solo en plan-data.js y al abrir la app se trae lo último.</p>
        <p id="gh-status">${ghStatusText()}</p>
        <div class="sset__btns">
          <button type="button" class="btn" data-sheet-act="gh-sync">${icon("sync")}Sincronizar ahora</button>
          <button type="button" class="btn btn--ghost btn--danger" data-sheet-act="gh-off" data-confirm="¿Desconectar?">Desconectar</button>
        </div>
      </section>`;
    }
    return `<section class="sset"><h3>Guardar en GitHub</h3>
      <p class="lead">Conecta tu repositorio y cada cambio se guardará solo en plan-data.js. Así lo tienes igual en el móvil, en el PC y en GitHub, sin subir nada a mano.</p>
      ${fText("gh_repo", "Repositorio", "", { ph: "usuario/repositorio" })}
      ${row(fText("gh_branch", "Rama", "main"), `<label class="field"><span class="field__l">Clave (token)</span><input class="input" type="password" name="gh_token" autocomplete="off" placeholder="github_pat_…"></label>`)}
      ${hint(`Crea la clave en <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub › Fine-grained tokens</a>: elige solo este repositorio y en permisos pon <strong>Contents: Read and write</strong>. La clave se queda guardada solo en este dispositivo.`)}
      <p class="gh-err" id="gh-err" hidden></p>
      <div class="sset__btns"><button type="button" class="btn btn--primary" data-sheet-act="gh-connect">${icon("sync")}Conectar</button></div>
    </section>`;
  }

  async function ghAction(act, f) {
    if (act === "gh-sync") { if (gh.pending) await syncNow(); else await pull(); return; }
    if (act === "gh-off") { gh = null; store.del(K.gh); remoteConflict = null; renderSync(); settingsSheet(); toast("Desconectada de GitHub"); return; }
    if (act !== "gh-connect") return;
    const fd = new FormData(f);
    const repo = txt(fd, "gh_repo").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    const branch = txt(fd, "gh_branch") || "main";
    const token = txt(fd, "gh_token");
    const err = $("#gh-err", f);
    const fail = (m, field) => { err.textContent = m; err.hidden = false; if (field) bad(f, field); };
    err.hidden = true;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail("Escribe el repositorio como usuario/repositorio.", "gh_repo");
    if (!token) return fail("Pega la clave (token) de GitHub.", "gh_token");
    const btn = f.querySelector('[data-sheet-act="gh-connect"]');
    btn.disabled = true; btn.lastChild.textContent = "Conectando…";
    const prev = gh;
    gh = { repo, branch, token, sha: null, pending: false, lastSync: 0, error: null };
    try {
      const info = await ghFetch(`${GH}/repos/${repo}`);
      if (info.permissions && !info.permissions.push) throw new Error(ghMsg(403));
      let f2 = null;
      try { f2 = await ghGetFile(); } catch (e) { if (e.status !== 404) throw e; }
      ghSave();
      if (!f2) { gh.pending = true; await syncNow(); }
      else {
        const P = parsePlanFile(b64d(f2.content));
        gh.sha = f2.sha;
        const edited = !!(store.get(K.plan, null) || store.get(K.tests, null));
        if (sameAsLocal(P)) { /* ya coinciden */ }
        else if (!edited) adopt(P);
        else { gh.sha = null; gh.pending = true; remoteConflict = { P, sha: f2.sha }; }
        gh.lastSync = Date.now(); ghSave();
      }
      renderSync();
      settingsSheet();
      toast(remoteConflict ? "Conectada. Elige qué versión guardar." : "Conectada con GitHub");
    } catch (e) {
      gh = prev;
      btn.disabled = false; btn.lastChild.textContent = "Conectar";
      fail(e.offline ? "No hay conexión. Prueba otra vez cuando tengas internet." : e.message);
    }
  }

  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      let d;
      try { d = JSON.parse(r.result); } catch { toast("Ese archivo no es una copia válida"); return; }
      if (!d || !valid.plan(d.plan) || !valid.tests(d.tests)) { toast("Ese archivo no es una copia del plan de escalada"); return; }
      plan = normalizePlan(d.plan); T = d.tests;
      Object.keys(done).forEach((k) => delete done[k]);
      Object.assign(done, d.hecho || {});
      store.set(K.done, done);
      store.del(K.plan); store.del(K.tests);
      save("plan", true); save("tests", true);
      conflict.plan = conflict.tests = false;
      renderAll(); closeSheet();
      toast(`Copia cargada${d.exportado ? ` (del ${fmtLong.format(new Date(d.exportado))})` : ""}`);
    };
    r.readAsText(file);
  }

  /* ---------- aviso flotante ---------- */
  let toastTimer;
  function toast(msg, opt = {}) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${opt.action ? `<button type="button" class="toast__btn">${esc(opt.action)}</button>` : ""}`;
    if (opt.action) t.querySelector("button").addEventListener("click", () => { t.classList.remove("is-on"); opt.run(); }, { once: true });
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), opt.action ? 7000 : 2200);
  }

  /* ---------- vistas ---------- */
  function showView(v) {
    $$(".tab-main").forEach((b) => {
      if (b.dataset.view === v) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("#view-entreno").hidden = v !== "entreno";
    $("#view-tests").hidden = v !== "tests";
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.scrollTo(0, 0);
  }

  function renderAll() {
    buildWeeks();
    selWeek = Math.min(selWeek, totalWeeks - 1);
    renderBar();
    renderNotice("plan");
    renderTopo();
    renderWeek();
    renderTests();
  }

  /* ---------- eventos ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#sheet")) return;
    const act = e.target.closest("[data-act]");
    if (act) {
      const d = act.dataset;
      const g = d.g != null ? +d.g : null;
      switch (d.act) {
        case "test": return testSheet(g, +d.t);
        case "add-test": return testSheet(g, null);
        case "group": return groupSheet(g);
        case "add-group": return groupSheet(null);
        case "athlete": return athleteSheet();
        case "new-round": return newRoundSheet();
        case "ex": return exSheet(+d.d, +d.i);
        case "add-ex": return exSheet(+d.d, null);
        case "day": return daySheet(+d.d);
        case "add-day": return daySheet(null);
        case "meso": return mesoSheet();
        case "settings": return settingsSheet();
        case "take-file":
          store.del(K[d.sec]);
          if (d.sec === "plan") plan = fileData.plan(); else T = fileData.tests();
          conflict[d.sec] = false;
          renderAll(); toast(d.sec === "plan" ? "Usando el plan nuevo" : "Usando los tests del archivo");
          return;
        case "gh-mine": return resolveConflict(true);
        case "gh-theirs": return resolveConflict(false);
        case "keep-local": {
          const l = store.get(K[d.sec], null);
          if (l) { l.base = fileHash[d.sec]; store.set(K[d.sec], l); }
          conflict[d.sec] = false; renderNotice(d.sec);
          return;
        }
      }
    }
    const wk = e.target.closest(".wk");
    if (wk) { selWeek = +wk.dataset.week; selDay = null; renderWeek(); return; }
    const dt = e.target.closest(".dtab[data-day]");
    if (dt) { selDay = +dt.dataset.day; markDay(); return; }
    const tm = e.target.closest(".tab-main");
    if (tm) showView(tm.dataset.view);
  });
  $("#prev-week").addEventListener("click", () => { if (selWeek > 0) { selWeek--; selDay = null; renderWeek(); } });
  $("#next-week").addEventListener("click", () => { if (selWeek < totalWeeks - 1) { selWeek++; selDay = null; renderWeek(); } });
  $("#print-week").addEventListener("click", () => window.print());
  $("#edit-plan").addEventListener("click", () => setEditing(!editing));

  // Flechas en listas de pestañas
  function arrowNav(container, sel, onPick, vertical) {
    container.addEventListener("keydown", (e) => {
      const keys = vertical ? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] : ["ArrowLeft", "ArrowRight"];
      if (![...keys, "Home", "End"].includes(e.key)) return;
      const items = [...container.querySelectorAll(sel)];
      let i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === "Home") i = 0;
      else if (e.key === "End") i = items.length - 1;
      else i = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      onPick(i);
      container.querySelectorAll(sel)[i].focus();
    });
  }
  arrowNav($("#weeks"), ".wk", (i) => { selWeek = i; selDay = null; renderWeek(); });
  arrowNav($("#day-tabs"), ".dtab[data-day]", (i) => { selDay = i; markDay(); }, true);

  // Imprimir: todos los días visibles
  window.addEventListener("beforeprint", () => $$(".dpanel").forEach((p) => (p.hidden = false)));
  window.addEventListener("afterprint", markDay);

  /* ---------- inicio ---------- */
  renderAll();
  renderSync();
  if (ghOn()) pull();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ghOn() && Date.now() - lastPull > 30000) pull();
  });
  window.addEventListener("online", () => { if (ghOn()) (gh.pending ? syncNow() : pull()); });
  showView(location.hash === "#tests" ? "tests" : "entreno");

  // App instalable y sin conexión (solo funciona servida por https o localhost)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
