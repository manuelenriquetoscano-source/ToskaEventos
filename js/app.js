/* =============================================================================
   Estado / Constantes / Utilidades
   ========================================================================== */
const LS_KEY = "tsoft_reservas_v1";
const UI_KEY = "tsoft_ui_v1";
const ADMIN_CODE = "1234";
const ZONA_WA = "549";

const state = {
  reservas: /** @type {Reserva[]} */ ([]),
  slots: ["10:00","12:00","14:00","16:00","18:00","20:00"],
  cupos: { "10:00": 2, "12:00": 2, "14:00": 2, "16:00": 2, "18:00": 2, "20:00": 2 },
  vista: "month",
  anchorDate: todayISO(),
  noLaborables: { weekdays:[0], dates:[], recurring:["01-01"] }
};

const ui = { heartbeat: true };

function load(){ try{ state.reservas = JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ state.reservas=[]; } }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state.reservas)); }
function loadUI(){ try{ Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY)||"{}")); }catch{} }
function saveUI(){ localStorage.setItem(UI_KEY, JSON.stringify(ui)); }

function uid(){ return Math.random().toString(36).slice(2,9); }
function zero(n){ return String(n).padStart(2,"0"); }

// Fechas locales
function fmtDateISO(d){ return `${d.getFullYear()}-${zero(d.getMonth()+1)}-${zero(d.getDate())}`; }
function fromISO(iso){ const [y,m,dd] = iso.split("-").map(Number); return new Date(y,(m||1)-1,dd||1); }
function todayISO(){ const t=new Date(); return fmtDateISO(new Date(t.getFullYear(),t.getMonth(),t.getDate())); }
function nowHM(){ const t=new Date(); return `${zero(t.getHours())}:${zero(t.getMinutes())}`; }
function parseYYYYMM(yyyyMm){ const [y,m] = yyyyMm.split("-").map(Number); return {y,m}; }
function yymmFromDate(d){ return `${d.getFullYear()}-${zero(d.getMonth()+1)}`; }
function sameDate(a,b){ return a===b; }
function isPastDate(iso){ return fromISO(iso) < fromISO(todayISO()); }
function isPastSlot(fecha,hora){ return fecha===todayISO() && hora<=nowHM(); }
function isClosedDate(iso){
  const d = fromISO(iso);
  const dow = d.getDay();
  if(state.noLaborables.weekdays.includes(dow)) return true;
  const mmdd = `${zero(d.getMonth()+1)}-${zero(d.getDate())}`;
  if(state.noLaborables.recurring.includes(mmdd)) return true;
  if(state.noLaborables.dates.includes(iso)) return true;
  return false;
}

/* Disponibilidad por franja */
function availabilityFor(fecha, slot){
  const taken = state.reservas.filter(r=> r.fecha===fecha && r.hora===slot && r.estado!=="cancelada").length;
  const cap = state.cupos[slot] ?? 1;
  return Math.max(0, cap - taken);
}

/* Slots válidos */
function candidateSlotsForDate(fecha){
  if(isClosedDate(fecha)) return [];
  const base = (fecha===todayISO()) ? state.slots.filter(s=> s>nowHM()) : [...state.slots];
  return base.filter(s => availabilityFor(fecha, s) > 0);
}

/* =============================================================================
   Tipos
   ========================================================================== */
/** @typedef {"pendiente"|"confirmada"|"cancelada"} Estado */
/** @typedef {{id:string, nombre:string, telefono:string, fecha:string, hora:string, personas:number, tipo:string, notas:string, estado:Estado, createdAt:string}} Reserva */

/* =============================================================================
   Inicio
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  load();
  loadUI();
  initHero();
  initForm();
  initCalendar();
  initAdmin();
  updateFAB();
  applyHeartbeat();
});

/* =============================================================================
   Hero
   ========================================================================== */
function initHero(){
  const el = document.getElementById("proximaFecha");
  const futuras = state.reservas
    .filter(r => fromISO(r.fecha) >= fromISO(todayISO()))
    .sort((a,b)=> (`${a.fecha} ${a.hora}`).localeCompare(`${b.fecha} ${b.hora}`));
  el.textContent = futuras[0]
    ? `${futuras[0].fecha} ${futuras[0].hora} · ${futuras[0].nombre} (${futuras[0].personas} pers.)`
    : "Sin reservas próximas";
}

/* =============================================================================
   Formulario
   ========================================================================== */
function initForm(){
  const fecha = document.getElementById("fecha");
  fecha.value = todayISO();
  fecha.min = todayISO();
  updateHorasOptions();

  document.getElementById("formReserva").addEventListener("submit", onSubmitReserva);
  document.getElementById("btnSoloGuardar").addEventListener("click", onSoloGuardar);
  fecha.addEventListener("change", updateHorasOptions);
}

function updateHorasOptions(){
  const selHora  = document.getElementById("hora");
  const fechaSel = document.getElementById("fecha").value || todayISO();

  const candidatos = candidateSlotsForDate(fechaSel);
  selHora.innerHTML = candidatos.map(s=>{
    const left = availabilityFor(fechaSel, s);
    return `<option value="${s}">${s} · cupo ${left}/${state.cupos[s]??1}</option>`;
  }).join("");
  selHora.disabled = candidatos.length === 0;
  if(candidatos.length===0) selHora.innerHTML = `<option value="">Sin horarios disponibles</option>`;
}

function onSoloGuardar(){
  const r = buildFromForm(); if(!r) return;
  state.reservas.push(r); save();
  alert("Reserva guardada.");
  refreshAfterChange();
}
function onSubmitReserva(e){
  e.preventDefault();
  const r = buildFromForm(); if(!r) return;
  state.reservas.push(r); save();
  openWhatsApp(r);
  refreshAfterChange();
}

function buildFromForm(){
  const nombre   = document.getElementById("nombre").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  const fecha    = document.getElementById("fecha").value;
  const hora     = document.getElementById("hora").value;
  const personas = Number(document.getElementById("personas").value);
  const tipo     = document.getElementById("tipo").value;
  const notas    = document.getElementById("notas").value.trim();

  if(!nombre || !telefono || !fecha || !hora || !personas || !tipo){
    alert("Completá todos los campos obligatorios."); return null;
  }
  if(isClosedDate(fecha)){ alert("Fecha no operativa. Elegí otro día."); return null; }
  if(isPastDate(fecha)){ alert("No podés reservar en días pasados."); return null; }
  if(isPastSlot(fecha,hora)){ alert("Ese horario ya pasó para el día de hoy."); return null; }
  if(availabilityFor(fecha,hora) <= 0){ alert("Cupo agotado para esa franja."); return null; }

  return { id:uid(), nombre, telefono, fecha, hora, personas, tipo, notas,
           estado:"pendiente", createdAt:new Date().toISOString() };
}

function openWhatsApp(r){
  const tel = normalizeAR(r.telefono);
  const texto = encodeURIComponent(
    `Hola, soy ${r.nombre}. Quiero reservar (${r.tipo}) para el ${r.fecha} a las ${r.hora} para ${r.personas} personas. ` +
    (r.notas ? `Notas: ${r.notas}. ` : "") + `Código: ${r.id}.`
  );
  window.open(`https://wa.me/${tel}?text=${texto}`, "_blank", "noopener");
}
function normalizeAR(tel){
  const clean = String(tel).replace(/\D/g,'');
  return clean.startsWith("54") ? clean : `${ZONA_WA}${clean}`;
}

function refreshAfterChange(){
  initHero();
  renderCalendario();
  const adminVisible = document.getElementById("adminPanel") && !document.getElementById("adminPanel").classList.contains("hidden");
  if(adminVisible) renderTablaAdmin();
}

/* =============================================================================
   Calendario (mes/semana) + botón Hoy
   ========================================================================== */
function initCalendar(){
  const mesInput = document.getElementById("mesInput");
  const vistaSel = document.getElementById("vistaSelect");
  mesInput.value = yymmFromDate(new Date());
  state.vista = vistaSel ? vistaSel.value : "month";

  const btnHoy = document.getElementById("btnHoy");
  if(btnHoy) btnHoy.addEventListener("click", goToToday);
  mesInput.addEventListener("change", ()=>{ state.anchorDate = `${mesInput.value}-01`; renderCalendario(); });
  if(vistaSel) vistaSel.addEventListener("change", ()=>{ state.vista = vistaSel.value; renderCalendario(); });

  document.addEventListener("keydown", (ev)=>{
    const tag = (ev.target.tagName || "").toLowerCase();
    if(tag==="input"||tag==="textarea"||tag==="select") return;
    if(ev.key.toLowerCase()==="h") goToToday();
  });

  renderCalendario();
}

function goToToday(){
  const mesInput = document.getElementById("mesInput");
  const hoy = new Date();
  mesInput.value = yymmFromDate(hoy);
  state.anchorDate = todayISO();
  renderCalendario();

  const fechaInput = document.getElementById("fecha");
  fechaInput.value = todayISO();
  updateHorasOptions();

  const todayEl = document.querySelector(".day--today");
  if(todayEl){
    todayEl.classList.add("flash");
    todayEl.scrollIntoView({behavior:"smooth", block:"center"});
    setTimeout(()=> todayEl.classList.remove("flash"), 900);
  }
  const sr = document.getElementById("srStatus");
  if(sr) sr.textContent = `Saltado a hoy: ${todayISO()}`;
}

/* Render principal según vista */
function renderCalendario(){
  const grid = document.getElementById("gridCalendario");
  grid.innerHTML = "";
  if(state.vista === "week"){ renderSemana(grid); }
  else { renderMes(grid); }
}

/* ---- Vista Mes ---- */
function renderMes(grid){
  const {y,m} = parseYYYYMM(document.getElementById("mesInput").value);
  const first = new Date(y, m-1, 1);
  const startWeekday = (first.getDay()+6)%7; // Lunes=0
  const lastDay = new Date(y, m, 0).getDate();

  ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].forEach(d=>{
    const h=document.createElement("div"); h.className="day";
    h.innerHTML=`<strong>${d}</strong>`; h.style.background="transparent"; h.style.border="0";
    grid.appendChild(h);
  });

  for(let i=0;i<startWeekday;i++){
    const empty=document.createElement("div"); empty.className="day"; empty.style.visibility="hidden"; grid.appendChild(empty);
  }

  for(let d=1; d<=lastDay; d++){
    const fecha = `${y}-${zero(m)}-${zero(d)}`;
    grid.appendChild(buildDayCell(fecha, d));
  }
}

/* ---- Vista Semana ---- */
function renderSemana(grid){
  const anchor = new Date(state.anchorDate || todayISO());
  const wd = (anchor.getDay()+6)%7; // lunes=0
  const monday = new Date(anchor); monday.setDate(anchor.getDate()-wd);

  ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].forEach((d,i)=>{
    const date = new Date(monday); date.setDate(monday.getDate()+i);
    const h=document.createElement("div"); h.className="day";
    h.innerHTML=`<strong>${d} ${zero(date.getDate())}/${zero(date.getMonth()+1)}</strong>`;
    h.style.background="transparent"; h.style.border="0";
    grid.appendChild(h);
  });

  for(let i=0;i<7;i++){
    const date = new Date(monday); date.setDate(monday.getDate()+i);
    const fecha = fmtDateISO(date);
    grid.appendChild(buildDayCell(fecha, date.getDate()));
  }
}

/* Celda de día */
function buildDayCell(fecha, numeroDia){
  const pasado = isPastDate(fecha);
  const esHoy = fecha===todayISO();
  const cerrado = isClosedDate(fecha);

  const reservasDia = state.reservas.filter(r=> sameDate(r.fecha, fecha) && r.estado!=="cancelada");
  const base = candidateSlotsForDate(fecha);
  const libres = base.filter(s => availabilityFor(fecha,s) > 0);

  const pendientes  = reservasDia.filter(r=>r.estado==="pendiente").length;
  const confirmadas = reservasDia.filter(r=>r.estado==="confirmada").length;

  const dayEl = document.createElement("div");
  dayEl.className =
    "day" + ((pasado||cerrado) ? " day--disabled" : "") + (!pasado && !cerrado && esHoy ? " day--today" : "");

  if(cerrado){
    dayEl.title = `CERRADO · ${fecha}`;
  }else{
    const detalle = state.slots.map(s=>{
      const left = (fecha===todayISO() && s<=nowHM()) ? 0 : availabilityFor(fecha,s);
      const cap = state.cupos[s] ?? 1;
      return `${s}: ${left}/${cap}`;
    }).join(" • ");
    dayEl.title = `Disponibilidad · ${fecha}\n${detalle}`;
  }

  const summary = cerrado
    ? `<span class="slot"><i class="dot dot--busy"></i>Cerrado</span>`
    : `
      <span class="slot"><i class="dot dot--ok"></i>${libres.length} libres</span>
      <span class="slot"><i class="dot dot--pending"></i>${pendientes} pend.</span>
      <span class="slot"><i class="dot dot--busy"></i>${confirmadas} conf.</span>
    `;

  dayEl.innerHTML = `
    <div class="day__num">${numeroDia}</div>
    <div class="day__content">${summary}</div>
    <div>
      <button class="btn btn--ghost btnMini" data-fecha="${fecha}" ${(pasado||cerrado) ? "disabled" : ""}>
        Reservar
      </button>
    </div>
  `;

  const btn = dayEl.querySelector(".btnMini");
  if(btn && !pasado && !cerrado){
    btn.addEventListener("click",(e)=>{
      const f = e.currentTarget.getAttribute("data-fecha");
      document.getElementById("fecha").value = f;
      updateHorasOptions();
      document.getElementById("reservas").scrollIntoView({behavior:"smooth"});
    });
  }

  return dayEl;
}

/* =============================================================================
   Panel Admin + Filtros + Mensaje rápido + Recordatorio manual
   ========================================================================== */
function initAdmin(){
  const modal = document.getElementById("adminModal");
  const btnAdmin = document.getElementById("btnAdmin");
  const btnCerrar = document.getElementById("btnCerrarAdmin");
  const btnEntrar = document.getElementById("btnEntrar");

  btnAdmin.addEventListener("click", ()=> openModal(modal));
  btnCerrar.addEventListener("click", ()=> closeModal(modal));
  modal.addEventListener("click", (e)=> { if(e.target === modal) closeModal(modal); });

  btnEntrar.addEventListener("click", ()=>{
    const code = document.getElementById("adminCode").value;
    if(code === ADMIN_CODE){
      document.getElementById("adminLogin").classList.add("hidden");
      document.getElementById("adminPanel").classList.remove("hidden");
      wireAdminFilters();
      renderTablaAdmin();
      const chk = document.getElementById("toggleHeartbeat");
      if(chk){
        chk.checked = !!ui.heartbeat;
        chk.addEventListener("change", ()=>{ ui.heartbeat = chk.checked; saveUI(); applyHeartbeat(); });
      }
    } else { alert("Código incorrecto."); }
  });

  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
  document.getElementById("btnExportJSON").addEventListener("click", exportJSON);
  document.getElementById("btnLimpiarPendientes").addEventListener("click", limpiarPendientesAntiguas);
}

function wireAdminFilters(){
  const ids = ["filtroTexto","filtroEstado","filtroDesde","filtroHasta"];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("input", renderTablaAdmin);
  });
  const clear = document.getElementById("btnLimpiarFiltros");
  if(clear) clear.addEventListener("click", ()=>{
    const f = getFilters();
    f.texto.value = ""; f.estado.value = ""; f.desde.value = ""; f.hasta.value = "";
    renderTablaAdmin();
  });
}
function getFilters(){
  return {
    texto: document.getElementById("filtroTexto") || { value:"" },
    estado: document.getElementById("filtroEstado") || { value:"" },
    desde: document.getElementById("filtroDesde") || { value:"" },
    hasta: document.getElementById("filtroHasta") || { value:"" },
  };
}
function matchFilters(r){
  const {texto, estado, desde, hasta} = getFilters();
  const q = (texto.value || "").toLowerCase().trim();
  const st = (estado.value || "").trim();
  const d  = (desde.value || "");
  const h  = (hasta.value || "");
  if(q){
    const blob = `${r.nombre} ${r.telefono} ${r.notas||""} ${r.tipo||""}`.toLowerCase();
    if(!blob.includes(q)) return false;
  }
  if(st && r.estado !== st) return false;
  if(d && r.fecha < d) return false;
  if(h && r.fecha > h) return false;
  return true;
}

function openModal(m){ m.setAttribute("aria-hidden","false"); }
function closeModal(m){
  m.setAttribute("aria-hidden","true");
  document.getElementById("adminLogin").classList.remove("hidden");
  document.getElementById("adminPanel").classList.add("hidden");
  document.getElementById("adminCode").value = "";
}

function renderTablaAdmin(){
  const tbody = document.querySelector("#tablaReservas tbody");
  const items = [...state.reservas]
    .filter(matchFilters)
    .sort((a,b)=>(`${a.fecha} ${a.hora}`).localeCompare(`${b.fecha} ${b.hora}`));

  tbody.innerHTML = items.map(r=>`
    <tr>
      <td>${r.fecha}</td>
      <td>${r.hora}</td>
      <td>${r.nombre}</td>
      <td>${r.telefono}</td>
      <td>${r.personas}</td>
      <td>${r.tipo || "-"}</td>
      <td>${renderEstado(r.estado)}</td>
      <td class="row gap">
        <button class="icon-btn" title="Confirmar" data-act="confirm" data-id="${r.id}">✅</button>
        <button class="icon-btn" title="Pendiente" data-act="pend" data-id="${r.id}">🕒</button>
        <button class="icon-btn" title="Cancelar" data-act="cancel" data-id="${r.id}">🗑</button>
        <button class="icon-btn" title="Mensaje rápido" data-act="msg" data-id="${r.id}">💬</button>
        <button class="icon-btn" title="Recordatorio manual" data-act="remind" data-id="${r.id}">🔔</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-id");
      const act = b.getAttribute("data-act");
      const r = state.reservas.find(x=>x.id===id);
      if(!r) return;

      if(act==="confirm") r.estado="confirmada";
      if(act==="pend")    r.estado="pendiente";
      if(act==="cancel")  r.estado="cancelada";
      if(act==="msg"){ openWhatsAppQuick(r); return; }
      if(act==="remind"){ await sendManualReminder(r); return; }

      save(); renderTablaAdmin(); renderCalendario(); updateHorasOptions();
    });
  });

  const resumen = document.getElementById("resumenFiltro");
  if(resumen) resumen.textContent = `${items.length} resultado(s)`;
}

/* Mensaje rápido por estado */
function openWhatsAppQuick(r){
  const tel = normalizeAR(r.telefono);
  let body = "";
  if(r.estado==="pendiente"){
    body = `Hola ${r.nombre}, registramos tu solicitud para ${r.tipo||"evento"} el ${r.fecha} a las ${r.hora}. En breve te confirmamos. Código: ${r.id}.`;
  } else if(r.estado==="confirmada"){
    body = `Confirmación: ${r.nombre}, tu reserva (${r.tipo||"evento"}) es el ${r.fecha} a las ${r.hora}. ¡Te esperamos! Código: ${r.id}.`;
  } else {
    body = `Hola ${r.nombre}, tu reserva del ${r.fecha} a las ${r.hora} quedó en estado "${r.estado}". Si necesitás reprogramar, respondé a este mensaje. Código: ${r.id}.`;
  }
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "noopener");
}

/* Recordatorio manual: intenta backend; si falla, abre wa.me */
async function sendManualReminder(r){
  const tel = normalizeAR(r.telefono);
  const body = `Recordatorio: ${r.nombre}, tu reserva (${r.tipo||"evento"}) es el ${r.fecha} a las ${r.hora}. Código: ${r.id}.`;
  const USE_BACKEND = true;

  if(USE_BACKEND){
    try{
      const res = await fetch("http://localhost:3000/wa/send-now", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ toE164: tel, text: body })
      });
      if(res.ok){ alert("Recordatorio enviado desde backend."); return; }
      // fallback
      console.warn("Backend no disponible, uso wa.me");
    }catch(e){ console.warn("Error backend:", e); }
  }
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "noopener");
}

function renderEstado(estado){
  if(estado==="confirmada") return `<span class="badge badge--ok">confirmada</span>`;
  if(estado==="pendiente")  return `<span class="badge badge--pending">pendiente</span>`;
  return `<span class="badge badge--busy">cancelada</span>`;
}

/* =============================================================================
   Export / Limpieza
   ========================================================================== */
function exportJSON(){ downloadBlob(new Blob([JSON.stringify(state.reservas,null,2)],{type:"application/json"}),"reservas.json"); }
function exportCSV(){
  const header = ["id","nombre","telefono","fecha","hora","personas","tipo","estado","notas","createdAt"];
  const rows = state.reservas.map(r=> header.map(h => String(r[h] ?? "").replaceAll('"','""')));
  const csv = [header.join(","), ...rows.map(r=> r.map(x=>`"${x}"`).join(","))].join("\n");
  downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}), "reservas.csv");
}
function downloadBlob(blob, filename){
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function limpiarPendientesAntiguas(){
  const hoy = new Date();
  const corte = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const keep = state.reservas.filter(r => fromISO(r.fecha) >= corte);
  const removed = state.reservas.length - keep.length;
  state.reservas = keep; save();
  alert(`Se eliminaron ${removed} reservas antiguas en estado pendiente/cancelada.`);
  refreshAfterChange();
}

/* =============================================================================
   WhatsApp FAB
   ========================================================================== */
function updateFAB(){
  const fab = document.getElementById("fabWA");
  if(!fab) return;
  fab.addEventListener("click",(e)=>{
    e.preventDefault();
    const tel = document.getElementById("telefono").value.trim();
    const t = tel ? normalizeAR(tel) : "";
    window.open(`https://wa.me/${t}`, "_blank", "noopener");
  });
}
function applyHeartbeat(){
  const fab = document.getElementById("fabWA");
  if(!fab) return;
  fab.classList.toggle("heartbeat", !!ui.heartbeat);
}
