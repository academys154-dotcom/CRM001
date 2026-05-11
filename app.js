:root {
  --bg: #f6f8fb;
  --card: #ffffff;
  --card-soft: #fbfcfe;
  --text: #142033;
  --muted: #68758a;
  --line: #e3e8f0;
  --line-dark: #cbd5e1;
  --primary: #2563eb;
  --primary-soft: #eff6ff;
  --primary-dark: #1d4ed8;
  --success: #15803d;
  --success-soft: #eefdf4;
  --danger: #dc2626;
  --danger-soft: #fff1f1;
  --warning: #b45309;
  --warning-soft: #fff7ed;
  --purple: #7c3aed;
  --purple-soft: #f5f3ff;
  --shadow: 0 20px 60px rgba(15, 23, 42, .08);
  --radius: 18px;
  --radius-sm: 12px;
  --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font);
  color: var(--text);
  background: radial-gradient(circle at 0 0, rgba(37,99,235,.08), transparent 35rem), linear-gradient(135deg, #f9fbff 0%, #f3f6fb 100%);
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: not-allowed; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 2px solid #f8fafc; }
::-webkit-scrollbar-track { background: #f8fafc; }

.toast { position: fixed; z-index: 1000; top: 18px; right: 18px; display: grid; gap: 10px; max-width: 380px; }
.toast-item { background: #0f172a; color: white; border-radius: 14px; padding: 12px 14px; box-shadow: var(--shadow); animation: toastIn .25s ease; }
@keyframes toastIn { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.login-page { min-height: 100vh; display: grid; grid-template-columns: minmax(350px, 520px) 1fr; }
.login-panel { padding: 56px; display: flex; flex-direction: column; justify-content: center; }
.login-card { background: rgba(255,255,255,.86); border: 1px solid var(--line); border-radius: 28px; padding: 30px; box-shadow: var(--shadow); backdrop-filter: blur(10px); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -.02em; }
.brand-mark { width: 38px; height: 38px; border-radius: 13px; display: grid; place-items: center; background: #0f172a; color: white; }
.login-card h1 { font-size: 30px; line-height: 1.1; margin: 28px 0 10px; letter-spacing: -.04em; }
.login-card p { color: var(--muted); line-height: 1.6; margin: 0 0 22px; }
.login-side { padding: 44px; display: grid; place-items: center; }
.preview-card { width: min(720px, 100%); background: white; border: 1px solid var(--line); border-radius: 32px; box-shadow: var(--shadow); overflow: hidden; }
.preview-head { padding: 22px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); }
.preview-grid { padding: 22px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.preview-grid div { min-height: 115px; border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: var(--card-soft); }
.preview-grid strong { display: block; margin-bottom: 8px; }
.demo-logins { margin-top: 18px; display: grid; gap: 8px; font-size: 13px; color: var(--muted); }
.demo-logins code { color: var(--text); background: #f1f5f9; padding: 3px 7px; border-radius: 8px; }

.app-shell { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
.sidebar { position: sticky; top: 0; height: 100vh; padding: 20px; border-right: 1px solid var(--line); background: rgba(255,255,255,.76); backdrop-filter: blur(16px); }
.sidebar-top { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.sidebar .brand-mark { width: 36px; height: 36px; }
.role-pill { margin-left: auto; color: var(--primary); background: var(--primary-soft); border: 1px solid #dbeafe; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 700; }
.nav { display: grid; gap: 7px; }
.nav button { width: 100%; border: 0; background: transparent; color: var(--muted); border-radius: 14px; padding: 12px 13px; text-align: left; display: flex; align-items: center; gap: 10px; font-weight: 700; }
.nav button:hover, .nav button.active { background: #f1f5f9; color: var(--text); }
.nav button.active { box-shadow: inset 3px 0 0 var(--primary); }
.sidebar-footer { position: absolute; bottom: 20px; left: 20px; right: 20px; }
.user-mini { border: 1px solid var(--line); background: white; border-radius: 18px; padding: 13px; margin-bottom: 10px; }
.user-mini strong { display: block; }
.user-mini span { color: var(--muted); font-size: 13px; }

.main { padding: 26px; min-width: 0; }
.topbar { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 22px; }
.title h1 { margin: 0; font-size: 26px; letter-spacing: -.03em; }
.title p { margin: 7px 0 0; color: var(--muted); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

.card { background: rgba(255,255,255,.9); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
.card-pad { padding: 20px; }
.grid { display: grid; gap: 16px; }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.stat { padding: 18px; }
.stat span { color: var(--muted); font-size: 13px; }
.stat strong { display: block; margin-top: 8px; font-size: 28px; letter-spacing: -.04em; }
.section-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 14px; }
.section-head h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
.section-head p { margin: 5px 0 0; color: var(--muted); font-size: 14px; }

.form { display: grid; gap: 12px; }
.form-row { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
label { display: grid; gap: 7px; font-size: 13px; color: var(--muted); font-weight: 700; }
.input, input, select, textarea { width: 100%; border: 1px solid var(--line-dark); background: white; color: var(--text); border-radius: 12px; padding: 11px 12px; outline: none; transition: .16s; }
textarea { min-height: 82px; resize: vertical; }
input:focus, select:focus, textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(37, 99, 235, .09); }
.btn { border: 1px solid var(--line-dark); border-radius: 12px; background: white; color: var(--text); padding: 10px 13px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; }
.btn:hover { border-color: #94a3b8; background: #f8fafc; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); border-color: var(--primary-dark); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: white; }
.btn-danger:hover { background: #b91c1c; border-color: #b91c1c; }
.btn-soft { background: var(--primary-soft); border-color: #dbeafe; color: var(--primary-dark); }
.btn-small { padding: 7px 9px; border-radius: 10px; font-size: 12px; }
.btn-ghost { background: transparent; border-color: transparent; }

.table-wrap { border: 1px solid var(--line); border-radius: 16px; overflow: auto; background: white; }
table { width: 100%; border-collapse: collapse; min-width: 760px; }
th, td { border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); padding: 11px 12px; text-align: left; vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: #f8fafc; color: #334155; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
td:last-child, th:last-child { border-right: 0; }
tr:last-child td { border-bottom: 0; }
.table-actions { display: flex; flex-wrap: wrap; gap: 6px; }

.attendance-toolbar { display: grid; grid-template-columns: 1.4fr 1fr auto auto; gap: 10px; align-items: end; margin-bottom: 14px; }
.attendance-table { min-width: 980px; }
.attendance-table th:first-child, .attendance-table td:first-child { position: sticky; left: 0; z-index: 2; background: white; min-width: 230px; }
.attendance-table th:first-child { z-index: 3; background: #f8fafc; }
.date-head { white-space: nowrap; min-width: 170px; }
.date-head-main { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.date-head small { display: block; color: var(--muted); text-transform: none; letter-spacing: 0; margin-top: 4px; font-weight: 700; }
.att-cell { min-width: 170px; }
.cell-empty-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.status-btn { border: 1px solid var(--line); border-radius: 9px; padding: 6px 5px; background: #f8fafc; font-size: 11px; font-weight: 900; }
.status-btn.present { background: var(--success-soft); border-color: #bbf7d0; color: var(--success); }
.status-btn.absent { background: var(--danger-soft); border-color: #fecaca; color: var(--danger); }
.status-btn.excused { background: var(--warning-soft); border-color: #fed7aa; color: var(--warning); }
.status-btn.late { background: var(--purple-soft); border-color: #ddd6fe; color: var(--purple); }
.cell-done { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 6px 9px; font-weight: 900; font-size: 12px; border: 1px solid var(--line); white-space: nowrap; }
.badge.present { background: var(--success-soft); border-color: #bbf7d0; color: var(--success); }
.badge.absent { background: var(--danger-soft); border-color: #fecaca; color: var(--danger); }
.badge.excused { background: var(--warning-soft); border-color: #fed7aa; color: var(--warning); }
.badge.late { background: var(--purple-soft); border-color: #ddd6fe; color: var(--purple); }
.badge.empty { background: #f8fafc; color: var(--muted); }
.edit-icon { border: 0; background: #f1f5f9; width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; color: #334155; }
.note { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.35; }
.student-name { display: grid; gap: 3px; }
.student-name strong { font-size: 14px; }
.student-name small { color: var(--muted); }
.empty-state { padding: 35px; text-align: center; color: var(--muted); }
.empty-state strong { display: block; color: var(--text); margin-bottom: 6px; }

.modal-backdrop { position: fixed; inset: 0; z-index: 500; background: rgba(15, 23, 42, .42); display: grid; place-items: center; padding: 18px; }
.modal { width: min(580px, 100%); max-height: 92vh; overflow: auto; background: white; border-radius: 24px; border: 1px solid var(--line); box-shadow: 0 25px 80px rgba(15, 23, 42, .25); }
.modal-head { padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid var(--line); }
.modal-head h3 { margin: 0; }
.modal-body { padding: 20px; }
.check-list { display: grid; gap: 8px; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: 14px; padding: 10px; }
.check-row { display: flex; align-items: center; gap: 9px; color: var(--text); font-weight: 700; }
.check-row input { width: auto; }
.status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }

.system-lock { max-width: 660px; margin: 0 auto; }
.danger-zone { border: 1px solid #fecaca; background: #fff7f7; }
.file-input { background: white; }
.info-list { display: grid; gap: 8px; color: var(--muted); line-height: 1.6; }
.info-list code { color: var(--text); background: #f1f5f9; padding: 2px 6px; border-radius: 8px; }

@media (max-width: 980px) {
  .login-page { grid-template-columns: 1fr; }
  .login-side { display: none; }
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .sidebar-footer { position: static; margin-top: 18px; }
  .nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .topbar { align-items: flex-start; flex-direction: column; }
  .grid-2, .grid-3, .form-row, .attendance-toolbar { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .login-panel, .main { padding: 18px; }
  .login-card { padding: 22px; }
  .preview-grid, .status-grid { grid-template-columns: 1fr; }
  .nav { grid-template-columns: 1fr; }
  .actions { width: 100%; }
  .btn { width: 100%; }
  .table-actions .btn { width: auto; }
}
