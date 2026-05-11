const app = document.getElementById('app');
const toastRoot = document.getElementById('toast');
const TOKEN_KEY = 'course_attendance_token_v2';

const statusMap = {
  present: { label: 'Keldi', short: 'K', cls: 'present' },
  absent: { label: 'Kelmadi', short: 'Y', cls: 'absent' },
  excused: { label: 'Sababli', short: 'S', cls: 'excused' },
  late: { label: 'Kechikdi', short: 'L', cls: 'late' },
  '': { label: 'Belgilanmagan', short: '-', cls: 'empty' }
};

let token = sessionStorage.getItem(TOKEN_KEY) || '';
let state = null;
let publicConfig = { showDemoCredentials: false };
let ui = {
  tab: 'overview',
  selectedGroupId: '',
  newDate: todayISO(),
  reportStart: '',
  reportEnd: '',
  search: '',
  modal: null,
  systemUnlocked: false,
  systemPassword: ''
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fullName(item) {
  return `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.username || '-';
}

function showToast(message) {
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = message;
  toastRoot.appendChild(item);
  setTimeout(() => item.remove(), 2800);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload.error || payload || 'Xatolik yuz berdi');
  return payload;
}

async function loadPublicConfig() {
  try {
    publicConfig = await api('/api/public-config');
  } catch (_err) {
    publicConfig = { showDemoCredentials: false };
  }
}

async function refresh() {
  await loadPublicConfig();
  if (!token) return renderLogin();
  try {
    state = await api('/api/state');
    ensureUi();
    render();
  } catch (err) {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    renderLogin();
  }
}

function ensureUi() {
  if (!state) return;
  const groups = state.groups || [];
  if (!ui.selectedGroupId || !groups.some((g) => g.id === ui.selectedGroupId)) {
    ui.selectedGroupId = groups[0]?.id || '';
  }
}

function setTab(tab) {
  ui.tab = tab;
  ui.modal = null;
  render();
}

function roleLabel(role) {
  return role === 'admin' ? 'Admin' : role === 'teacher' ? 'Ustoz' : 'O‘quvchi';
}

function navItems(role) {
  if (role === 'admin') {
    return [
      ['overview', 'Bosh sahifa', '⌘'],
      ['teachers', 'Ustozlar', 'U'],
      ['students', 'O‘quvchilar', 'O'],
      ['groups', 'Guruhlar', 'G'],
      ['attendance', 'Davomat jadvali', 'J'],
      ['reports', 'Yuklab olish', '↓'],
      ['system', 'System / Backup', '⚙']
    ];
  }
  if (role === 'teacher') {
    return [
      ['overview', 'Mening guruhlarim', '⌘'],
      ['attendance', 'Davomat qilish', 'J'],
      ['reports', 'Yuklab olish', '↓'],
      ['profile', 'Profil', 'P']
    ];
  }
  return [
    ['overview', 'Mening davomatim', '⌘'],
    ['profile', 'Profil', 'P']
  ];
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-page">
      <div class="login-panel">
        <div class="login-card">
          <div class="brand"><span class="brand-mark">CA</span><span>Course Attendance CRM</span></div>
          <h1>Minimalistik keldi-ketdi tizimi</h1>
          <p>Admin, ustoz va o‘quvchi rollari. Endi ma’lumotlar backend orqali file database ichida saqlanadi.</p>
          <form class="form" onsubmit="login(event)">
            <label>Username
              <input id="loginUsername" autocomplete="username" placeholder="admin" required />
            </label>
            <label>Parol
              <input id="loginPassword" autocomplete="current-password" type="password" placeholder="admin123" required />
            </label>
            <button class="btn btn-primary" type="submit">Tizimga kirish</button>
          </form>
          ${publicConfig.showDemoCredentials ? `
          <div class="demo-logins">
            <div>Admin: <code>admin</code> / <code>admin123</code></div>
            <div>Ustoz: <code>ustoz1</code> / <code>12345</code></div>
            <div>O‘quvchi: <code>jasur</code> / <code>12345</code></div>
            <div>System parol: <code>system123</code></div>
          </div>` : `
          <div class="demo-logins">
            <div>Demo ma’lumotlar xavfsizlik uchun login oynasida ko‘rsatilmaydi.</div>
            <div>Admin login va production parollar README/.env orqali sozlanadi.</div>
          </div>`}
        </div>
      </div>
      <div class="login-side">
        <div class="preview-card">
          <div class="preview-head">
            <strong>Excel uslubidagi davomat</strong>
            <span class="badge present">Keldi</span>
          </div>
          <div class="preview-grid">
            <div><strong>Bugungi kun</strong><span>Bir tugma bilan sana qo‘shiladi.</span></div>
            <div><strong>Calendar</strong><span>Istalgan sana tanlanadi va jadval ochiladi.</span></div>
            <div><strong>Backup</strong><span>ZIP yuklab olish va qayta tiklash.</span></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function login(event) {
  event.preventDefault();
  try {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const result = await api('/api/login', { method: 'POST', body: { username, password } });
    token = result.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    state = result.state;
    ui.tab = 'overview';
    showToast('Tizimga kirdingiz');
    ensureUi();
    render();
  } catch (err) {
    showToast(err.message);
  }
}

async function logout() {
  try { if (token) await api('/api/logout', { method: 'POST' }); } catch (_err) {}
  token = '';
  state = null;
  sessionStorage.removeItem(TOKEN_KEY);
  renderLogin();
}

function render() {
  if (!state?.me) return renderLogin();
  const role = state.me.role;
  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <span class="brand-mark">CA</span>
          <strong>Attendance</strong>
          <span class="role-pill">${roleLabel(role)}</span>
        </div>
        <nav class="nav">
          ${navItems(role).map(([key, label, icon]) => `
            <button class="${ui.tab === key ? 'active' : ''}" onclick="setTab('${key}')"><span>${icon}</span>${label}</button>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="user-mini"><strong>${escapeHTML(fullName(state.me))}</strong><span>@${escapeHTML(state.me.username)}</span></div>
          <button class="btn" onclick="logout()" style="width:100%">Chiqish</button>
        </div>
      </aside>
      <section class="main">
        ${renderTopbar()}
        ${renderPage()}
      </section>
      ${renderModal()}
    </section>
  `;
}

function renderTopbar() {
  const titleMap = {
    overview: 'Bosh sahifa', teachers: 'Ustozlar', students: 'O‘quvchilar', groups: 'Guruhlar', attendance: 'Davomat jadvali', reports: 'Yuklab olish', system: 'System / Backup', profile: 'Profil'
  };
  return `
    <div class="topbar">
      <div class="title">
        <h1>${titleMap[ui.tab] || 'Dashboard'}</h1>
        <p>${ui.tab === 'attendance' ? 'Sana qo‘shish soddalashtirildi: bugungi kun yoki calendar orqali.' : 'Minimal, toza va real tizimga tayyor ko‘rinish.'}</p>
      </div>
      <div class="actions">
        ${state.me.role === 'admin' ? '<button class="btn btn-soft" onclick="setTab(\'system\')">Backup / Restore</button>' : ''}
      </div>
    </div>
  `;
}

function renderPage() {
  if (ui.tab === 'overview') return renderOverview();
  if (ui.tab === 'teachers') return renderTeachers();
  if (ui.tab === 'students') return renderStudents();
  if (ui.tab === 'groups') return renderGroups();
  if (ui.tab === 'attendance') return renderAttendance();
  if (ui.tab === 'reports') return renderReports();
  if (ui.tab === 'system') return renderSystem();
  if (ui.tab === 'profile') return renderProfile();
  return renderOverview();
}

function renderOverview() {
  const groups = state.groups || [];
  const teachers = state.teachers || [];
  const students = state.students || [];
  const dates = (state.attendance || []).reduce((sum, a) => sum + (a.dates || []).length, 0);
  if (state.me.role === 'student') return renderStudentAttendance();
  return `
    <div class="grid grid-3">
      <div class="card stat"><span>Guruhlar</span><strong>${groups.length}</strong></div>
      <div class="card stat"><span>O‘quvchilar</span><strong>${students.length}</strong></div>
      <div class="card stat"><span>Dars sanalari</span><strong>${dates}</strong></div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <div class="section-head">
        <div><h2>Tezkor amal</h2><p>Ustoz uchun eng asosiy joy: davomat jadvali.</p></div>
        <button class="btn btn-primary" onclick="setTab('attendance')">Davomatga o‘tish</button>
      </div>
      ${groups.length ? renderGroupMiniTable(groups, teachers, students) : '<div class="empty-state"><strong>Guruh yo‘q</strong>Admin guruh yaratishi kerak.</div>'}
    </div>
  `;
}

function renderGroupMiniTable(groups, teachers, students) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Guruh</th><th>Ustoz</th><th>O‘quvchilar</th><th>Amal</th></tr></thead>
        <tbody>
          ${groups.map((g) => `
            <tr>
              <td><strong>${escapeHTML(g.name)}</strong></td>
              <td>${(g.teacherIds || []).map((id) => fullName(teachers.find((t) => t.id === id) || {})).join(', ') || '-'}</td>
              <td>${(g.studentIds || []).filter((id) => students.some((s) => s.id === id)).length} ta</td>
              <td><button class="btn btn-small" onclick="openGroupAttendance('${g.id}')">Jadval</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openGroupAttendance(groupId) {
  ui.selectedGroupId = groupId;
  ui.tab = 'attendance';
  render();
}

function renderTeachers() {
  if (state.me.role !== 'admin') return '<div class="empty-state">Ruxsat yo‘q</div>';
  const teachers = state.teachers || [];
  return `
    <div class="card card-pad">
      <div class="section-head">
        <div><h2>Ustozlar ma’lumotlari</h2><p>Admin ism, familiya, username, parol va telefon yaratadi.</p></div>
        <button class="btn btn-primary" onclick="openTeacherModal()">+ Ustoz qo‘shish</button>
      </div>
      ${teachers.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>F.I.Sh</th><th>Username</th><th>Telefon</th><th>Amal</th></tr></thead>
        <tbody>${teachers.map((t) => `
          <tr>
            <td><strong>${escapeHTML(fullName(t))}</strong></td>
            <td>@${escapeHTML(t.username)}</td>
            <td>${escapeHTML(t.phone || '-')}</td>
            <td><div class="table-actions"><button class="btn btn-small" onclick="openTeacherModal('${t.id}')">Tahrirlash</button><button class="btn btn-small btn-danger" onclick="deleteEntity('teachers','${t.id}')">O‘chirish</button></div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty-state"><strong>Ustoz yo‘q</strong>Yangi ustoz qo‘shing.</div>'}
    </div>
  `;
}

function renderStudents() {
  if (state.me.role !== 'admin') return '<div class="empty-state">Ruxsat yo‘q</div>';
  const students = state.students || [];
  const groups = state.groups || [];
  return `
    <div class="card card-pad">
      <div class="section-head">
        <div><h2>O‘quvchilar ma’lumotlari</h2><p>O‘quvchini guruhga biriktirish ham shu yerdan boshqariladi.</p></div>
        <button class="btn btn-primary" onclick="openStudentModal()">+ O‘quvchi qo‘shish</button>
      </div>
      ${students.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>F.I.Sh</th><th>Username</th><th>Telefon</th><th>Guruh</th><th>Amal</th></tr></thead>
        <tbody>${students.map((s) => `
          <tr>
            <td><strong>${escapeHTML(fullName(s))}</strong></td>
            <td>@${escapeHTML(s.username)}</td>
            <td>${escapeHTML(s.phone || '-')}</td>
            <td>${escapeHTML(groups.find((g) => g.id === s.groupId)?.name || '-')}</td>
            <td><div class="table-actions"><button class="btn btn-small" onclick="openStudentModal('${s.id}')">Tahrirlash</button><button class="btn btn-small btn-danger" onclick="deleteEntity('students','${s.id}')">O‘chirish</button></div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty-state"><strong>O‘quvchi yo‘q</strong>Yangi o‘quvchi qo‘shing.</div>'}
    </div>
  `;
}

function renderGroups() {
  if (state.me.role !== 'admin') return '<div class="empty-state">Ruxsat yo‘q</div>';
  const groups = state.groups || [];
  const teachers = state.teachers || [];
  const students = state.students || [];
  return `
    <div class="card card-pad">
      <div class="section-head">
        <div><h2>Guruhlar</h2><p>Admin guruh yaratadi, ustoz va o‘quvchilarni biriktiradi.</p></div>
        <button class="btn btn-primary" onclick="openGroupModal()">+ Guruh qo‘shish</button>
      </div>
      ${groups.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Guruh nomi</th><th>Ustozlar</th><th>O‘quvchilar</th><th>Amal</th></tr></thead>
        <tbody>${groups.map((g) => `
          <tr>
            <td><strong>${escapeHTML(g.name)}</strong></td>
            <td>${(g.teacherIds || []).map((id) => escapeHTML(fullName(teachers.find((t) => t.id === id) || {}))).join(', ') || '-'}</td>
            <td>${(g.studentIds || []).filter((id) => students.some((s) => s.id === id)).length} ta</td>
            <td><div class="table-actions"><button class="btn btn-small" onclick="openGroupModal('${g.id}')">Tahrirlash</button><button class="btn btn-small" onclick="openGroupAttendance('${g.id}')">Davomat</button><button class="btn btn-small btn-danger" onclick="deleteEntity('groups','${g.id}')">O‘chirish</button></div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty-state"><strong>Guruh yo‘q</strong>Yangi guruh qo‘shing.</div>'}
    </div>
  `;
}

function selectedGroup() {
  return (state.groups || []).find((g) => g.id === ui.selectedGroupId) || null;
}

function attendanceFor(groupId) {
  return (state.attendance || []).find((a) => a.groupId === groupId) || { groupId, dates: [], records: {} };
}

function studentsForGroup(group) {
  const ids = new Set(group?.studentIds || []);
  return (state.students || []).filter((s) => ids.has(s.id));
}

function renderAttendance() {
  const groups = state.groups || [];
  if (!groups.length) return '<div class="card card-pad"><div class="empty-state"><strong>Guruh topilmadi</strong>Admin guruh yaratishi kerak.</div></div>';
  const group = selectedGroup() || groups[0];
  ui.selectedGroupId = group.id;
  const attendance = attendanceFor(group.id);
  const dates = [...(attendance.dates || [])].sort((a, b) => a.localeCompare(b));
  const students = studentsForGroup(group);
  const canEdit = state.me.role !== 'student';

  return `
    <div class="card card-pad">
      <div class="section-head">
        <div><h2>${escapeHTML(group.name)}</h2><p>Bugungi kunni tez qo‘shing yoki calendar orqali istalgan sanani tanlang.</p></div>
        <div class="actions"><button class="btn" onclick="exportAttendanceXLSX(false)">Butun jadval XLSX</button><button class="btn" onclick="exportAttendancePDF(false)">Butun jadval PDF</button></div>
      </div>
      <div class="attendance-toolbar">
        <label>Guruh
          <select onchange="ui.selectedGroupId=this.value; render()">
            ${groups.map((g) => `<option value="${g.id}" ${g.id === group.id ? 'selected' : ''}>${escapeHTML(g.name)}</option>`).join('')}
          </select>
        </label>
        <label>Sana tanlash
          <input type="date" value="${escapeHTML(ui.newDate || todayISO())}" onchange="ui.newDate=this.value" />
        </label>
        ${canEdit ? `<button class="btn btn-soft" onclick="addToday('${group.id}')">Bugungi kunni qo‘shish</button>` : ''}
        ${canEdit ? `<button class="btn btn-primary" onclick="addSelectedDate('${group.id}')">Tanlangan sanani qo‘shish</button>` : ''}
      </div>
      ${renderAttendanceRangeActions()}
      ${dates.length && students.length ? renderAttendanceTable(group, students, dates, attendance, canEdit) : `<div class="empty-state"><strong>Jadval hali ochilmagan</strong>${canEdit ? 'Bugungi kunni qo‘shing yoki calendar orqali sana tanlab qo‘shing.' : 'Ustoz hali sana qo‘shmagan.'}</div>`}
    </div>
  `;
}

function renderAttendanceRangeActions() {
  return `
    <div class="actions" style="margin-bottom:14px">
      <label style="min-width:170px">Boshlanish
        <input type="date" value="${escapeHTML(ui.reportStart)}" onchange="ui.reportStart=this.value" />
      </label>
      <label style="min-width:170px">Tugash
        <input type="date" value="${escapeHTML(ui.reportEnd)}" onchange="ui.reportEnd=this.value" />
      </label>
      <button class="btn" onclick="exportAttendanceXLSX(true)">Oraliq XLSX</button>
      <button class="btn" onclick="exportAttendancePDF(true)">Oraliq PDF</button>
    </div>
  `;
}

function renderAttendanceTable(group, students, dates, attendance, canEdit) {
  return `
    <div class="table-wrap">
      <table class="attendance-table">
        <thead>
          <tr>
            <th>O‘quvchi</th>
            ${dates.map((date) => `
              <th class="date-head">
                <div class="date-head-main">
                  <span>${formatDate(date)}</span>
                  ${canEdit ? `<button class="btn btn-small btn-ghost" title="Sanani o‘chirish" onclick="deleteDate('${group.id}','${date}')">×</button>` : ''}
                </div>
                <small>${date}</small>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${students.map((student) => `
            <tr>
              <td><div class="student-name"><strong>${escapeHTML(fullName(student))}</strong><small>@${escapeHTML(student.username)} · ${escapeHTML(student.phone || '-')}</small></div></td>
              ${dates.map((date) => renderAttendanceCell(group.id, student.id, date, attendance, canEdit)).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAttendanceCell(groupId, studentId, date, attendance, canEdit) {
  const rec = attendance.records?.[studentId]?.[date] || null;
  if (!canEdit) {
    const meta = statusMap[rec?.status || ''];
    return `<td class="att-cell"><span class="badge ${meta.cls}">${meta.label}</span>${rec?.note ? `<div class="note">${escapeHTML(rec.note)}</div>` : ''}</td>`;
  }
  if (!rec) {
    return `
      <td class="att-cell">
        <div class="cell-empty-actions">
          <button class="status-btn present" onclick="quickAttendance('${groupId}','${studentId}','${date}','present')">Keldi</button>
          <button class="status-btn absent" onclick="quickAttendance('${groupId}','${studentId}','${date}','absent')">Kelmadi</button>
          <button class="status-btn excused" onclick="quickAttendance('${groupId}','${studentId}','${date}','excused')">Sababli</button>
        </div>
        <button class="status-btn late" style="width:100%; margin-top:5px" onclick="quickAttendance('${groupId}','${studentId}','${date}','late')">Kechikdi</button>
      </td>`;
  }
  const meta = statusMap[rec.status] || statusMap[''];
  return `
    <td class="att-cell">
      <div class="cell-done">
        <span class="badge ${meta.cls}">${meta.label}</span>
        <button class="edit-icon" title="Tahrirlash" onclick="openAttendanceModal('${groupId}','${studentId}','${date}')">✎</button>
      </div>
      ${rec.note ? `<div class="note">${escapeHTML(rec.note)}</div>` : ''}
    </td>`;
}

async function addToday(groupId) {
  ui.newDate = todayISO();
  await addDate(groupId, ui.newDate);
}

async function addSelectedDate(groupId) {
  await addDate(groupId, ui.newDate || todayISO());
}

async function addDate(groupId, date) {
  try {
    const result = await api(`/api/groups/${groupId}/dates`, { method: 'POST', body: { date } });
    state = result.state;
    showToast(`${formatDate(date)} sanasi qo‘shildi`);
    ensureUi();
    render();
  } catch (err) { showToast(err.message); }
}

async function deleteDate(groupId, date) {
  if (!confirm(`${formatDate(date)} sanasini va shu kundagi belgilarni o‘chirasizmi?`)) return;
  try {
    const result = await api(`/api/groups/${groupId}/dates/${date}`, { method: 'DELETE' });
    state = result.state;
    showToast('Sana o‘chirildi');
    render();
  } catch (err) { showToast(err.message); }
}

async function quickAttendance(groupId, studentId, date, status) {
  await saveAttendance(groupId, studentId, date, status, '');
}

function openAttendanceModal(groupId, studentId, date) {
  ui.modal = { type: 'attendance', groupId, studentId, date };
  render();
}

async function saveAttendance(groupId, studentId, date, status, note) {
  try {
    const result = await api('/api/attendance', { method: 'PUT', body: { groupId, studentId, date, status, note } });
    state = result.state;
    ui.modal = null;
    showToast(status ? 'Davomat saqlandi' : 'Belgi o‘chirildi');
    render();
  } catch (err) { showToast(err.message); }
}

function renderReports() {
  return `
    <div class="grid grid-2">
      <div class="card card-pad">
        <div class="section-head"><div><h2>Ustozlar va o‘quvchilar</h2><p>Admin paneldagi ma’lumotlarni XLSX/PDF qilib olish.</p></div></div>
        <div class="actions">
          ${state.me.role === 'admin' ? '<button class="btn" onclick="exportPeople(\'teachers\',\'xlsx\')">Ustozlar XLSX</button><button class="btn" onclick="exportPeople(\'teachers\',\'pdf\')">Ustozlar PDF</button><button class="btn" onclick="exportPeople(\'students\',\'xlsx\')">O‘quvchilar XLSX</button><button class="btn" onclick="exportPeople(\'students\',\'pdf\')">O‘quvchilar PDF</button>' : '<p class="info-list">Bu bo‘limda ustoz faqat o‘z guruhlari davomatini yuklab oladi.</p>'}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-head"><div><h2>Davomat jadvali</h2><p>Tanlangan guruh bo‘yicha butun jadval yoki sana oralig‘i.</p></div></div>
        <div class="form">
          <label>Guruh
            <select onchange="ui.selectedGroupId=this.value; render()">
              ${(state.groups || []).map((g) => `<option value="${g.id}" ${g.id === ui.selectedGroupId ? 'selected' : ''}>${escapeHTML(g.name)}</option>`).join('')}
            </select>
          </label>
          <div class="form-row">
            <label>Boshlanish <input type="date" value="${escapeHTML(ui.reportStart)}" onchange="ui.reportStart=this.value" /></label>
            <label>Tugash <input type="date" value="${escapeHTML(ui.reportEnd)}" onchange="ui.reportEnd=this.value" /></label>
          </div>
          <div class="actions">
            <button class="btn" onclick="exportAttendanceXLSX(false)">Butun XLSX</button>
            <button class="btn" onclick="exportAttendancePDF(false)">Butun PDF</button>
            <button class="btn btn-soft" onclick="exportAttendanceXLSX(true)">Oraliq XLSX</button>
            <button class="btn btn-soft" onclick="exportAttendancePDF(true)">Oraliq PDF</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSystem() {
  if (state.me.role !== 'admin') return '<div class="empty-state">Ruxsat yo‘q</div>';
  if (!ui.systemUnlocked) {
    return `
      <div class="card card-pad system-lock">
        <div class="section-head"><div><h2>System sahifa himoyalangan</h2><p>Bu sahifaga hatto admin ham alohida maxfiy parol bilan kiradi.</p></div></div>
        <form class="form" onsubmit="unlockSystem(event)">
          <label>System parol
            <input id="systemPassword" type="password" placeholder="System parol" required />
          </label>
          <button class="btn btn-primary" type="submit">System sahifaga kirish</button>
        </form>
      </div>`;
  }
  return `
    <div class="grid grid-2">
      <div class="card card-pad">
        <div class="section-head"><div><h2>Backup olish</h2><p>Barcha data papkalar bitta ZIPga joylanadi.</p></div></div>
        <div class="info-list">
          <div><code>data/teachers</code> — ustozlar</div>
          <div><code>data/students</code> — o‘quvchilar</div>
          <div><code>data/groups</code> — guruhlar</div>
          <div><code>data/attendance</code> — keldi-ketdi jadvali</div>
        </div>
        <div class="actions" style="margin-top:14px"><button class="btn btn-primary" onclick="downloadBackup()">Barcha ma’lumotlarni ZIP yuklab olish</button></div>
      </div>
      <div class="card card-pad">
        <div class="section-head"><div><h2>Qayta tiklash</h2><p>Tizim o‘zi bergan ZIPni yuklasangiz, ma’lumotlar eski holatiga qaytadi.</p></div></div>
        <form class="form" onsubmit="restoreBackup(event)">
          <label>Backup ZIP fayl
            <input id="restoreFile" class="file-input" type="file" accept=".zip" required />
          </label>
          <button class="btn btn-primary" type="submit">ZIPdan qayta tiklash</button>
        </form>
      </div>
      <div class="card card-pad">
        <div class="section-head"><div><h2>System parolni o‘zgartirish</h2><p>O‘zgartirish uchun joriy parol ham tekshiriladi.</p></div></div>
        <form class="form" onsubmit="changeSystemPassword(event)">
          <label>Yangi system parol
            <input id="newSystemPassword" type="password" minlength="5" required />
          </label>
          <button class="btn" type="submit">Parolni o‘zgartirish</button>
        </form>
      </div>
      <div class="card card-pad danger-zone">
        <div class="section-head"><div><h2>Barcha ma’lumotlarni o‘chirish</h2><p>Bu tugma alohida himoyalangan sahifada turadi. Amal bajarilgach demo ma’lumotlar o‘chadi, default admin qayta yaratiladi.</p></div></div>
        <button class="btn btn-danger" onclick="wipeAllData()">Barcha ma’lumotlarni o‘chirish</button>
      </div>
    </div>`;
}

async function unlockSystem(event) {
  event.preventDefault();
  const password = document.getElementById('systemPassword').value;
  try {
    await api('/api/system/verify', { method: 'POST', body: { systemPassword: password } });
    ui.systemPassword = password;
    ui.systemUnlocked = true;
    showToast('System sahifa ochildi');
    render();
  } catch (err) { showToast(err.message); }
}

async function downloadBackup() {
  try {
    const response = await fetch('/api/system/backup.zip', { headers: { Authorization: `Bearer ${token}`, 'x-system-password': ui.systemPassword } });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Backup olishda xatolik' }));
      throw new Error(err.error);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `course-attendance-backup-${todayISO()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Backup yuklab olindi');
  } catch (err) { showToast(err.message); }
}

async function restoreBackup(event) {
  event.preventDefault();
  if (!confirm('Joriy data ZIPdagi data bilan almashtiriladi. Davom etasizmi?')) return;
  const file = document.getElementById('restoreFile').files[0];
  const fd = new FormData();
  fd.append('backup', file);
  fd.append('systemPassword', ui.systemPassword);
  try {
    const result = await api('/api/system/restore', { method: 'POST', body: fd });
    showToast(result.message || 'Qayta tiklandi');
    await logout();
  } catch (err) { showToast(err.message); }
}

async function changeSystemPassword(event) {
  event.preventDefault();
  const newPassword = document.getElementById('newSystemPassword').value;
  try {
    await api('/api/system/change-password', { method: 'POST', body: { systemPassword: ui.systemPassword, newPassword } });
    ui.systemPassword = newPassword;
    showToast('System parol o‘zgartirildi');
    render();
  } catch (err) { showToast(err.message); }
}

async function wipeAllData() {
  const typed = prompt('Barcha ma’lumotlarni o‘chirish uchun OCHIRISH deb yozing:');
  if (typed !== 'OCHIRISH') return showToast('Amal bekor qilindi');
  try {
    const result = await api('/api/system/wipe', { method: 'POST', body: { systemPassword: ui.systemPassword } });
    showToast(result.message || 'Ma’lumotlar o‘chirildi');
    await logout();
  } catch (err) { showToast(err.message); }
}

function renderProfile() {
  const me = state.me;
  return `
    <div class="card card-pad">
      <div class="section-head"><div><h2>${escapeHTML(fullName(me))}</h2><p>${roleLabel(me.role)} profili</p></div></div>
      <div class="grid grid-2">
        <div class="stat card"><span>Username</span><strong>@${escapeHTML(me.username)}</strong></div>
        <div class="stat card"><span>Telefon</span><strong>${escapeHTML(me.phone || '-')}</strong></div>
      </div>
    </div>`;
}

function renderStudentAttendance() {
  const groups = state.groups || [];
  if (!groups.length) return '<div class="card card-pad"><div class="empty-state"><strong>Siz hali guruhga biriktirilmagansiz</strong></div></div>';
  return `
    <div class="card card-pad">
      <div class="section-head"><div><h2>Mening davomatim</h2><p>Ustoz belgilagan keldi-ketdi holatlari.</p></div></div>
      ${groups.map((g) => {
        const a = attendanceFor(g.id);
        const dates = [...(a.dates || [])].sort((x, y) => x.localeCompare(y));
        const student = state.me;
        return `<h3>${escapeHTML(g.name)}</h3>${dates.length ? `<div class="table-wrap"><table><thead><tr><th>Sana</th><th>Holat</th><th>Izoh</th></tr></thead><tbody>${dates.map((d) => {
          const rec = a.records?.[student.id]?.[d] || null;
          const meta = statusMap[rec?.status || ''];
          return `<tr><td>${formatDate(d)}</td><td><span class="badge ${meta.cls}">${meta.label}</span></td><td>${escapeHTML(rec?.note || '-')}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty-state">Hali sana qo‘shilmagan.</div>'}`;
      }).join('')}
    </div>`;
}

function renderModal() {
  const modal = ui.modal;
  if (!modal) return '';
  if (modal.type === 'teacher') return renderTeacherModal(modal.id);
  if (modal.type === 'student') return renderStudentModal(modal.id);
  if (modal.type === 'group') return renderGroupModal(modal.id);
  if (modal.type === 'attendance') return renderAttendanceModal(modal);
  return '';
}

function modalShell(title, body) {
  return `
    <div class="modal-backdrop" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-head"><h3>${title}</h3><button class="btn btn-small" onclick="ui.modal=null; render()">Yopish</button></div>
        <div class="modal-body">${body}</div>
      </div>
    </div>`;
}

function closeModal(event) {
  if (event.target.classList.contains('modal-backdrop')) {
    ui.modal = null;
    render();
  }
}

function openTeacherModal(id = '') { ui.modal = { type: 'teacher', id }; render(); }
function openStudentModal(id = '') { ui.modal = { type: 'student', id }; render(); }
function openGroupModal(id = '') { ui.modal = { type: 'group', id }; render(); }

function renderTeacherModal(id = '') {
  const t = (state.teachers || []).find((x) => x.id === id) || {};
  return modalShell(id ? 'Ustozni tahrirlash' : 'Yangi ustoz', `
    <form class="form" onsubmit="saveTeacher(event,'${id}')">
      <div class="form-row"><label>Ism<input id="teacherFirst" value="${escapeHTML(t.firstName || '')}" required /></label><label>Familiya<input id="teacherLast" value="${escapeHTML(t.lastName || '')}" required /></label></div>
      <div class="form-row"><label>Username<input id="teacherUsername" value="${escapeHTML(t.username || '')}" required /></label><label>Parol ${id ? '<small>Bo‘sh qoldirsangiz o‘zgarmaydi</small>' : ''}<input id="teacherPassword" type="password" ${id ? '' : 'required'} /></label></div>
      <label>Telefon<input id="teacherPhone" value="${escapeHTML(t.phone || '')}" placeholder="+998" /></label>
      <button class="btn btn-primary" type="submit">Saqlash</button>
    </form>`);
}

async function saveTeacher(event, id = '') {
  event.preventDefault();
  const body = {
    firstName: document.getElementById('teacherFirst').value,
    lastName: document.getElementById('teacherLast').value,
    username: document.getElementById('teacherUsername').value,
    password: document.getElementById('teacherPassword').value,
    phone: document.getElementById('teacherPhone').value
  };
  try {
    const result = await api(id ? `/api/teachers/${id}` : '/api/teachers', { method: id ? 'PUT' : 'POST', body });
    state = result.state;
    ui.modal = null;
    showToast('Ustoz saqlandi');
    render();
  } catch (err) { showToast(err.message); }
}

function renderStudentModal(id = '') {
  const s = (state.students || []).find((x) => x.id === id) || {};
  return modalShell(id ? 'O‘quvchini tahrirlash' : 'Yangi o‘quvchi', `
    <form class="form" onsubmit="saveStudent(event,'${id}')">
      <div class="form-row"><label>Ism<input id="studentFirst" value="${escapeHTML(s.firstName || '')}" required /></label><label>Familiya<input id="studentLast" value="${escapeHTML(s.lastName || '')}" required /></label></div>
      <div class="form-row"><label>Username<input id="studentUsername" value="${escapeHTML(s.username || '')}" required /></label><label>Parol ${id ? '<small>Bo‘sh qoldirsangiz o‘zgarmaydi</small>' : ''}<input id="studentPassword" type="password" ${id ? '' : 'required'} /></label></div>
      <div class="form-row"><label>Telefon<input id="studentPhone" value="${escapeHTML(s.phone || '')}" /></label><label>Guruh<select id="studentGroup"><option value="">Tanlanmagan</option>${(state.groups || []).map((g) => `<option value="${g.id}" ${s.groupId === g.id ? 'selected' : ''}>${escapeHTML(g.name)}</option>`).join('')}</select></label></div>
      <button class="btn btn-primary" type="submit">Saqlash</button>
    </form>`);
}

async function saveStudent(event, id = '') {
  event.preventDefault();
  const body = {
    firstName: document.getElementById('studentFirst').value,
    lastName: document.getElementById('studentLast').value,
    username: document.getElementById('studentUsername').value,
    password: document.getElementById('studentPassword').value,
    phone: document.getElementById('studentPhone').value,
    groupId: document.getElementById('studentGroup').value
  };
  try {
    const result = await api(id ? `/api/students/${id}` : '/api/students', { method: id ? 'PUT' : 'POST', body });
    state = result.state;
    ui.modal = null;
    showToast('O‘quvchi saqlandi');
    render();
  } catch (err) { showToast(err.message); }
}

function renderGroupModal(id = '') {
  const g = (state.groups || []).find((x) => x.id === id) || { teacherIds: [], studentIds: [] };
  return modalShell(id ? 'Guruhni tahrirlash' : 'Yangi guruh', `
    <form class="form" onsubmit="saveGroup(event,'${id}')">
      <label>Guruh nomi<input id="groupName" value="${escapeHTML(g.name || '')}" required /></label>
      <label>Ustozlar</label>
      <div class="check-list">${(state.teachers || []).map((t) => `<label class="check-row"><input type="checkbox" name="teacherIds" value="${t.id}" ${(g.teacherIds || []).includes(t.id) ? 'checked' : ''}/> ${escapeHTML(fullName(t))} (@${escapeHTML(t.username)})</label>`).join('') || '<span class="note">Ustoz yo‘q</span>'}</div>
      <label>O‘quvchilar</label>
      <div class="check-list">${(state.students || []).map((s) => `<label class="check-row"><input type="checkbox" name="studentIds" value="${s.id}" ${(g.studentIds || []).includes(s.id) ? 'checked' : ''}/> ${escapeHTML(fullName(s))} (@${escapeHTML(s.username)})</label>`).join('') || '<span class="note">O‘quvchi yo‘q</span>'}</div>
      <button class="btn btn-primary" type="submit">Saqlash</button>
    </form>`);
}

async function saveGroup(event, id = '') {
  event.preventDefault();
  const body = {
    name: document.getElementById('groupName').value,
    teacherIds: [...document.querySelectorAll('input[name="teacherIds"]:checked')].map((x) => x.value),
    studentIds: [...document.querySelectorAll('input[name="studentIds"]:checked')].map((x) => x.value)
  };
  try {
    const result = await api(id ? `/api/groups/${id}` : '/api/groups', { method: id ? 'PUT' : 'POST', body });
    state = result.state;
    ui.modal = null;
    showToast('Guruh saqlandi');
    ensureUi();
    render();
  } catch (err) { showToast(err.message); }
}

async function deleteEntity(type, id) {
  if (!confirm('Rostdan ham o‘chirasizmi?')) return;
  try {
    const result = await api(`/api/${type}/${id}`, { method: 'DELETE' });
    state = result.state;
    showToast('O‘chirildi');
    ensureUi();
    render();
  } catch (err) { showToast(err.message); }
}

function renderAttendanceModal(modal) {
  const group = (state.groups || []).find((g) => g.id === modal.groupId) || {};
  const student = (state.students || []).find((s) => s.id === modal.studentId) || {};
  const attendance = attendanceFor(modal.groupId);
  const rec = attendance.records?.[modal.studentId]?.[modal.date] || { status: '', note: '' };
  return modalShell('Davomatni tahrirlash', `
    <div class="form">
      <div class="info-list"><div><strong>${escapeHTML(fullName(student))}</strong></div><div>${escapeHTML(group.name || '-')} · ${formatDate(modal.date)}</div></div>
      <div class="status-grid">
        <button class="status-btn present" onclick="saveAttendanceFromModal('present')">Keldi</button>
        <button class="status-btn absent" onclick="saveAttendanceFromModal('absent')">Kelmadi</button>
        <button class="status-btn excused" onclick="saveAttendanceFromModal('excused')">Sababli</button>
        <button class="status-btn late" onclick="saveAttendanceFromModal('late')">Kechikdi</button>
      </div>
      <label>Izoh
        <textarea id="attendanceNote" placeholder="Masalan: kasal, ruxsat so‘radi, kech keldi...">${escapeHTML(rec.note || '')}</textarea>
      </label>
      <div class="actions">
        <button class="btn btn-primary" onclick="saveAttendanceFromModal('${rec.status || 'present'}')">Saqlash</button>
        <button class="btn btn-danger" onclick="clearAttendanceFromModal()">Belgini o‘chirish</button>
      </div>
    </div>`);
}

function saveAttendanceFromModal(status) {
  const m = ui.modal;
  const note = document.getElementById('attendanceNote')?.value || '';
  saveAttendance(m.groupId, m.studentId, m.date, status, note);
}

function clearAttendanceFromModal() {
  const m = ui.modal;
  saveAttendance(m.groupId, m.studentId, m.date, '', '');
}

function peopleRows(type) {
  const rows = (state[type] || []).map((x, i) => ({
    '#': i + 1,
    'Ism': x.firstName || '',
    'Familiya': x.lastName || '',
    'Username': x.username || '',
    'Telefon': x.phone || '',
    'Rol': roleLabel(x.role),
    'Guruh': type === 'students' ? ((state.groups || []).find((g) => g.id === x.groupId)?.name || '') : ''
  }));
  return rows;
}

function exportPeople(type, format) {
  const title = type === 'teachers' ? 'Ustozlar' : 'O‘quvchilar';
  const rows = peopleRows(type);
  if (!rows.length) return showToast('Ma’lumot yo‘q');
  if (format === 'xlsx') downloadXLSX(`${title}.xlsx`, title, rows);
  else downloadPDF(title, rows);
}

function attendanceRows(useRange) {
  const group = selectedGroup();
  if (!group) return { group: null, rows: [], dates: [] };
  const attendance = attendanceFor(group.id);
  let dates = [...(attendance.dates || [])].sort((a, b) => a.localeCompare(b));
  if (useRange) dates = dates.filter((d) => (!ui.reportStart || d >= ui.reportStart) && (!ui.reportEnd || d <= ui.reportEnd));
  const students = studentsForGroup(group);
  const rows = students.map((s, i) => {
    const row = { '#': i + 1, 'O‘quvchi': fullName(s), 'Username': s.username };
    for (const d of dates) {
      const rec = attendance.records?.[s.id]?.[d];
      row[formatDate(d)] = rec ? `${statusMap[rec.status]?.label || '-'}${rec.note ? ` (${rec.note})` : ''}` : '-';
    }
    return row;
  });
  return { group, rows, dates };
}

function exportAttendanceXLSX(useRange) {
  const { group, rows } = attendanceRows(useRange);
  if (!group || !rows.length) return showToast('Yuklab olish uchun ma’lumot yo‘q');
  downloadXLSX(`${group.name}-${useRange ? 'oraliq' : 'butun'}-davomat.xlsx`, group.name, rows);
}

function exportAttendancePDF(useRange) {
  const { group, rows } = attendanceRows(useRange);
  if (!group || !rows.length) return showToast('Yuklab olish uchun ma’lumot yo‘q');
  downloadPDF(`${group.name} davomat`, rows);
}

function downloadXLSX(filename, sheetName, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.replace(/[\\/:*?"<>|]/g, '-'));
}

function downloadPDF(title, rows) {
  if (!window.jspdf?.jsPDF) return showToast('PDF kutubxonasi yuklanmadi. Internetni tekshiring.');
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  const headers = Object.keys(rows[0] || {});
  const body = rows.map((r) => headers.map((h) => String(r[h] ?? '')));
  doc.autoTable({ head: [headers], body, startY: 22, styles: { fontSize: 8 } });
  doc.save(`${title}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
}

window.login = login;
window.logout = logout;
window.setTab = setTab;
window.openGroupAttendance = openGroupAttendance;
window.openTeacherModal = openTeacherModal;
window.openStudentModal = openStudentModal;
window.openGroupModal = openGroupModal;
window.saveTeacher = saveTeacher;
window.saveStudent = saveStudent;
window.saveGroup = saveGroup;
window.deleteEntity = deleteEntity;
window.addToday = addToday;
window.addSelectedDate = addSelectedDate;
window.deleteDate = deleteDate;
window.quickAttendance = quickAttendance;
window.openAttendanceModal = openAttendanceModal;
window.saveAttendanceFromModal = saveAttendanceFromModal;
window.clearAttendanceFromModal = clearAttendanceFromModal;
window.closeModal = closeModal;
window.exportPeople = exportPeople;
window.exportAttendanceXLSX = exportAttendanceXLSX;
window.exportAttendancePDF = exportAttendancePDF;
window.unlockSystem = unlockSystem;
window.downloadBackup = downloadBackup;
window.restoreBackup = restoreBackup;
window.changeSystemPassword = changeSystemPassword;
window.wipeAllData = wipeAllData;
window.ui = ui;
window.render = render;

refresh();
