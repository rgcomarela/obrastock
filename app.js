const STORE_KEY = "obrastock.v1";
const SESSION_KEY = "obrastock.session";
const SUPABASE_URL = "https://fidukaqmeuldhlrqsssp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__2O4h6CfFjv4rELWKbiF8w_bp7nfbSd";
const SUPABASE_STATE_ID = "main";

const seed = {
  users: [
    { id: "USR-001", name: "Administrador", login: "admin", pass: "admin123", level: "Administrador" },
    { id: "USR-002", name: "Almoxarife Obra", login: "almox", pass: "almox123", level: "Almoxarife" },
    { id: "USR-003", name: "Consulta", login: "viewer", pass: "viewer123", level: "Visualização" }
  ],
  employees: [
    { id: "FUN-001", name: "Carlos Henrique Souza", cpf: "123.456.789-09", role: "Eletricista", phone: "(11) 99999-0101", team: "Equipe elétrica", status: "Ativo", photo: "" },
    { id: "FUN-002", name: "Mariana Lima Costa", cpf: "987.654.321-00", role: "Técnica de segurança", phone: "(11) 98888-0202", team: "SST", status: "Ativo", photo: "" },
    { id: "FUN-003", name: "João Pedro Alves", cpf: "456.789.123-33", role: "Encanador", phone: "(11) 97777-0303", team: "Hidráulica", status: "Ativo", photo: "" }
  ],
  items: [
    { id: "MAT-001", name: "Furadeira de impacto Bosch", code: "FER-001", category: "Ferramenta", stock: 4, unit: "unidade", condition: "Usado", value: 480, location: "Prateleira A1", photo: "", minStock: 1 },
    { id: "MAT-002", name: "Capacete de segurança amarelo", code: "EPI-101", category: "EPI", stock: 35, unit: "unidade", condition: "Novo", value: 38, location: "EPI B2", photo: "", minStock: 10 },
    { id: "MAT-003", name: "Cabo flexível 2,5 mm", code: "ELE-250", category: "Material elétrico", stock: 180, unit: "metro", condition: "Novo", value: 3.6, location: "Bobina C1", photo: "", minStock: 50 },
    { id: "MAT-004", name: "Joelho PVC 90 graus 25 mm", code: "HID-090", category: "Material hidráulico", stock: 80, unit: "unidade", condition: "Novo", value: 1.9, location: "Caixa H4", photo: "", minStock: 20 }
  ],
  movements: [],
  counters: { employee: 4, item: 5, user: 4, protocol: 1 },
  settings: { dark: false }
};

let db = structuredClone(seed);
let currentUser = null;
let activeView = "dashboard";
let withdrawCart = [];
let scanStream = null;
let cloudReady = false;

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => Number.parseFloat(v || 0);

async function loadDb() {
  const cloud = await loadCloudDb();
  if (cloud) {
    localStorage.setItem(STORE_KEY, JSON.stringify(cloud));
    return normalizeDb(cloud);
  }
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    localStorage.setItem(STORE_KEY, JSON.stringify(seed));
    return structuredClone(seed);
  }
  return normalizeDb(JSON.parse(raw));
}

async function saveDb() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
  render();
  await saveCloudDb(db);
}

function normalizeDb(value) {
  return { ...structuredClone(seed), ...value, settings: { ...seed.settings, ...(value.settings || {}) } };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}

async function loadCloudDb() {
  try {
    const rows = await supabaseRequest(`obrastock_state?id=eq.${SUPABASE_STATE_ID}&select=data`);
    if (rows?.[0]?.data) {
      cloudReady = true;
      return rows[0].data;
    }
    await supabaseRequest("obrastock_state", {
      method: "POST",
      body: JSON.stringify({ id: SUPABASE_STATE_ID, data: seed })
    });
    cloudReady = true;
    return structuredClone(seed);
  } catch (error) {
    console.warn("Supabase indisponivel, usando cache local.", error);
    cloudReady = false;
    return null;
  }
}

async function saveCloudDb(value) {
  try {
    await supabaseRequest(`obrastock_state?id=eq.${SUPABASE_STATE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ data: value, updated_at: new Date().toISOString() })
    });
    cloudReady = true;
  } catch (error) {
    console.warn("Falha ao salvar no Supabase.", error);
    cloudReady = false;
    toast("Sem conexão com o banco online. Dados ficaram salvos neste aparelho.");
  }
}

function uid(prefix, counter) {
  const value = db.counters[counter]++;
  return `${prefix}-${String(value).padStart(3, "0")}`;
}

function protocol(type) {
  const prefix = type === "RETIRADA" ? "RET" : "DEV";
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${ymd}-${String(db.counters.protocol++).padStart(5, "0")}`;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function readFileAsDataUrl(input) {
  return new Promise((resolve) => {
    const file = input.files?.[0];
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function canEdit() {
  return currentUser && currentUser.level !== "Visualização";
}

function ensureEdit() {
  if (canEdit()) return true;
  toast("Usuário de visualização não pode alterar registros.");
  return false;
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".main-nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  const titles = {
    dashboard: ["Painel", "Visão geral do almoxarifado e últimas movimentações."],
    employees: ["Funcionários", "Cadastro, busca e situação dos colaboradores."],
    inventory: ["Materiais", "Estoque, ferramentas, EPIs e localização física."],
    withdraw: ["Retirada", "Registre múltiplos itens no mesmo comprovante."],
    return: ["Devolução", "Confira o que está em posse do funcionário."],
    history: ["Histórico", "Movimentações completas com filtros e protocolos."],
    reports: ["Relatórios", "Indicadores para impressão, PDF e Excel."],
    settings: ["Acessos", "Usuários, senhas e níveis de permissão."]
  };
  $("viewTitle").textContent = titles[view][0];
  $("viewSubtitle").textContent = titles[view][1];
  render();
}

async function initAuth() {
  db = await loadDb();
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  currentUser = db.users.find((u) => u.id === sessionId) || null;
  if (currentUser) showApp();
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("currentUserLabel").textContent = `${currentUser.name} - ${currentUser.level}${cloudReady ? " - online" : " - local"}`;
  document.body.classList.toggle("dark", !!db.settings.dark);
  render();
}

function render() {
  if (!currentUser) return;
  renderSelects();
  renderDashboard();
  renderEmployees();
  renderItems();
  renderWithdrawCart();
  renderReturnItems();
  renderHistory();
  renderReports();
  renderUsers();
}

function renderDashboard() {
  const borrowed = openLoans();
  const low = db.items.filter((item) => item.stock <= (item.minStock ?? 2));
  $("metricItems").textContent = db.items.length;
  $("metricBorrowed").textContent = borrowed.reduce((sum, loan) => sum + loan.qty, 0);
  $("metricLate").textContent = borrowed.filter((loan) => daysSince(loan.date) > 7).length;
  $("metricLow").textContent = low.length;
  $("recentMovements").innerHTML = db.movements.slice(-8).reverse().map((m) => `
    <div class="activity">
      <strong>${m.type === "RETIRADA" ? "Retirada" : "Devolução"} ${escapeHtml(m.protocol)}</strong>
      <span>${escapeHtml(m.employeeName)} - ${formatDate(m.date)} - ${escapeHtml(m.userName)}</span>
    </div>`).join("") || empty("Nenhuma movimentação registrada.");
  $("lowStockList").innerHTML = low.map((item) => `
    <div class="compact-row"><strong>${escapeHtml(item.name)}</strong><span>${item.stock} ${escapeHtml(item.unit)} em ${escapeHtml(item.location || "sem local")}</span></div>
  `).join("") || empty("Sem alerta de estoque baixo.");
  renderCategoryChart();
}

function renderCategoryChart() {
  const totals = {};
  db.movements.filter((m) => m.type === "RETIRADA").flatMap((m) => m.items).forEach((it) => {
    totals[it.category] = (totals[it.category] || 0) + num(it.qty);
  });
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  $("categoryChart").innerHTML = rows.map(([name, value]) => `
    <div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></div></div><b>${value}</b></div>
  `).join("") || empty("O gráfico aparecerá após as primeiras retiradas.");
}

function renderEmployees() {
  const term = $("employeeSearch").value?.toLowerCase() || "";
  const employees = db.employees.filter((e) => `${e.name} ${e.cpf} ${e.role} ${e.team}`.toLowerCase().includes(term));
  $("employeeList").innerHTML = employees.map((e) => `
    <article class="person-card">
      <header>
        ${e.photo ? `<img class="avatar" src="${e.photo}" alt="">` : `<div class="avatar">${initials(e.name)}</div>`}
        <div><h4>${escapeHtml(e.name)}</h4><div class="meta">${escapeHtml(e.id)} - CPF ${escapeHtml(e.cpf)}</div></div>
      </header>
      <div class="meta">${escapeHtml(e.role || "Sem cargo")} - ${escapeHtml(e.team || "Sem equipe")} - ${escapeHtml(e.phone || "Sem telefone")}</div>
      <div><span class="tag ${e.status === "Ativo" ? "ok" : "bad"}">${escapeHtml(e.status)}</span></div>
      <div class="row-actions"><button class="secondary" onclick="editEmployee('${e.id}')">Editar</button><button class="ghost" onclick="employeeHistory('${e.id}')">Histórico</button></div>
    </article>
  `).join("") || empty("Nenhum funcionário encontrado.");
}

function renderItems() {
  const term = $("itemSearch").value?.toLowerCase() || "";
  const items = db.items.filter((i) => `${i.name} ${i.code} ${i.category} ${i.location}`.toLowerCase().includes(term));
  $("itemList").innerHTML = `<table>
    <thead><tr><th>Item</th><th>Código</th><th>Categoria</th><th>Estoque</th><th>Estado</th><th>Valor</th><th>Local</th><th>Ações</th></tr></thead>
    <tbody>${items.map((i) => `
      <tr>
        <td><strong>${escapeHtml(i.name)}</strong><div class="meta">${escapeHtml(i.id)}</div></td>
        <td>${escapeHtml(i.code)}</td>
        <td>${escapeHtml(i.category)}</td>
        <td><span class="tag ${i.stock <= (i.minStock ?? 2) ? "warn" : "ok"}">${i.stock} ${escapeHtml(i.unit)}</span></td>
        <td>${escapeHtml(i.condition)}</td>
        <td>${money.format(num(i.value))}</td>
        <td>${escapeHtml(i.location || "-")}</td>
        <td><div class="row-actions"><button class="secondary" onclick="editItem('${i.id}')">Editar</button><button class="ghost" onclick="findByCode('${i.code}')">Abrir</button></div></td>
      </tr>`).join("")}</tbody>
  </table>`;
}

function renderSelects() {
  const activeEmployees = db.employees.filter((e) => e.status === "Ativo");
  const employeeOptions = activeEmployees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} - ${escapeHtml(e.cpf)}</option>`).join("");
  $("withdrawEmployee").innerHTML = employeeOptions;
  $("returnEmployee").innerHTML = employeeOptions;
  $("withdrawItem").innerHTML = db.items.filter((i) => i.stock > 0).map((i) => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.code)}) - ${i.stock} ${escapeHtml(i.unit)}</option>`).join("");
}

function renderWithdrawCart() {
  $("withdrawCart").innerHTML = withdrawCart.map((row, index) => `
    <div class="cart-row">
      <div><strong>${escapeHtml(row.name)}</strong><div class="meta">${escapeHtml(row.code)} - ${row.qty} ${escapeHtml(row.unit)}</div></div>
      <button class="ghost danger" onclick="removeCartItem(${index})">Remover</button>
    </div>
  `).join("") || empty("Adicione os itens que sairão no mesmo protocolo.");
}

function renderReturnItems() {
  const employeeId = $("returnEmployee").value;
  const loans = employeeId ? openLoans(employeeId) : [];
  $("returnItems").innerHTML = loans.map((loan) => `
    <div class="return-row" data-loan="${loan.key}">
      <div><strong>${escapeHtml(loan.name)}</strong><div class="meta">${loan.openQty} ${escapeHtml(loan.unit)} pendente - protocolo ${escapeHtml(loan.protocol)}</div></div>
      <span class="tag warn">Em posse</span>
      <div class="controls">
        <label>Qtd. devolvida<input class="return-qty" type="number" min="0" max="${loan.openQty}" step="0.01" value="${loan.openQty}"></label>
        <label>Observação<input class="return-note" placeholder="Condição na devolução"></label>
        <label>Estado<select class="return-state"><option>Devolvido</option><option>Avariado</option><option>Perdido</option></select></label>
      </div>
    </div>
  `).join("") || empty("Nenhum item em posse deste funcionário.");
}

function renderHistory() {
  const search = $("historySearch").value?.toLowerCase() || "";
  const date = $("historyDate").value;
  const type = $("historyType").value;
  const onlyOpen = $("onlyOpen").checked;
  let rows = db.movements.slice().reverse();
  rows = rows.filter((m) => !type || m.type === type);
  rows = rows.filter((m) => !date || m.date.slice(0, 10) === date);
  rows = rows.filter((m) => `${m.protocol} ${m.employeeName} ${m.userName} ${m.items.map((i) => `${i.name} ${i.code}`).join(" ")}`.toLowerCase().includes(search));
  if (onlyOpen) {
    const openKeys = new Set(openLoans().map((l) => l.withdrawId));
    rows = rows.filter((m) => openKeys.has(m.id));
  }
  $("historyTable").innerHTML = `<table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Protocolo</th><th>Funcionário</th><th>Itens</th><th>Usuário</th><th>Ações</th></tr></thead>
    <tbody>${rows.map((m) => `
      <tr>
        <td>${formatDate(m.date)}</td><td>${m.type}</td><td><strong>${escapeHtml(m.protocol)}</strong></td>
        <td>${escapeHtml(m.employeeName)}<div class="meta">${escapeHtml(m.employeeCpf)}</div></td>
        <td>${m.items.map((i) => `${escapeHtml(i.name)} (${i.qty} ${escapeHtml(i.unit)})`).join("<br>")}</td>
        <td>${escapeHtml(m.userName)}</td>
        <td><button class="secondary" onclick="printMovement('${m.id}')">Imprimir</button></td>
      </tr>`).join("")}</tbody>
  </table>`;
}

function renderReports() {
  const loans = openLoans();
  const damaged = db.movements.flatMap((m) => m.items.filter((i) => ["Avariado", "Perdido"].includes(i.returnState || i.condition || "")));
  const popular = {};
  db.movements.filter((m) => m.type === "RETIRADA").flatMap((m) => m.items).forEach((i) => popular[i.name] = (popular[i.name] || 0) + num(i.qty));
  const popularRows = Object.entries(popular).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("reportsContent").innerHTML = `
    <article class="report-card"><h4>Ferramentas em posse</h4><strong>${loans.length}</strong><div class="meta">${loans.map((l) => `${escapeHtml(l.employeeName)}: ${escapeHtml(l.name)} (${l.openQty})`).join("<br>") || "Sem pendências"}</div></article>
    <article class="report-card"><h4>Materiais mais retirados</h4><div class="meta">${popularRows.map(([name, total]) => `${escapeHtml(name)}: ${total}`).join("<br>") || "Sem retiradas"}</div></article>
    <article class="report-card"><h4>Itens avariados/perdidos</h4><strong>${damaged.length}</strong><div class="meta">${damaged.map((i) => `${escapeHtml(i.name)} - ${escapeHtml(i.returnState || i.condition)}`).join("<br>") || "Nenhum registro"}</div></article>
    <article class="report-card"><h4>Valor estimado em estoque</h4><strong>${money.format(db.items.reduce((s, i) => s + num(i.value) * num(i.stock), 0))}</strong><div class="meta">Baseado no valor estimado cadastrado.</div></article>
  `;
}

function renderUsers() {
  $("userList").innerHTML = db.users.map((u) => `
    <article class="person-card">
      <h4>${escapeHtml(u.name)}</h4>
      <div class="meta">${escapeHtml(u.id)} - login ${escapeHtml(u.login)}</div>
      <span class="tag">${escapeHtml(u.level)}</span>
      <div class="row-actions"><button class="secondary" onclick="editUser('${u.id}')">Editar</button></div>
    </article>
  `).join("");
}

function empty(text) {
  return `<div class="compact-row"><span>${escapeHtml(text)}</span></div>`;
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function openLoans(employeeId = "") {
  const loans = new Map();
  db.movements.forEach((m) => {
    if (employeeId && m.employeeId !== employeeId) return;
    if (m.type === "RETIRADA") {
      m.items.forEach((i) => {
        const key = `${m.id}:${i.itemId}`;
        loans.set(key, { ...i, key, withdrawId: m.id, movementItemKey: key, protocol: m.protocol, date: m.date, employeeId: m.employeeId, employeeName: m.employeeName, employeeCpf: m.employeeCpf, openQty: num(i.qty) });
      });
    } else {
      m.items.forEach((i) => {
        const key = i.loanKey || `${i.withdrawId}:${i.itemId}`;
        const loan = loans.get(key);
        if (loan) {
          loan.openQty = Math.max(0, num(loan.openQty) - num(i.qty));
          if (loan.openQty <= 0) loans.delete(key);
        }
      });
    }
  });
  return [...loans.values()];
}

function addWithdrawItem() {
  if (!ensureEdit()) return;
  const item = db.items.find((i) => i.id === $("withdrawItem").value);
  const qty = num($("withdrawQty").value);
  if (!item || qty <= 0) return toast("Informe item e quantidade válidos.");
  const already = withdrawCart.filter((i) => i.itemId === item.id).reduce((s, i) => s + num(i.qty), 0);
  if (qty + already > item.stock) return toast("Quantidade maior que o estoque disponível.");
  withdrawCart.push({ itemId: item.id, name: item.name, code: item.code, category: item.category, qty, unit: item.unit, condition: item.condition, value: item.value });
  $("withdrawQty").value = 1;
  renderWithdrawCart();
}

window.removeCartItem = (index) => {
  withdrawCart.splice(index, 1);
  renderWithdrawCart();
};

function registerWithdraw(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  if (!withdrawCart.length) return toast("Adicione pelo menos um item.");
  const employee = db.employees.find((e) => e.id === $("withdrawEmployee").value);
  const keeper = $("withdrawKeeper").value.trim();
  const movement = {
    id: crypto.randomUUID(),
    type: "RETIRADA",
    protocol: protocol("RETIRADA"),
    date: nowIso(),
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCpf: employee.cpf,
    keeper,
    userId: currentUser.id,
    userName: currentUser.name,
    notes: $("withdrawNotes").value.trim(),
    items: withdrawCart.map((i) => ({ ...i, status: "EM POSSE DO FUNCIONARIO" }))
  };
  movement.items.forEach((row) => {
    const item = db.items.find((i) => i.id === row.itemId);
    item.stock = roundQty(num(item.stock) - num(row.qty));
  });
  db.movements.push(movement);
  withdrawCart = [];
  $("withdrawNotes").value = "";
  saveDb();
  printMovement(movement.id);
  toast("Retirada registrada com baixa de estoque.");
}

function registerReturn(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const employee = db.employees.find((e) => e.id === $("returnEmployee").value);
  const selected = [...document.querySelectorAll(".return-row")].map((row) => {
    const loan = openLoans(employee.id).find((l) => l.key === row.dataset.loan);
    const qty = num(row.querySelector(".return-qty").value);
    const state = row.querySelector(".return-state").value;
    const note = row.querySelector(".return-note").value.trim();
    return { loan, qty, state, note };
  }).filter((r) => r.loan && r.qty > 0);
  if (!selected.length) return toast("Informe pelo menos uma devolução.");
  const movement = {
    id: crypto.randomUUID(),
    type: "DEVOLUCAO",
    protocol: protocol("DEVOLUCAO"),
    date: nowIso(),
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCpf: employee.cpf,
    keeper: $("returnKeeper").value.trim(),
    userId: currentUser.id,
    userName: currentUser.name,
    notes: $("returnNotes").value.trim(),
    items: selected.map(({ loan, qty, state, note }) => ({
      itemId: loan.itemId, name: loan.name, code: loan.code, category: loan.category, qty: Math.min(qty, loan.openQty), unit: loan.unit,
      condition: loan.condition, returnState: state, notes: note, loanKey: loan.key, withdrawId: loan.withdrawId,
      status: state === "Devolvido" ? "DEVOLVIDO" : state.toUpperCase()
    }))
  };
  movement.items.forEach((row) => {
    const item = db.items.find((i) => i.id === row.itemId);
    if (row.returnState !== "Perdido") item.stock = roundQty(num(item.stock) + num(row.qty));
    if (row.returnState === "Avariado") item.condition = "Avariado";
  });
  db.movements.push(movement);
  $("returnNotes").value = "";
  saveDb();
  printMovement(movement.id);
  toast("Devolução registrada com atualização de estoque.");
}

function roundQty(value) {
  return Math.round(value * 100) / 100;
}

function receiptHtml(movement) {
  const typeTitle = movement.type === "RETIRADA" ? "ORDEM DE RETIRADA" : "COMPROVANTE DE DEVOLUCAO";
  const items = movement.items.map((i) => `
    <tr><td>${escapeHtml(i.code)}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.category)}</td><td>${i.qty} ${escapeHtml(i.unit)}</td><td>${escapeHtml(i.status || i.returnState || i.condition)}</td><td>${escapeHtml(i.notes || "")}</td></tr>
  `).join("");
  return `<section class="receipt-page">
    <div class="receipt-head">
      <div><h1>ObraStock</h1><strong>${typeTitle}</strong><br><span>Controle de almoxarifado e responsabilidade</span></div>
      <div class="receipt-meta"><strong>Protocolo</strong><br>${escapeHtml(movement.protocol)}<br><br><strong>Data e hora</strong><br>${formatDate(movement.date)}</div>
    </div>
    <div class="receipt-grid">
      <div class="receipt-box"><strong>Funcionario</strong><br>${escapeHtml(movement.employeeName)}<br>CPF: ${escapeHtml(movement.employeeCpf)}</div>
      <div class="receipt-box"><strong>Almoxarifado</strong><br>Responsavel: ${escapeHtml(movement.keeper || "-")}<br>Usuario: ${escapeHtml(movement.userName)}</div>
    </div>
    <table>
      <thead><tr><th>Codigo</th><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Status/estado</th><th>Obs.</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div class="receipt-box" style="margin-top:14px;"><strong>Observacoes</strong><br>${escapeHtml(movement.notes || "Sem observacoes.")}</div>
    <p style="font-size:12px;margin-top:18px;">Declaro estar ciente da responsabilidade pelos materiais e ferramentas descritos neste comprovante, incluindo devolucao, conservacao e comunicacao imediata de avarias ou perdas.</p>
    <div class="signature-grid">
      <div class="signature">Assinatura do funcionario</div>
      <div class="signature">Assinatura do almoxarife</div>
    </div>
    <div style="margin-top:24px;border:1px solid #111;width:92px;height:92px;display:grid;place-items:center;font-size:10px;text-align:center;">${escapeHtml(movement.protocol)}</div>
  </section>`;
}

window.printMovement = (id) => {
  const movement = db.movements.find((m) => m.id === id);
  if (!movement) return;
  $("printArea").innerHTML = receiptHtml(movement);
  setTimeout(() => window.print(), 80);
};

function printReport() {
  $("printArea").innerHTML = `<section class="receipt-page"><div class="receipt-head"><div><h1>ObraStock</h1><strong>RELATORIO GERAL</strong></div><div class="receipt-meta">${formatDate(nowIso())}</div></div>${$("reportsContent").innerHTML}</section>`;
  setTimeout(() => window.print(), 80);
}

function exportExcel() {
  const header = ["Data", "Tipo", "Protocolo", "Funcionario", "CPF", "Item", "Codigo", "Categoria", "Quantidade", "Unidade", "Status", "Responsavel", "Usuario"];
  const rows = db.movements.flatMap((m) => m.items.map((i) => [formatDate(m.date), m.type, m.protocol, m.employeeName, m.employeeCpf, i.name, i.code, i.category, i.qty, i.unit, i.status || i.returnState || i.condition, m.keeper, m.userName]));
  download(`relatorio-obrastock-${Date.now()}.csv`, [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n"), "text/csv;charset=utf-8");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function saveEmployee(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const id = $("employeeId").value || uid("FUN", "employee");
  const existing = db.employees.find((e) => e.id === id);
  const photo = await readFileAsDataUrl($("employeePhoto"));
  const record = { id, name: $("employeeName").value.trim(), cpf: $("employeeCpf").value.trim(), role: $("employeeRole").value.trim(), phone: $("employeePhone").value.trim(), team: $("employeeTeam").value.trim(), status: $("employeeStatus").value, photo: photo || existing?.photo || "" };
  if (existing) Object.assign(existing, record); else db.employees.push(record);
  $("employeeDialog").close();
  $("employeeForm").reset();
  saveDb();
}

async function saveItem(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const id = $("itemId").value || uid("MAT", "item");
  const existing = db.items.find((i) => i.id === id);
  const photo = await readFileAsDataUrl($("itemPhoto"));
  const record = { id, name: $("itemName").value.trim(), code: $("itemCode").value.trim(), category: $("itemCategory").value.trim(), stock: num($("itemStock").value), unit: $("itemUnit").value.trim(), condition: $("itemCondition").value, value: num($("itemValue").value), location: $("itemLocation").value.trim(), photo: photo || existing?.photo || "", minStock: existing?.minStock ?? 2 };
  if (existing) Object.assign(existing, record); else db.items.push(record);
  $("itemDialog").close();
  $("itemForm").reset();
  saveDb();
}

function saveUser(event) {
  event.preventDefault();
  if (!ensureEdit() || currentUser.level !== "Administrador") return toast("Apenas administrador altera usuários.");
  const id = $("userId").value || uid("USR", "user");
  const existing = db.users.find((u) => u.id === id);
  const record = { id, name: $("userName").value.trim(), login: $("userLogin").value.trim(), pass: $("userPass").value, level: $("userLevel").value };
  if (existing) Object.assign(existing, record); else db.users.push(record);
  $("userDialog").close();
  $("userForm").reset();
  saveDb();
}

window.editEmployee = (id) => {
  const e = db.employees.find((x) => x.id === id);
  if (!e) return;
  $("employeeId").value = e.id; $("employeeName").value = e.name; $("employeeCpf").value = e.cpf; $("employeeRole").value = e.role; $("employeePhone").value = e.phone; $("employeeTeam").value = e.team; $("employeeStatus").value = e.status;
  $("employeeDialog").showModal();
};

window.editItem = (id) => {
  const i = db.items.find((x) => x.id === id);
  if (!i) return;
  $("itemId").value = i.id; $("itemName").value = i.name; $("itemCode").value = i.code; $("itemCategory").value = i.category; $("itemStock").value = i.stock; $("itemUnit").value = i.unit; $("itemCondition").value = i.condition; $("itemValue").value = i.value; $("itemLocation").value = i.location;
  $("itemDialog").showModal();
};

window.editUser = (id) => {
  const u = db.users.find((x) => x.id === id);
  if (!u) return;
  $("userId").value = u.id; $("userName").value = u.name; $("userLogin").value = u.login; $("userPass").value = u.pass; $("userLevel").value = u.level;
  $("userDialog").showModal();
};

window.employeeHistory = (id) => {
  const e = db.employees.find((x) => x.id === id);
  $("historySearch").value = e?.name || "";
  setView("history");
};

window.findByCode = (code) => {
  $("itemSearch").value = code;
  setView("inventory");
};

async function startScan() {
  $("scanDialog").showModal();
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) return toast("Leitor automático indisponível. Digite o código.");
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("scanVideo").srcObject = scanStream;
    await $("scanVideo").play();
    const detector = new BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] });
    const tick = async () => {
      if (!$("scanDialog").open) return;
      const codes = await detector.detect($("scanVideo")).catch(() => []);
      if (codes[0]) {
        findByCode(codes[0].rawValue);
        stopScan();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  } catch {
    toast("Camera indisponível. Use a digitação manual.");
  }
}

function stopScan() {
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = null;
  $("scanDialog").close();
}

function backup() {
  download(`backup-obrastock-${Date.now()}.json`, JSON.stringify(db, null, 2), "application/json");
}

function restore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      db = JSON.parse(reader.result);
      saveDb();
      toast("Backup restaurado.");
    } catch {
      toast("Arquivo de backup inválido.");
    }
  };
  reader.readAsText(file);
}

function wire() {
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = db.users.find((u) => u.login === $("loginUser").value.trim() && u.pass === $("loginPass").value);
    if (!user) return toast("Usuário ou senha inválidos.");
    currentUser = user;
    sessionStorage.setItem(SESSION_KEY, user.id);
    showApp();
  });
  $("logoutBtn").addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); location.reload(); });
  document.querySelectorAll(".main-nav button").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $("quickWithdrawBtn").addEventListener("click", () => setView("withdraw"));
  $("themeToggle").addEventListener("click", () => { db.settings.dark = !db.settings.dark; document.body.classList.toggle("dark", db.settings.dark); saveDb(); });
  $("backupBtn").addEventListener("click", backup);
  $("restoreInput").addEventListener("change", restore);
  $("employeeSearch").addEventListener("input", renderEmployees);
  $("itemSearch").addEventListener("input", renderItems);
  $("historySearch").addEventListener("input", renderHistory);
  $("historyDate").addEventListener("change", renderHistory);
  $("historyType").addEventListener("change", renderHistory);
  $("onlyOpen").addEventListener("change", renderHistory);
  $("returnEmployee").addEventListener("change", renderReturnItems);
  $("newEmployeeBtn").addEventListener("click", () => { if (ensureEdit()) { $("employeeForm").reset(); $("employeeId").value = ""; $("employeeDialog").showModal(); } });
  $("newItemBtn").addEventListener("click", () => { if (ensureEdit()) { $("itemForm").reset(); $("itemId").value = ""; $("itemDialog").showModal(); } });
  $("newUserBtn").addEventListener("click", () => { if (ensureEdit()) { $("userForm").reset(); $("userId").value = ""; $("userDialog").showModal(); } });
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => btn.closest("dialog").close()));
  $("employeeForm").addEventListener("submit", saveEmployee);
  $("itemForm").addEventListener("submit", saveItem);
  $("userForm").addEventListener("submit", saveUser);
  $("addWithdrawItem").addEventListener("click", addWithdrawItem);
  $("withdrawForm").addEventListener("submit", registerWithdraw);
  $("returnForm").addEventListener("submit", registerReturn);
  $("printReportBtn").addEventListener("click", printReport);
  $("exportExcelBtn").addEventListener("click", exportExcel);
  $("scanBtn").addEventListener("click", startScan);
  $("stopScanBtn").addEventListener("click", stopScan);
  $("useManualCode").addEventListener("click", () => { findByCode($("manualCode").value); stopScan(); });
}

wire();
initAuth();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
