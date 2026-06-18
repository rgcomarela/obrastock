const STORE_KEY = "obrastock.v2";
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
    { id: "FUN-001", name: "Carlos Henrique Souza", role: "Eletricista", phone: "(11) 99999-0101", team: "Equipe elétrica", status: "Ativo", photo: "" },
    { id: "FUN-002", name: "Mariana Lima Costa", role: "Técnica de segurança", phone: "(11) 98888-0202", team: "SST", status: "Ativo", photo: "" },
    { id: "FUN-003", name: "João Pedro Alves", role: "Encanador", phone: "(11) 97777-0303", team: "Hidráulica", status: "Ativo", photo: "" }
  ],
  items: [
    { id: "MAT-001", name: "Furadeira de impacto Bosch", code: "FER-001", category: "Ferramenta", stock: 4, unit: "unidade", condition: "Usado", status: "Disponível", notes: "Com maleta", photo: "", minStock: 1 },
    { id: "MAT-002", name: "Capacete de segurança amarelo", code: "EPI-101", category: "EPI", stock: 35, unit: "unidade", condition: "Novo", status: "Disponível", notes: "", photo: "", minStock: 10 },
    { id: "MAT-003", name: "Cinto NR35", code: "EPI-350", category: "EPI", stock: 8, unit: "unidade", condition: "Normal", status: "Disponível", notes: "Inspecionar mensalmente", photo: "", minStock: 2 },
    { id: "MAT-004", name: "Martelete rompedor", code: "FER-220", category: "Ferramenta", stock: 2, unit: "unidade", condition: "Usado", status: "Disponível", notes: "", photo: "", minStock: 1 }
  ],
  movements: [],
  signatures: [],
  counters: { employee: 4, item: 5, user: 4, protocol: 1, signature: 1 },
  settings: { dark: false, lateDays: 7 }
};

let db = structuredClone(seed);
let currentUser = null;
let activeView = "dashboard";
let cloudReady = false;
let signaturePad = null;
let selectedCustodyEmployeeId = "";
let deliveryCart = [];
let deliveryCartEmployeeId = "";
let pendingDeliveryAfterSignature = false;

const $ = (id) => document.getElementById(id);
const num = (v) => Number.parseFloat(v || 0);
const todayKey = () => new Date().toISOString().slice(0, 10);

function normalizeDb(value = {}) {
  const base = structuredClone(seed);
  const normalized = { ...base, ...value, settings: { ...base.settings, ...(value.settings || {}) } };
  normalized.signatures = value.signatures || [];
  normalized.counters = { ...base.counters, ...(value.counters || {}) };
  normalized.employees = (normalized.employees || []).map((e) => ({
    id: e.id, name: e.name, role: e.role || e.cargo || "", phone: e.phone || "", team: e.team || e.equipe || "", status: e.status || "Ativo", photo: e.photo || ""
  }));
  normalized.items = (normalized.items || []).map((i) => ({
    id: i.id, name: i.name, code: i.code || "", category: i.category || "Ferramenta", stock: num(i.stock ?? i.quantity),
    unit: i.unit || "unidade", condition: i.condition || "Normal", status: i.status || statusFromItem(i), notes: i.notes || i.observations || "",
    photo: i.photo || "", minStock: i.minStock ?? 1
  }));
  return normalized;
}

function statusFromItem(item) {
  if (["Avariado", "Em manutenção"].includes(item.condition)) return item.condition;
  return num(item.stock) > 0 ? "Disponível" : "Emprestado";
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
    await supabaseRequest("obrastock_state", { method: "POST", body: JSON.stringify({ id: SUPABASE_STATE_ID, data: seed }) });
    cloudReady = true;
    return structuredClone(seed);
  } catch (error) {
    console.warn("Supabase indisponível, usando cache local.", error);
    cloudReady = false;
    return null;
  }
}

async function loadDb() {
  const cloud = await loadCloudDb();
  if (cloud) {
    const normalized = normalizeDb(cloud);
    localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  const cached = localStorage.getItem(STORE_KEY) || localStorage.getItem("obrastock.v1");
  return cached ? normalizeDb(JSON.parse(cached)) : structuredClone(seed);
}

async function saveDb() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
  render();
  try {
    await supabaseRequest(`obrastock_state?id=eq.${SUPABASE_STATE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ data: db, updated_at: new Date().toISOString() })
    });
    cloudReady = true;
  } catch (error) {
    cloudReady = false;
    console.warn("Falha ao salvar online.", error);
    toast("Sem conexão online. Salvo neste aparelho.");
  }
}

function uid(prefix, counter) {
  const value = db.counters[counter] || 1;
  db.counters[counter] = value + 1;
  return `${prefix}-${String(value).padStart(3, "0")}`;
}

function protocol(type) {
  const prefix = type === "RETIRADA" ? "ENT" : type === "DEVOLUCAO" ? "DEV" : "ASS";
  const value = db.counters.protocol || 1;
  db.counters.protocol = value + 1;
  return `${prefix}-${todayKey().replaceAll("-", "")}-${String(value).padStart(5, "0")}`;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
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

function canEdit() {
  return currentUser && currentUser.level !== "Visualização";
}

function canManageEmployees() {
  return currentUser && currentUser.level === "Administrador";
}

function ensureEdit() {
  if (canEdit()) return true;
  toast("Usuário de visualização não altera registros.");
  return false;
}

function ensureManageEmployees() {
  if (canManageEmployees()) return true;
  toast("Apenas administrador cadastra ou edita funcionários.");
  return false;
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".main-nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  const titles = {
    dashboard: ["Painel", "Responsabilidade de posse em tempo real."],
    custody: ["Cautelas", "Lista atual de itens sob responsabilidade de cada funcionário."],
    withdraw: ["Entregar", "Retirada rápida em poucos toques."],
    return: ["Devolver", "Baixa rápida da cautela digital."],
    employees: ["Funcionários", "Cadastro simples para equipes de campo."],
    inventory: ["Itens", "Ferramentas, EPIs e materiais disponíveis."],
    history: ["Histórico", "Registro completo de entregas, devoluções e assinaturas."],
    reports: ["Relatórios", "PDF A4 semanal, mensal ou individual sob demanda."],
    settings: ["Acessos", "Usuários e níveis de permissão."]
  };
  $("viewTitle").textContent = titles[view][0];
  $("viewSubtitle").textContent = titles[view][1];
  render();
}

function render() {
  if (!currentUser) return;
  renderSelects();
  renderDashboard();
  renderCustody();
  renderEmployees();
  renderItems();
  renderWithdrawPreview();
  renderDeliveryCart();
  renderReturnItems();
  renderHistory();
  renderReports();
  renderUsers();
}

function activeEmployees() {
  return db.employees.filter((e) => e.status === "Ativo");
}

function employeeById(id) {
  return db.employees.find((e) => e.id === id);
}

function itemById(id) {
  return db.items.find((i) => i.id === id);
}

function dailySignature(employeeId, date = todayKey()) {
  return db.signatures.find((s) => s.employeeId === employeeId && s.date === date);
}

function openLoans(employeeId = "") {
  const loans = new Map();
  db.movements.forEach((m) => {
    if (employeeId && m.employeeId !== employeeId) return;
    if (m.type === "RETIRADA") {
      m.items.forEach((i) => {
        const key = `${m.id}:${i.itemId}`;
        loans.set(key, {
          ...i, key, withdrawId: m.id, protocol: m.protocol, date: m.date, employeeId: m.employeeId,
          employeeName: m.employeeName, openQty: num(i.qty), keeper: m.keeper, signatureId: m.signatureId
        });
      });
    }
    if (m.type === "DEVOLUCAO") {
      m.items.forEach((i) => {
        const loan = loans.get(i.loanKey || `${i.withdrawId}:${i.itemId}`);
        if (!loan) return;
        loan.openQty = Math.max(0, num(loan.openQty) - num(i.qty));
        if (loan.openQty <= 0) loans.delete(loan.key);
      });
    }
  });
  return [...loans.values()];
}

function renderSelects() {
  const employees = activeEmployees();
  const employeeOptions = employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} - ${escapeHtml(e.team || "sem equipe")}</option>`).join("");
  ["withdrawEmployee", "returnEmployee", "reportEmployee"].forEach((id) => {
    const select = $(id);
    const selected = select.value;
    select.innerHTML = employeeOptions;
    if (employees.some((e) => e.id === selected)) select.value = selected;
  });
  $("withdrawItemOptions").innerHTML = db.items
    .filter((i) => num(i.stock) > 0 && !["Avariado", "Em manutenção"].includes(i.status))
    .map((i) => `<option value="${escapeHtml(i.name)}" label="${escapeHtml(i.code || i.id)} - ${i.stock} ${escapeHtml(i.unit)}"></option>`)
    .join("");
}

function renderDashboard() {
  const loans = openLoans();
  const late = loans.filter((l) => daysSince(l.date) > db.settings.lateDays);
  const damaged = db.items.filter((i) => ["Avariado", "Em manutenção"].includes(i.status) || ["Avariado", "Em manutenção"].includes(i.condition));
  const low = db.items.filter((i) => num(i.stock) <= (i.minStock ?? 1));
  const almoxView = currentUser.level === "Almoxarife";
  $("recentPanel").classList.toggle("hidden", almoxView);
  $("usagePanel").classList.toggle("hidden", almoxView);
  $("metricBorrowed").textContent = loans.reduce((sum, l) => sum + num(l.openQty), 0);
  $("metricCustodies").textContent = new Set(loans.map((l) => l.employeeId)).size;
  $("metricLate").textContent = late.length;
  $("metricDamaged").textContent = damaged.length;
  $("recentMovements").innerHTML = db.movements.filter((m) => m.type === "RETIRADA").slice(-8).reverse().map((m) => `
    <div class="activity"><strong>${escapeHtml(m.employeeName)}</strong><span>${m.items.map((i) => escapeHtml(i.name)).join(", ")} - ${formatDate(m.date)}</span></div>
  `).join("") || empty("Nenhum empréstimo registrado.");
  $("lowStockList").innerHTML = low.map((i) => `<div class="compact-row"><strong>${escapeHtml(i.name)}</strong><span>${i.stock} ${escapeHtml(i.unit)} disponíveis</span></div>`).join("") || empty("Sem alerta de estoque baixo.");
  renderUsageChart();
}

function renderUsageChart() {
  const totals = {};
  db.movements.filter((m) => m.type === "RETIRADA").flatMap((m) => m.items).forEach((i) => totals[i.name] = (totals[i.name] || 0) + num(i.qty));
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  $("categoryChart").innerHTML = rows.map(([name, value]) => `
    <div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, value / max * 100)}%"></div></div><b>${value}</b></div>
  `).join("") || empty("O gráfico aparecerá após as primeiras entregas.");
}

function renderCustody() {
  const search = $("custodySearch").value?.toLowerCase() || "";
  const employeesWithLoans = activeEmployees()
    .map((employee) => ({ employee, loans: openLoans(employee.id), signature: dailySignature(employee.id) }))
    .filter((row) => row.loans.length > 0)
    .filter((row) => `${row.employee.name} ${row.employee.team} ${row.employee.role}`.toLowerCase().includes(search));
  const selected = selectedCustodyEmployeeId ? employeesWithLoans.find((row) => row.employee.id === selectedCustodyEmployeeId) : null;
  $("custodyDetail").classList.toggle("hidden", !selected);
  $("custodyDetail").innerHTML = selected ? custodyDetail(selected.employee, selected.loans, selected.signature) : "";
  $("custodyList").innerHTML = employeesWithLoans
    .map((row) => custodyCard(row.employee, row.loans, row.signature))
    .join("") || empty("Nenhuma cautela encontrada.");
}

function custodyCard(employee, loans, signature) {
  return `<article class="custody-card">
    <header>
      ${employee.photo ? `<img class="avatar" src="${employee.photo}" alt="">` : `<div class="avatar">${initials(employee.name)}</div>`}
      <div><h3>${escapeHtml(employee.name)}</h3><span>${escapeHtml(employee.team || "sem equipe")} - ${escapeHtml(employee.role || "sem cargo")}</span></div>
      <div class="custody-count"><strong>${loans.length}</strong><span>itens</span></div>
      <button class="secondary" onclick="selectCustody('${employee.id}')">Abrir</button>
    </header>
    <footer><span class="tag ${signature ? "ok" : "warn"}">${signature ? "Assinatura diária registrada" : "Assinatura diária pendente"}</span></footer>
  </article>`;
}

function custodyDetail(employee, loans, signature) {
  return `<section class="panel custody-open">
    <div class="panel-head">
      <div>
        <h3>${escapeHtml(employee.name)}</h3>
        <div class="meta">${escapeHtml(employee.team || "sem equipe")} - ${escapeHtml(employee.role || "sem cargo")} - ${loans.length} item(ns) em posse</div>
      </div>
      <button class="ghost" onclick="closeCustodyDetail()">Fechar</button>
    </div>
    <div class="row-actions custody-actions">
      <button class="primary" onclick="openSignature('${employee.id}')">${signature ? "Reassinar hoje" : "Assinar hoje"}</button>
      <button class="secondary" onclick="goReturnFromCustody('${employee.id}')">Devolver itens</button>
    </div>
    <div class="custody-items">${loans.map((l) => `
      <div class="custody-item ${daysSince(l.date) > db.settings.lateDays ? "late" : ""}">
        <strong>${escapeHtml(l.name)}</strong>
        <span>${l.openQty} ${escapeHtml(l.unit)} - retirado em ${formatDate(l.date)} - ${daysSince(l.date)} dia(s) em posse</span>
      </div>`).join("")}</div>
  </section>`;
}

window.selectCustody = (employeeId) => {
  selectedCustodyEmployeeId = employeeId;
  $("returnEmployee").value = employeeId;
  renderCustody();
};

window.closeCustodyDetail = () => {
  selectedCustodyEmployeeId = "";
  renderCustody();
};

window.goReturnFromCustody = (employeeId) => {
  $("returnEmployee").value = employeeId;
  setView("return");
};

function renderEmployees() {
  const term = $("employeeSearch").value?.toLowerCase() || "";
  const employees = db.employees.filter((e) => `${e.name} ${e.role} ${e.team}`.toLowerCase().includes(term));
  $("newEmployeeBtn").classList.toggle("hidden", !canManageEmployees());
  $("employeeList").innerHTML = employees.map((e) => `
    <article class="person-card">
      <header>${e.photo ? `<img class="avatar" src="${e.photo}" alt="">` : `<div class="avatar">${initials(e.name)}</div>`}
      <div><h4>${escapeHtml(e.name)}</h4><div class="meta">${escapeHtml(e.id)} - ${escapeHtml(e.team || "Sem equipe")}</div></div></header>
      <div class="meta">${escapeHtml(e.role || "Sem cargo")} - ${escapeHtml(e.phone || "Sem telefone")}</div>
      <span class="tag ${e.status === "Ativo" ? "ok" : "bad"}">${escapeHtml(e.status)}</span>
      <div class="row-actions">${canManageEmployees() ? `<button class="secondary" onclick="editEmployee('${e.id}')">Editar</button><button class="ghost danger" onclick="deleteEmployee('${e.id}')">Excluir</button>` : ""}<button class="ghost" onclick="openEmployeeCustody('${e.id}')">Cautela</button></div>
    </article>`).join("") || empty("Nenhum funcionário encontrado.");
}

function renderItems() {
  const term = $("itemSearch").value?.toLowerCase() || "";
  const items = db.items.filter((i) => `${i.name} ${i.code} ${i.category} ${i.status}`.toLowerCase().includes(term));
  $("itemList").innerHTML = `<table><thead><tr><th>Item</th><th>Código</th><th>Categoria</th><th>Qtd.</th><th>Estado</th><th>Status</th><th>Obs.</th><th>Ações</th></tr></thead><tbody>
    ${items.map((i) => `<tr>
      <td><strong>${escapeHtml(i.name)}</strong><div class="meta">${escapeHtml(i.id)}</div></td>
      <td>${escapeHtml(i.code || "-")}</td><td>${escapeHtml(i.category)}</td><td>${i.stock} ${escapeHtml(i.unit)}</td>
      <td>${escapeHtml(i.condition)}</td><td><span class="tag ${tagClass(i.status)}">${escapeHtml(i.status)}</span></td>
      <td>${escapeHtml(i.notes || "-")}</td><td><button class="secondary" onclick="editItem('${i.id}')">Editar</button></td>
    </tr>`).join("")}</tbody></table>`;
}

function renderWithdrawPreview() {
  const employeeId = $("withdrawEmployee").value;
  const employee = employeeById(employeeId);
  const signature = employeeId ? dailySignature(employeeId) : null;
  const loans = employeeId ? openLoans(employeeId) : [];
  $("withdrawSignatureStatus").innerHTML = employee ? `
    <div class="compact-row"><strong>${escapeHtml(employee.name)}</strong><span>${signature ? "Assinatura de hoje já registrada." : "Assinatura de hoje pendente. A entrega pode ser vinculada depois da assinatura."}</span></div>
  ` : empty("Selecione um funcionário.");
  const item = findItemBySearch($("withdrawSearch").value);
  const repeated = item ? loans.find((loan) => loan.itemId === item.id) : null;
  $("withdrawItemPreview").innerHTML = item ? `
    <div class="compact-row ${repeated ? "attention-row" : ""}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${item.stock} ${escapeHtml(item.unit)} disponíveis - ${escapeHtml(item.status)}${repeated ? ` - já está com ${repeated.openQty} ${escapeHtml(repeated.unit)}` : ""}</span>
    </div>
  ` : empty("Pesquise um item pelo nome.");
  $("withdrawCurrentLoans").innerHTML = loans.map((loan) => `
    <div class="compact-row ${item && loan.itemId === item.id ? "attention-row" : ""}">
      <strong>${escapeHtml(loan.name)}</strong>
      <span>${loan.openQty} ${escapeHtml(loan.unit)} - desde ${formatDate(loan.date)} - ${daysSince(loan.date)} dia(s)</span>
    </div>
  `).join("") || empty("Este funcionário não tem itens em posse.");
}

function renderDeliveryCart() {
  const employee = employeeById(deliveryCartEmployeeId || $("withdrawEmployee").value);
  $("withdrawPendingList").innerHTML = deliveryCart.map((row, index) => `
    <div class="compact-row delivery-row">
      <strong>${escapeHtml(row.name)}</strong>
      <span>${row.qty} ${escapeHtml(row.unit)} para ${escapeHtml(employee?.name || "funcionário selecionado")}</span>
      <button class="ghost danger mini-button" onclick="removeDeliveryItem(${index})" type="button">Remover</button>
    </div>
  `).join("") || empty("Nenhum item adicionado nesta entrega.");
  $("finishWithdrawBtn").disabled = deliveryCart.length === 0;
}

function renderReturnItems() {
  const employeeId = $("returnEmployee").value;
  const loans = employeeId ? openLoans(employeeId) : [];
  $("returnItems").innerHTML = loans.map((loan) => `
    <div class="return-row" data-loan="${loan.key}">
      <div><strong>${escapeHtml(loan.name)}</strong><div class="meta">${loan.openQty} ${escapeHtml(loan.unit)} - ${daysSince(loan.date)} dia(s) em posse</div></div>
      <label class="check"><input class="return-check" type="checkbox" checked> devolver</label>
      <div class="controls">
        <label>Qtd.<input class="return-qty" type="number" min="0" max="${loan.openQty}" step="0.01" value="${loan.openQty}"></label>
        <label>Estado<select class="return-state"><option>Normal</option><option>Avariado</option><option>Faltando peça</option><option>Quebrado</option></select></label>
        <label>Observação<input class="return-note" placeholder="Detalhe da devolução"></label>
      </div>
    </div>`).join("") || empty("Nenhum item em posse deste funcionário.");
}

function renderHistory() {
  const search = $("historySearch").value?.toLowerCase() || "";
  const date = $("historyDate").value;
  const type = $("historyType").value;
  let rows = db.movements.slice().reverse();
  if (type) rows = rows.filter((m) => m.type === type);
  if (date) rows = rows.filter((m) => m.date.slice(0, 10) === date);
  if ($("onlyOpen").checked) {
    const ids = new Set(openLoans().map((l) => l.withdrawId));
    rows = rows.filter((m) => ids.has(m.id));
  }
  rows = rows.filter((m) => `${m.protocol} ${m.employeeName} ${m.userName} ${m.items?.map((i) => i.name).join(" ") || ""}`.toLowerCase().includes(search));
  $("historyTable").innerHTML = `<table><thead><tr><th>Data</th><th>Tipo</th><th>Protocolo</th><th>Funcionário</th><th>Itens</th><th>Usuário</th></tr></thead><tbody>
    ${rows.map((m) => `<tr><td>${formatDate(m.date)}</td><td>${labelType(m.type)}</td><td><strong>${escapeHtml(m.protocol)}</strong></td><td>${escapeHtml(m.employeeName || "-")}</td><td>${(m.items || []).map((i) => `${escapeHtml(i.name)} (${i.qty} ${escapeHtml(i.unit || "")})`).join("<br>") || "Assinatura diária"}</td><td>${escapeHtml(m.userName || "-")}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderReports() {
  const loans = openLoans();
  const damaged = db.items.filter((i) => ["Avariado", "Em manutenção"].includes(i.status) || ["Avariado", "Quebrado"].includes(i.condition));
  const popular = {};
  db.movements.filter((m) => m.type === "RETIRADA").flatMap((m) => m.items).forEach((i) => popular[i.name] = (popular[i.name] || 0) + num(i.qty));
  const popularRows = Object.entries(popular).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("reportsContent").innerHTML = `
    <article class="report-card"><h4>Itens sob responsabilidade</h4><strong>${loans.length}</strong><div class="meta">${loans.map((l) => `${escapeHtml(l.employeeName)}: ${escapeHtml(l.name)} (${l.openQty})`).join("<br>") || "Sem cautelas abertas"}</div></article>
    <article class="report-card"><h4>Mais utilizados</h4><div class="meta">${popularRows.map(([name, total]) => `${escapeHtml(name)}: ${total}`).join("<br>") || "Sem movimentações"}</div></article>
    <article class="report-card"><h4>Avariados/manutenção</h4><strong>${damaged.length}</strong><div class="meta">${damaged.map((i) => `${escapeHtml(i.name)} - ${escapeHtml(i.status)}`).join("<br>") || "Nenhum registro"}</div></article>
    <article class="report-card"><h4>Assinaturas do dia</h4><strong>${db.signatures.filter((s) => s.date === todayKey()).length}</strong><div class="meta">Funcionários que assinaram a cautela diária.</div></article>`;
}

function renderUsers() {
  $("userList").innerHTML = db.users.map((u) => `
    <article class="person-card"><h4>${escapeHtml(u.name)}</h4><div class="meta">${escapeHtml(u.id)} - ${escapeHtml(u.login)}</div><span class="tag">${escapeHtml(u.level)}</span><div class="row-actions"><button class="secondary" onclick="editUser('${u.id}')">Editar</button></div></article>
  `).join("");
}

function empty(text) {
  return `<div class="compact-row"><span>${escapeHtml(text)}</span></div>`;
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function tagClass(status) {
  if (status === "Disponível") return "ok";
  if (status === "Emprestado") return "warn";
  if (status === "Avariado" || status === "Em manutenção") return "bad";
  return "";
}

function labelType(type) {
  return ({ RETIRADA: "Entrega", DEVOLUCAO: "Devolução", ASSINATURA: "Assinatura" })[type] || type;
}

function findItemBySearch(value) {
  const term = String(value || "").trim().toLowerCase();
  if (!term) return null;
  return db.items.find((i) => i.name.toLowerCase() === term || i.code.toLowerCase() === term) ||
    db.items.find((i) => `${i.name} ${i.code}`.toLowerCase().includes(term));
}

function addDeliveryItem(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const employee = employeeById($("withdrawEmployee").value);
  const item = findItemBySearch($("withdrawSearch").value);
  const qty = num($("withdrawQty").value);
  if (!employee || !item || qty <= 0) return toast("Informe funcionário, item e quantidade.");
  if (deliveryCartEmployeeId && deliveryCartEmployeeId !== employee.id) {
    return toast("Finalize ou limpe a entrega atual antes de trocar o funcionário.");
  }
  const alreadyInCart = deliveryCart.filter((row) => row.itemId === item.id).reduce((sum, row) => sum + num(row.qty), 0);
  if (qty + alreadyInCart > num(item.stock)) return toast("Quantidade maior que o disponível.");
  if (["Avariado", "Em manutenção"].includes(item.status)) return toast("Item indisponível.");
  deliveryCartEmployeeId = employee.id;
  deliveryCart.push({ itemId: item.id, name: item.name, code: item.code, category: item.category, qty, unit: item.unit, condition: item.condition, status: "EM POSSE" });
  $("withdrawSearch").value = "";
  $("withdrawQty").value = 1;
  renderWithdrawPreview();
  renderDeliveryCart();
  toast("Item adicionado à lista de entrega.");
}

window.removeDeliveryItem = (index) => {
  deliveryCart.splice(index, 1);
  if (!deliveryCart.length) deliveryCartEmployeeId = "";
  renderDeliveryCart();
};

function finalizeDelivery() {
  if (!ensureEdit()) return;
  if (!deliveryCart.length) return toast("Adicione pelo menos um item.");
  const employee = employeeById(deliveryCartEmployeeId);
  if (!employee) return toast("Funcionário da entrega não encontrado.");
  pendingDeliveryAfterSignature = true;
  openSignature(employee.id);
}

function completeDeliveryAfterSignature(signature) {
  const employee = employeeById(deliveryCartEmployeeId);
  if (!employee || !deliveryCart.length) return false;
  const movement = {
    id: crypto.randomUUID(), type: "RETIRADA", protocol: protocol("RETIRADA"), date: new Date().toISOString(),
    employeeId: employee.id, employeeName: employee.name, keeper: $("withdrawKeeper").value.trim(),
    userId: currentUser.id, userName: currentUser.name, notes: $("withdrawNotes").value.trim(), signatureId: signature.id,
    items: deliveryCart.map((row) => ({ ...row }))
  };
  movement.items.forEach((row) => {
    const item = itemById(row.itemId);
    if (!item) return;
    item.stock = roundQty(num(item.stock) - num(row.qty));
    item.status = item.stock > 0 ? "Disponível" : "Emprestado";
  });
  db.movements.push(movement);
  deliveryCart = [];
  deliveryCartEmployeeId = "";
  pendingDeliveryAfterSignature = false;
  $("withdrawNotes").value = "";
  renderDeliveryCart();
  return true;
}

async function registerReturn(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const employee = employeeById($("returnEmployee").value);
  const selected = [...document.querySelectorAll(".return-row")].map((row) => {
    const loan = openLoans(employee.id).find((l) => l.key === row.dataset.loan);
    return {
      loan,
      checked: row.querySelector(".return-check").checked,
      qty: num(row.querySelector(".return-qty").value),
      state: row.querySelector(".return-state").value,
      note: row.querySelector(".return-note").value.trim()
    };
  }).filter((r) => r.checked && r.loan && r.qty > 0);
  if (!selected.length) return toast("Marque pelo menos um item para devolver.");
  const movement = {
    id: crypto.randomUUID(), type: "DEVOLUCAO", protocol: protocol("DEVOLUCAO"), date: new Date().toISOString(),
    employeeId: employee.id, employeeName: employee.name, keeper: $("returnKeeper").value.trim(),
    userId: currentUser.id, userName: currentUser.name, notes: $("returnNotes").value.trim(),
    items: selected.map(({ loan, qty, state, note }) => ({
      itemId: loan.itemId, name: loan.name, code: loan.code, category: loan.category, qty: Math.min(qty, loan.openQty),
      unit: loan.unit, returnState: state, notes: note, loanKey: loan.key, withdrawId: loan.withdrawId, status: state.toUpperCase()
    }))
  };
  movement.items.forEach((row) => {
    const item = itemById(row.itemId);
    if (!item) return;
    if (row.returnState === "Normal") {
      item.stock = roundQty(num(item.stock) + num(row.qty));
      item.status = "Disponível";
      item.condition = "Normal";
    } else {
      item.status = "Avariado";
      item.condition = row.returnState;
    }
  });
  db.movements.push(movement);
  $("returnNotes").value = "";
  await saveDb();
  toast("Devolução registrada.");
}

function roundQty(value) {
  return Math.round(value * 100) / 100;
}

async function saveEmployee(event) {
  event.preventDefault();
  if (!ensureManageEmployees()) return;
  const name = $("employeeName").value.trim();
  if (!name) return toast("Informe o nome do funcionário.");
  const id = $("employeeId").value || uid("FUN", "employee");
  const existing = employeeById(id);
  const photo = await readFileAsDataUrl($("employeePhoto"));
  const record = { id, name, role: $("employeeRole").value.trim(), phone: $("employeePhone").value.trim(), team: $("employeeTeam").value.trim(), status: $("employeeStatus").value, photo: photo || existing?.photo || "" };
  if (existing) Object.assign(existing, record); else db.employees.push(record);
  await saveDb();
  $("employeeDialog").close();
  $("employeeForm").reset();
  toast("Funcionário salvo.");
}

async function saveItem(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const id = $("itemId").value || uid("MAT", "item");
  const existing = itemById(id);
  const photo = await readFileAsDataUrl($("itemPhoto"));
  const record = {
    id, name: $("itemName").value.trim(), code: $("itemCode").value.trim(), category: $("itemCategory").value,
    stock: num($("itemStock").value), unit: $("itemUnit").value.trim(), condition: $("itemCondition").value,
    status: $("itemStatus").value, notes: $("itemNotes").value.trim(), photo: photo || existing?.photo || "", minStock: existing?.minStock ?? 1
  };
  if (existing) Object.assign(existing, record); else db.items.push(record);
  $("itemDialog").close();
  $("itemForm").reset();
  await saveDb();
}

async function saveUser(event) {
  event.preventDefault();
  if (!ensureEdit() || currentUser.level !== "Administrador") return toast("Apenas administrador altera usuários.");
  const id = $("userId").value || uid("USR", "user");
  const existing = db.users.find((u) => u.id === id);
  const record = { id, name: $("userName").value.trim(), login: $("userLogin").value.trim(), pass: $("userPass").value, level: $("userLevel").value };
  if (existing) Object.assign(existing, record); else db.users.push(record);
  $("userDialog").close();
  $("userForm").reset();
  await saveDb();
}

window.editEmployee = (id) => {
  if (!ensureManageEmployees()) return;
  const e = employeeById(id);
  if (!e) return;
  $("employeeId").value = e.id; $("employeeName").value = e.name; $("employeeRole").value = e.role; $("employeePhone").value = e.phone; $("employeeTeam").value = e.team; $("employeeStatus").value = e.status;
  $("employeeDialog").showModal();
};

window.deleteEmployee = async (id) => {
  if (!ensureManageEmployees()) return;
  const employee = employeeById(id);
  if (!employee) return;
  if (openLoans(id).length) return toast("Não é possível excluir funcionário com itens em posse.");
  if (!confirm(`Excluir ${employee.name}? O histórico antigo continuará registrado.`)) return;
  db.employees = db.employees.filter((e) => e.id !== id);
  await saveDb();
  toast("Funcionário excluído.");
};

window.editItem = (id) => {
  const i = itemById(id);
  if (!i) return;
  $("itemId").value = i.id; $("itemName").value = i.name; $("itemCode").value = i.code; $("itemCategory").value = i.category; $("itemStock").value = i.stock; $("itemUnit").value = i.unit; $("itemCondition").value = i.condition; $("itemStatus").value = i.status; $("itemNotes").value = i.notes;
  $("itemDialog").showModal();
};

window.editUser = (id) => {
  const u = db.users.find((x) => x.id === id);
  if (!u) return;
  $("userId").value = u.id; $("userName").value = u.name; $("userLogin").value = u.login; $("userPass").value = u.pass; $("userLevel").value = u.level;
  $("userDialog").showModal();
};

window.openEmployeeCustody = (id) => {
  selectedCustodyEmployeeId = id;
  setView("custody");
};

function openSignature(employeeId) {
  const employee = employeeById(employeeId);
  if (!employee) return toast("Selecione um funcionário.");
  $("signatureEmployeeId").value = employeeId;
  $("signatureEmployeeName").textContent = `${employee.name} - ${todayKey()}`;
  $("signatureDialog").showModal();
  setTimeout(() => setupSignaturePad(), 50);
}

function setupSignaturePad() {
  const canvas = $("signaturePad");
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#10243f";
  context.lineWidth = 3;
  context.lineCap = "round";
  let drawing = false;
  const pos = (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = event.touches?.[0] || event;
    return { x: (point.clientX - rect.left) * (canvas.width / rect.width), y: (point.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (event) => { event.preventDefault(); drawing = true; const p = pos(event); context.beginPath(); context.moveTo(p.x, p.y); };
  const move = (event) => { if (!drawing) return; event.preventDefault(); const p = pos(event); context.lineTo(p.x, p.y); context.stroke(); };
  const end = () => { drawing = false; };
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  signaturePad = { canvas, context };
}

async function saveSignature(event) {
  event.preventDefault();
  if (!ensureEdit()) return;
  const employee = employeeById($("signatureEmployeeId").value);
  if (!employee || !signaturePad) return;
  const existing = dailySignature(employee.id);
  const image = signaturePad.canvas.toDataURL("image/png");
  const signature = existing || { id: uid("ASS", "signature"), employeeId: employee.id, employeeName: employee.name, date: todayKey(), createdAt: new Date().toISOString() };
  Object.assign(signature, { image, userId: currentUser.id, userName: currentUser.name });
  if (!existing) {
    db.signatures.push(signature);
    db.movements.push({ id: crypto.randomUUID(), type: "ASSINATURA", protocol: protocol("ASSINATURA"), date: new Date().toISOString(), employeeId: employee.id, employeeName: employee.name, userId: currentUser.id, userName: currentUser.name, signatureId: signature.id, items: [] });
  }
  db.movements
    .filter((m) => m.employeeId === employee.id && m.date?.slice(0, 10) === signature.date)
    .forEach((m) => { m.signatureId = signature.id; });
  const deliveryFinished = pendingDeliveryAfterSignature && deliveryCartEmployeeId === employee.id
    ? completeDeliveryAfterSignature(signature)
    : false;
  $("signatureDialog").close();
  await saveDb();
  toast(deliveryFinished ? "Entrega finalizada com assinatura." : "Assinatura diária salva.");
}

function clearSignature() {
  if (!signaturePad) return;
  signaturePad.context.fillStyle = "#fff";
  signaturePad.context.fillRect(0, 0, signaturePad.canvas.width, signaturePad.canvas.height);
}

function reportRows() {
  const type = $("reportType").value;
  const employeeId = $("reportEmployee").value;
  const now = new Date();
  const start = new Date(now);
  if (type === "weekly") start.setDate(now.getDate() - 7);
  if (type === "monthly") start.setMonth(now.getMonth() - 1);
  if (type === "individual") start.setFullYear(2000);
  return db.movements.filter((m) => new Date(m.date) >= start && (type !== "individual" || m.employeeId === employeeId));
}

function printReport() {
  const rows = reportRows();
  const loans = $("reportType").value === "individual" ? openLoans($("reportEmployee").value) : openLoans();
  const signatures = db.signatures.filter((s) => rows.some((m) => m.signatureId === s.id || m.employeeId === s.employeeId));
  $("printArea").innerHTML = `<section class="receipt-page">
    <div class="receipt-head"><div><h1>ObraStock</h1><strong>RELATÓRIO DE CAUTELA DIGITAL</strong></div><div class="receipt-meta">${formatDate(new Date().toISOString())}</div></div>
    <h3>Itens sob responsabilidade</h3>
    <table><thead><tr><th>Funcionário</th><th>Item</th><th>Qtd.</th><th>Retirada</th><th>Tempo</th></tr></thead><tbody>${loans.map((l) => `<tr><td>${escapeHtml(l.employeeName)}</td><td>${escapeHtml(l.name)}</td><td>${l.openQty} ${escapeHtml(l.unit)}</td><td>${formatDate(l.date)}</td><td>${daysSince(l.date)} dia(s)</td></tr>`).join("")}</tbody></table>
    <h3>Histórico</h3>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Funcionário</th><th>Itens</th><th>Usuário</th></tr></thead><tbody>${rows.map((m) => `<tr><td>${formatDate(m.date)}</td><td>${labelType(m.type)}</td><td>${escapeHtml(m.employeeName || "-")}</td><td>${(m.items || []).map((i) => `${escapeHtml(i.name)} (${i.qty})`).join("<br>") || "Assinatura"}</td><td>${escapeHtml(m.userName || "-")}</td></tr>`).join("")}</tbody></table>
    <h3>Assinaturas</h3>
    <div class="report-signatures">${signatures.slice(-6).map((s) => `<div><strong>${escapeHtml(s.employeeName)}</strong><br><span>${escapeHtml(s.date)}</span><img src="${s.image}" alt=""></div>`).join("")}</div>
    <div class="signature-grid"><div class="signature">Assinatura do funcionário</div><div class="signature">Assinatura do almoxarife</div></div>
  </section>`;
  setTimeout(() => window.print(), 80);
}

function exportExcel() {
  const header = ["Data", "Tipo", "Protocolo", "Funcionario", "Item", "Quantidade", "Estado", "Responsavel", "Usuario"];
  const rows = db.movements.flatMap((m) => (m.items?.length ? m.items : [{ name: "Assinatura diária", qty: "", returnState: "" }]).map((i) => [formatDate(m.date), labelType(m.type), m.protocol, m.employeeName, i.name, i.qty, i.returnState || i.status || "", m.keeper || "", m.userName || ""]));
  download(`cautela-obrastock-${Date.now()}.csv`, [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n"), "text/csv;charset=utf-8");
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

function backup() {
  download(`backup-obrastock-${Date.now()}.json`, JSON.stringify(db, null, 2), "application/json");
}

function restore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      db = normalizeDb(JSON.parse(reader.result));
      await saveDb();
      toast("Backup restaurado.");
    } catch {
      toast("Arquivo de backup inválido.");
    }
  };
  reader.readAsText(file);
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
  $("quickReturnBtn").addEventListener("click", () => setView("return"));
  $("themeToggle").addEventListener("click", () => { db.settings.dark = !db.settings.dark; document.body.classList.toggle("dark", db.settings.dark); saveDb(); });
  $("backupBtn").addEventListener("click", backup);
  $("restoreInput").addEventListener("change", restore);
  ["employeeSearch", "itemSearch", "historySearch", "custodySearch", "withdrawSearch"].forEach((id) => $(id).addEventListener("input", render));
  ["historyDate", "historyType", "onlyOpen", "returnEmployee", "reportType", "reportEmployee"].forEach((id) => $(id).addEventListener("change", render));
  $("withdrawEmployee").addEventListener("change", () => {
    if (deliveryCart.length && $("withdrawEmployee").value !== deliveryCartEmployeeId) {
      $("withdrawEmployee").value = deliveryCartEmployeeId;
      toast("Finalize ou remova os itens antes de trocar o funcionário.");
    }
    renderWithdrawPreview();
  });
  $("newEmployeeBtn").addEventListener("click", () => { if (ensureManageEmployees()) { $("employeeForm").reset(); $("employeeId").value = ""; $("employeeDialog").showModal(); } });
  $("newItemBtn").addEventListener("click", () => { if (ensureEdit()) { $("itemForm").reset(); $("itemId").value = ""; $("itemDialog").showModal(); } });
  $("newUserBtn").addEventListener("click", () => { if (ensureEdit()) { $("userForm").reset(); $("userId").value = ""; $("userDialog").showModal(); } });
  $("withdrawForm").addEventListener("submit", addDeliveryItem);
  $("finishWithdrawBtn").addEventListener("click", finalizeDelivery);
  $("returnForm").addEventListener("submit", registerReturn);
  $("employeeForm").addEventListener("submit", saveEmployee);
  $("itemForm").addEventListener("submit", saveItem);
  $("userForm").addEventListener("submit", saveUser);
  $("signatureForm").addEventListener("submit", saveSignature);
  $("clearSignatureBtn").addEventListener("click", clearSignature);
  $("printReportBtn").addEventListener("click", printReport);
  $("exportExcelBtn").addEventListener("click", exportExcel);
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => {
    const dialog = btn.closest("dialog");
    if (dialog?.id === "signatureDialog") pendingDeliveryAfterSignature = false;
    dialog.close();
  }));
}

wire();
initAuth();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
