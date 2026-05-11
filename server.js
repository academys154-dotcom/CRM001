try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional on Railway because environment variables are provided by the platform.
}

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const archiver = require('archiver');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Railway healthcheck can only reach the app if it listens on 0.0.0.0.
// If HOST is accidentally set to localhost/127.0.0.1/domain in Railway, the deploy starts but healthcheck fails.
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_PROJECT_ID);
const HOST = IS_RAILWAY ? '0.0.0.0' : (process.env.HOST || '0.0.0.0');
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, '_tmp_uploads'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_SYSTEM_PASSWORD = process.env.SYSTEM_PASSWORD || 'system123';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SEED_DEMO = String(process.env.SEED_DEMO || 'true').toLowerCase() !== 'false';
const SHOW_DEMO_CREDENTIALS = String(process.env.SHOW_DEMO_CREDENTIALS || 'false').toLowerCase() === 'true';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';
const BACKUP_UPLOAD_LIMIT_MB = Number(process.env.BACKUP_UPLOAD_LIMIT_MB || 15);

const dirs = {
  admins: path.join(DATA_DIR, 'admins'),
  teachers: path.join(DATA_DIR, 'teachers'),
  students: path.join(DATA_DIR, 'students'),
  groups: path.join(DATA_DIR, 'groups'),
  attendance: path.join(DATA_DIR, 'attendance'),
  settings: path.join(DATA_DIR, 'settings')
};

const sessions = new Map();
const rateBuckets = new Map();
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: BACKUP_UPLOAD_LIMIT_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.zip$/i.test(file.originalname || '')) return cb(null, true);
    cb(new Error('Faqat .zip backup fayl yuklash mumkin'));
  }
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));
app.use(express.static(PUBLIC_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}_${Date.now().toString(36)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function normalizeString(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function safeEntityId(value) {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(text)) {
    const err = new Error('ID formati noto‘g‘ri');
    err.statusCode = 400;
    throw err;
  }
  return text;
}

function assertPassword(password, label = 'Parol') {
  const text = String(password || '');
  if (text.length < 5) {
    const err = new Error(`${label} kamida 5 ta belgidan iborat bo‘lsin`);
    err.statusCode = 400;
    throw err;
  }
}

function rateLimit({ keyPrefix, windowMs, max }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.' });
    }
    next();
  };
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, session] of sessions.entries()) {
    if (!session.createdAtMs || session.createdAtMs < cutoff) sessions.delete(key);
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(String(password || ''), 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(String(password || ''), hash || '');
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileExists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch (_err) {
    return false;
  }
}

async function readJSON(file, fallback = null) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

async function writeJSON(file, value) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function listJSON(dir) {
  await ensureDir(dir);
  const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
  const rows = [];
  for (const file of files) {
    const item = await readJSON(path.join(dir, file));
    if (item) rows.push(item);
  }
  return rows;
}

function entityFile(type, entityId) {
  if (!dirs[type]) throw new Error('Unknown entity type');
  const cleanId = safeEntityId(entityId);
  const file = path.resolve(dirs[type], `${cleanId}.json`);
  const base = path.resolve(dirs[type]);
  if (!file.startsWith(base + path.sep)) {
    const err = new Error('Fayl yo‘li xavfsiz emas');
    err.statusCode = 400;
    throw err;
  }
  return file;
}

function cleanUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

async function getAllData() {
  const [admins, teachers, students, groups, attendanceFiles, settings] = await Promise.all([
    listJSON(dirs.admins),
    listJSON(dirs.teachers),
    listJSON(dirs.students),
    listJSON(dirs.groups),
    listJSON(dirs.attendance),
    readJSON(path.join(dirs.settings, 'system.json'), {})
  ]);
  return {
    admins,
    teachers,
    students,
    groups,
    attendance: attendanceFiles,
    settings
  };
}

async function getPublicState(user) {
  const all = await getAllData();
  const admins = all.admins.map(cleanUser);
  const teachers = all.teachers.map(cleanUser);
  const students = all.students.map(cleanUser);
  const groups = all.groups;
  const attendance = all.attendance;

  if (user.role === 'admin') {
    return { me: cleanUser(user), admins, teachers, students, groups, attendance };
  }

  if (user.role === 'teacher') {
    const myGroups = groups.filter((g) => (g.teacherIds || []).includes(user.id));
    const studentIds = new Set(myGroups.flatMap((g) => g.studentIds || []));
    return {
      me: cleanUser(user),
      admins: [],
      teachers: [cleanUser(user)],
      students: students.filter((s) => studentIds.has(s.id)),
      groups: myGroups,
      attendance: attendance.filter((a) => myGroups.some((g) => g.id === a.groupId))
    };
  }

  const myGroups = groups.filter((g) => (g.studentIds || []).includes(user.id));
  return {
    me: cleanUser(user),
    admins: [],
    teachers: teachers.filter((t) => myGroups.some((g) => (g.teacherIds || []).includes(t.id))),
    students: [cleanUser(user)],
    groups: myGroups,
    attendance: attendance.filter((a) => myGroups.some((g) => g.id === a.groupId))
  };
}

async function findUserByUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  const all = await getAllData();
  const users = [...all.admins, ...all.teachers, ...all.students];
  return users.find((u) => String(u.username || '').trim().toLowerCase() === normalized) || null;
}

async function findUserById(userId) {
  const all = await getAllData();
  const users = [...all.admins, ...all.teachers, ...all.students];
  return users.find((u) => u.id === userId) || null;
}

async function ensureUniqueUsername(username, exceptId = '') {
  const user = await findUserByUsername(username);
  if (user && user.id !== exceptId) {
    const err = new Error('Bu username allaqachon band');
    err.statusCode = 409;
    throw err;
  }
}

async function seedFreshData({ withDemo = true } = {}) {
  for (const dir of Object.values(dirs)) await ensureDir(dir);

  const adminId = 'admin_main';
  await writeJSON(entityFile('admins', adminId), {
    id: adminId,
    role: 'admin',
    firstName: process.env.ADMIN_FIRST_NAME || 'Smart',
    lastName: process.env.ADMIN_LAST_NAME || 'Admin',
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    phone: process.env.ADMIN_PHONE || '+998 90 000 00 00',
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await writeJSON(path.join(dirs.settings, 'system.json'), {
    systemPasswordHash: hashPassword(DEFAULT_SYSTEM_PASSWORD),
    defaultSystemPasswordHint: DEFAULT_SYSTEM_PASSWORD === 'system123' ? 'system123' : 'ENV orqali berilgan',
    updatedAt: nowISO()
  });

  if (!withDemo) return;

  const teacherId = 'teacher_demo_1';
  const student1 = 'student_demo_1';
  const student2 = 'student_demo_2';
  const student3 = 'student_demo_3';
  const groupId = 'group_demo_1';
  const today = new Date().toISOString().slice(0, 10);

  await writeJSON(entityFile('teachers', teacherId), {
    id: teacherId,
    role: 'teacher',
    firstName: 'Azizbek',
    lastName: 'Karimov',
    username: 'ustoz1',
    passwordHash: hashPassword('12345'),
    phone: '+998 90 123 45 67',
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await writeJSON(entityFile('students', student1), {
    id: student1,
    role: 'student',
    firstName: 'Jasur',
    lastName: 'Aliyev',
    username: 'jasur',
    passwordHash: hashPassword('12345'),
    phone: '+998 91 111 22 33',
    groupId,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  await writeJSON(entityFile('students', student2), {
    id: student2,
    role: 'student',
    firstName: 'Madina',
    lastName: 'Sobirova',
    username: 'madina',
    passwordHash: hashPassword('12345'),
    phone: '+998 93 222 33 44',
    groupId,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  await writeJSON(entityFile('students', student3), {
    id: student3,
    role: 'student',
    firstName: 'Aziza',
    lastName: 'Tursunova',
    username: 'aziza',
    passwordHash: hashPassword('12345'),
    phone: '+998 94 333 44 55',
    groupId,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await writeJSON(entityFile('groups', groupId), {
    id: groupId,
    name: 'IELTS Foundation A1',
    teacherIds: [teacherId],
    studentIds: [student1, student2, student3],
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  await writeJSON(entityFile('attendance', groupId), {
    groupId,
    dates: [today],
    records: {
      [student1]: { [today]: { status: 'present', note: '', updatedAt: nowISO(), by: 'seed' } },
      [student2]: { [today]: { status: 'absent', note: 'Xabar berilmagan', updatedAt: nowISO(), by: 'seed' } },
      [student3]: { [today]: { status: 'excused', note: 'Oilaviy sabab', updatedAt: nowISO(), by: 'seed' } }
    },
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
}

async function initData() {
  await ensureDir(DATA_DIR);
  await ensureDir(UPLOAD_DIR);
  for (const dir of Object.values(dirs)) await ensureDir(dir);
  const adminFiles = (await fsp.readdir(dirs.admins)).filter((f) => f.endsWith('.json'));
  if (adminFiles.length === 0) await seedFreshData({ withDemo: SEED_DEMO });
  const systemFile = path.join(dirs.settings, 'system.json');
  if (!(await fileExists(systemFile))) {
    await writeJSON(systemFile, {
      systemPasswordHash: hashPassword(DEFAULT_SYSTEM_PASSWORD),
      defaultSystemPasswordHint: DEFAULT_SYSTEM_PASSWORD === 'system123' ? 'system123' : 'ENV orqali berilgan',
      updatedAt: nowISO()
    });
  }
}

function requireAuth(req, res, next) {
  pruneExpiredSessions();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ error: 'Avval tizimga kiring' });
  session.lastSeenAt = nowISO();
  req.session = session;
  req.userId = session.userId;
  next();
}

async function attachUser(req, res, next) {
  try {
    const user = await findUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Bu amal faqat admin uchun' });
  next();
}

async function requireSystemPassword(req, res, next) {
  try {
    const password = req.body.systemPassword || req.query.systemPassword || req.headers['x-system-password'];
    const settings = await readJSON(path.join(dirs.settings, 'system.json'), {});
    if (!comparePassword(password, settings.systemPasswordHash)) {
      return res.status(403).json({ error: 'Maxfiy system parol noto‘g‘ri' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

function canAccessGroup(user, group) {
  if (!group) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return (group.teacherIds || []).includes(user.id);
  if (user.role === 'student') return (group.studentIds || []).includes(user.id);
  return false;
}

function validateDate(date) {
  const value = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const err = new Error('Sana YYYY-MM-DD formatda bo‘lishi kerak');
    err.statusCode = 400;
    throw err;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    const err = new Error('Sana haqiqiy bo‘lishi kerak');
    err.statusCode = 400;
    throw err;
  }
}

function validateRequired(body, fields) {
  for (const field of fields) {
    if (!String(body[field] || '').trim()) {
      const err = new Error(`${field} kiritilishi kerak`);
      err.statusCode = 400;
      throw err;
    }
  }
}

function safeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => safeEntityId(item)))];
}

function sortDates(dates) {
  return [...new Set(dates || [])].sort((a, b) => a.localeCompare(b));
}

async function deleteFileIfExists(file) {
  try { await fsp.unlink(file); } catch (_err) {}
}

async function removeFromGroups(type, entityId) {
  const groups = await listJSON(dirs.groups);
  for (const group of groups) {
    if (type === 'teacher') group.teacherIds = (group.teacherIds || []).filter((id) => id !== entityId);
    if (type === 'student') group.studentIds = (group.studentIds || []).filter((id) => id !== entityId);
    group.updatedAt = nowISO();
    await writeJSON(entityFile('groups', group.id), group);
  }
}

async function verifyEntityAccess(req, entityType, entityId) {
  const item = await readJSON(entityFile(entityType, entityId));
  if (!item) {
    const err = new Error('Ma’lumot topilmadi');
    err.statusCode = 404;
    throw err;
  }
  if (req.user.role !== 'admin') {
    const err = new Error('Ruxsat yo‘q');
    err.statusCode = 403;
    throw err;
  }
  return item;
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, app: 'course-attendance-crm', version: '2.1.0', time: nowISO() });
});

app.get('/api/public-config', async (_req, res) => {
  res.json({ showDemoCredentials: SHOW_DEMO_CREDENTIALS });
});

app.post('/api/login', rateLimit({ keyPrefix: 'login', windowMs: 15 * 60 * 1000, max: 30 }), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await findUserByUsername(username);
    if (!user || !comparePassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Username yoki parol noto‘g‘ri' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { token, userId: user.id, createdAt: nowISO(), createdAtMs: Date.now(), lastSeenAt: nowISO() });
    res.json({ token, user: cleanUser(user), state: await getPublicState(user) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(req.session.token);
  res.json({ ok: true });
});

app.get('/api/state', requireAuth, attachUser, async (req, res, next) => {
  try {
    res.json(await getPublicState(req.user));
  } catch (err) {
    next(err);
  }
});

app.post('/api/teachers', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    validateRequired(req.body, ['firstName', 'lastName', 'username', 'password']);
    assertPassword(req.body.password);
    await ensureUniqueUsername(req.body.username);
    const teacher = {
      id: id('teacher'),
      role: 'teacher',
      firstName: normalizeString(req.body.firstName),
      lastName: normalizeString(req.body.lastName),
      username: normalizeString(req.body.username, 60),
      passwordHash: hashPassword(req.body.password),
      phone: normalizeString(req.body.phone, 40),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    await writeJSON(entityFile('teachers', teacher.id), teacher);
    res.json({ ok: true, teacher: cleanUser(teacher), state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.put('/api/teachers/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    const teacher = await verifyEntityAccess(req, 'teachers', req.params.id);
    validateRequired(req.body, ['firstName', 'lastName', 'username']);
    await ensureUniqueUsername(req.body.username, teacher.id);
    teacher.firstName = String(req.body.firstName).trim();
    teacher.lastName = String(req.body.lastName).trim();
    teacher.username = String(req.body.username).trim();
    teacher.phone = String(req.body.phone || '').trim();
    if (String(req.body.password || '').trim()) { assertPassword(req.body.password); teacher.passwordHash = hashPassword(req.body.password); }
    teacher.updatedAt = nowISO();
    await writeJSON(entityFile('teachers', teacher.id), teacher);
    res.json({ ok: true, teacher: cleanUser(teacher), state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.delete('/api/teachers/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    await verifyEntityAccess(req, 'teachers', req.params.id);
    await removeFromGroups('teacher', req.params.id);
    await deleteFileIfExists(entityFile('teachers', req.params.id));
    res.json({ ok: true, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.post('/api/students', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    validateRequired(req.body, ['firstName', 'lastName', 'username', 'password']);
    assertPassword(req.body.password);
    await ensureUniqueUsername(req.body.username);
    const student = {
      id: id('student'),
      role: 'student',
      firstName: normalizeString(req.body.firstName),
      lastName: normalizeString(req.body.lastName),
      username: normalizeString(req.body.username, 60),
      passwordHash: hashPassword(req.body.password),
      phone: normalizeString(req.body.phone, 40),
      groupId: normalizeString(req.body.groupId, 80),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    await writeJSON(entityFile('students', student.id), student);
    if (student.groupId) {
      const group = await readJSON(entityFile('groups', student.groupId));
      if (group) {
        group.studentIds = [...new Set([...(group.studentIds || []), student.id])];
        group.updatedAt = nowISO();
        await writeJSON(entityFile('groups', group.id), group);
      }
    }
    res.json({ ok: true, student: cleanUser(student), state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.put('/api/students/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    const student = await verifyEntityAccess(req, 'students', req.params.id);
    validateRequired(req.body, ['firstName', 'lastName', 'username']);
    await ensureUniqueUsername(req.body.username, student.id);
    const oldGroupId = student.groupId;
    student.firstName = String(req.body.firstName).trim();
    student.lastName = String(req.body.lastName).trim();
    student.username = String(req.body.username).trim();
    student.phone = String(req.body.phone || '').trim();
    student.groupId = normalizeString(req.body.groupId, 80);
    if (String(req.body.password || '').trim()) { assertPassword(req.body.password); student.passwordHash = hashPassword(req.body.password); }
    student.updatedAt = nowISO();
    await writeJSON(entityFile('students', student.id), student);

    if (oldGroupId && oldGroupId !== student.groupId) {
      const oldGroup = await readJSON(entityFile('groups', oldGroupId));
      if (oldGroup) {
        oldGroup.studentIds = (oldGroup.studentIds || []).filter((id) => id !== student.id);
        oldGroup.updatedAt = nowISO();
        await writeJSON(entityFile('groups', oldGroup.id), oldGroup);
      }
    }
    if (student.groupId) {
      const group = await readJSON(entityFile('groups', student.groupId));
      if (group) {
        group.studentIds = [...new Set([...(group.studentIds || []), student.id])];
        group.updatedAt = nowISO();
        await writeJSON(entityFile('groups', group.id), group);
      }
    }
    res.json({ ok: true, student: cleanUser(student), state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.delete('/api/students/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    await verifyEntityAccess(req, 'students', req.params.id);
    await removeFromGroups('student', req.params.id);
    const attendanceFiles = await listJSON(dirs.attendance);
    for (const attendance of attendanceFiles) {
      if (attendance.records && attendance.records[req.params.id]) {
        delete attendance.records[req.params.id];
        attendance.updatedAt = nowISO();
        await writeJSON(entityFile('attendance', attendance.groupId), attendance);
      }
    }
    await deleteFileIfExists(entityFile('students', req.params.id));
    res.json({ ok: true, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.post('/api/groups', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    validateRequired(req.body, ['name']);
    const group = {
      id: id('group'),
      name: normalizeString(req.body.name, 120),
      teacherIds: safeIdArray(req.body.teacherIds),
      studentIds: safeIdArray(req.body.studentIds),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    await writeJSON(entityFile('groups', group.id), group);
    await writeJSON(entityFile('attendance', group.id), { groupId: group.id, dates: [], records: {}, createdAt: nowISO(), updatedAt: nowISO() });
    const students = await listJSON(dirs.students);
    for (const student of students) {
      if (group.studentIds.includes(student.id)) {
        student.groupId = group.id;
        student.updatedAt = nowISO();
        await writeJSON(entityFile('students', student.id), student);
      }
    }
    res.json({ ok: true, group, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.put('/api/groups/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    const group = await verifyEntityAccess(req, 'groups', req.params.id);
    validateRequired(req.body, ['name']);
    const oldStudentIds = new Set(group.studentIds || []);
    group.name = normalizeString(req.body.name, 120);
    group.teacherIds = safeIdArray(req.body.teacherIds);
    group.studentIds = safeIdArray(req.body.studentIds);
    group.updatedAt = nowISO();
    await writeJSON(entityFile('groups', group.id), group);

    const students = await listJSON(dirs.students);
    for (const student of students) {
      const shouldBeIn = group.studentIds.includes(student.id);
      const wasIn = oldStudentIds.has(student.id);
      if (shouldBeIn || wasIn) {
        student.groupId = shouldBeIn ? group.id : '';
        student.updatedAt = nowISO();
        await writeJSON(entityFile('students', student.id), student);
      }
    }
    res.json({ ok: true, group, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.delete('/api/groups/:id', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    await verifyEntityAccess(req, 'groups', req.params.id);
    const students = await listJSON(dirs.students);
    for (const student of students) {
      if (student.groupId === req.params.id) {
        student.groupId = '';
        student.updatedAt = nowISO();
        await writeJSON(entityFile('students', student.id), student);
      }
    }
    await deleteFileIfExists(entityFile('groups', req.params.id));
    await deleteFileIfExists(entityFile('attendance', req.params.id));
    res.json({ ok: true, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.post('/api/groups/:id/dates', requireAuth, attachUser, async (req, res, next) => {
  try {
    const group = await readJSON(entityFile('groups', req.params.id));
    if (!canAccessGroup(req.user, group) || req.user.role === 'student') return res.status(403).json({ error: 'Bu guruhga ruxsat yo‘q' });
    const date = String(req.body.date || '').trim();
    validateDate(date);
    let attendance = await readJSON(entityFile('attendance', group.id));
    if (!attendance) attendance = { groupId: group.id, dates: [], records: {}, createdAt: nowISO() };
    attendance.dates = sortDates([...(attendance.dates || []), date]);
    attendance.updatedAt = nowISO();
    await writeJSON(entityFile('attendance', group.id), attendance);
    res.json({ ok: true, attendance, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.delete('/api/groups/:id/dates/:date', requireAuth, attachUser, async (req, res, next) => {
  try {
    const group = await readJSON(entityFile('groups', req.params.id));
    if (!canAccessGroup(req.user, group) || req.user.role === 'student') return res.status(403).json({ error: 'Bu guruhga ruxsat yo‘q' });
    validateDate(req.params.date);
    const attendance = await readJSON(entityFile('attendance', group.id), { groupId: group.id, dates: [], records: {} });
    attendance.dates = (attendance.dates || []).filter((d) => d !== req.params.date);
    for (const studentId of Object.keys(attendance.records || {})) {
      if (attendance.records[studentId]) delete attendance.records[studentId][req.params.date];
    }
    attendance.updatedAt = nowISO();
    await writeJSON(entityFile('attendance', group.id), attendance);
    res.json({ ok: true, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.put('/api/attendance', requireAuth, attachUser, async (req, res, next) => {
  try {
    const { groupId, studentId, date } = req.body;
    const status = String(req.body.status || '').trim();
    const note = String(req.body.note || '').trim();
    validateDate(date);
    const allowed = ['', 'present', 'absent', 'late', 'excused'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status noto‘g‘ri' });
    const group = await readJSON(entityFile('groups', groupId));
    if (!canAccessGroup(req.user, group) || req.user.role === 'student') return res.status(403).json({ error: 'Bu guruhga ruxsat yo‘q' });
    if (!(group.studentIds || []).includes(studentId)) return res.status(400).json({ error: 'O‘quvchi bu guruhda emas' });

    let attendance = await readJSON(entityFile('attendance', groupId));
    if (!attendance) attendance = { groupId, dates: [], records: {}, createdAt: nowISO() };
    attendance.dates = sortDates([...(attendance.dates || []), date]);
    if (!attendance.records) attendance.records = {};
    if (!attendance.records[studentId]) attendance.records[studentId] = {};

    if (!status) {
      delete attendance.records[studentId][date];
    } else {
      attendance.records[studentId][date] = { status, note, updatedAt: nowISO(), by: req.user.id };
    }
    attendance.updatedAt = nowISO();
    await writeJSON(entityFile('attendance', groupId), attendance);
    res.json({ ok: true, attendance, state: await getPublicState(req.user) });
  } catch (err) { next(err); }
});

app.post('/api/system/verify', rateLimit({ keyPrefix: 'system', windowMs: 15 * 60 * 1000, max: 30 }), requireAuth, attachUser, requireAdmin, requireSystemPassword, async (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/system/change-password', requireAuth, attachUser, requireAdmin, requireSystemPassword, async (req, res, next) => {
  try {
    assertPassword(req.body.newPassword, 'Yangi system parol');
    const settings = await readJSON(path.join(dirs.settings, 'system.json'), {});
    settings.systemPasswordHash = hashPassword(req.body.newPassword);
    settings.defaultSystemPasswordHint = 'O‘zgartirilgan';
    settings.updatedAt = nowISO();
    await writeJSON(path.join(dirs.settings, 'system.json'), settings);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/system/backup.zip', requireAuth, attachUser, requireAdmin, async (req, res, next) => {
  try {
    const password = req.query.systemPassword || req.headers['x-system-password'];
    const settings = await readJSON(path.join(dirs.settings, 'system.json'), {});
    if (!comparePassword(password, settings.systemPasswordHash)) return res.status(403).json({ error: 'Maxfiy system parol noto‘g‘ri' });

    const fileName = `course-attendance-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => next(err));
    archive.pipe(res);
    archive.directory(DATA_DIR, 'data');
    archive.append(JSON.stringify({ exportedAt: nowISO(), app: 'course-attendance-crm', version: '2.0.0' }, null, 2), { name: 'backup-manifest.json' });
    await archive.finalize();
  } catch (err) { next(err); }
});

async function emptyDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(srcPath, destPath);
    else if (entry.isFile()) await fsp.copyFile(srcPath, destPath);
  }
}

app.post('/api/system/restore', requireAuth, attachUser, requireAdmin, upload.single('backup'), async (req, res, next) => {
  const tempDir = path.join(UPLOAD_DIR, `restore_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);
  try {
    const password = req.body.systemPassword;
    const settings = await readJSON(path.join(dirs.settings, 'system.json'), {});
    if (!comparePassword(password, settings.systemPasswordHash)) return res.status(403).json({ error: 'Maxfiy system parol noto‘g‘ri' });
    if (!req.file) return res.status(400).json({ error: 'ZIP fayl yuklanmadi' });

    await ensureDir(tempDir);
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const target = path.resolve(tempDir, entry.entryName);
      const rel = path.relative(tempDir, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(400).json({ error: 'ZIP faylda xavfli path bor' });
    }
    zip.extractAllTo(tempDir, true);

    const importedDataDir = path.join(tempDir, 'data');
    if (!(await fileExists(importedDataDir))) return res.status(400).json({ error: 'Bu ZIP tizim backup fayliga o‘xshamayapti: data papkasi yo‘q' });
    for (const folder of ['admins', 'teachers', 'students', 'groups', 'attendance', 'settings']) {
      if (!(await fileExists(path.join(importedDataDir, folder)))) {
        return res.status(400).json({ error: `Backup ichida ${folder} papkasi yo‘q` });
      }
    }

    await fsp.rm(DATA_DIR, { recursive: true, force: true });
    await copyDir(importedDataDir, DATA_DIR);
    sessions.clear();
    res.json({ ok: true, message: 'Backup qayta tiklandi. Qayta login qiling.' });
  } catch (err) {
    next(err);
  } finally {
    if (req.file) await deleteFileIfExists(req.file.path);
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post('/api/system/wipe', requireAuth, attachUser, requireAdmin, requireSystemPassword, async (req, res, next) => {
  try {
    await fsp.rm(DATA_DIR, { recursive: true, force: true });
    await seedFreshData({ withDemo: false });
    sessions.clear();
    res.json({ ok: true, message: `Barcha ma’lumotlar o‘chirildi. Admin login qayta yaratildi: ${DEFAULT_ADMIN_USERNAME} / ENVdagi ADMIN_PASSWORD yoki default parol` });
  } catch (err) { next(err); }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Server xatosi' });
});

initData().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Course attendance CRM running on ${HOST}:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
}).catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
