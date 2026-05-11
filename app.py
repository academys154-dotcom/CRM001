#!/usr/bin/env python3
# Python-only Davomat CRM backend. No external packages are required.
import json
import os
import re
import secrets
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from hashlib import pbkdf2_hmac
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote

APP_VERSION = "3.0.0-python"
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = Path(os.environ.get("DATA_DIR") or os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or (BASE_DIR / "data")).resolve()
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR") or (DATA_DIR / "_tmp_uploads")).resolve()

DEFAULT_ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
DEFAULT_SYSTEM_PASSWORD = os.environ.get("SYSTEM_PASSWORD", "system123")
SEED_DEMO = os.environ.get("SEED_DEMO", "true").lower() != "false"
SHOW_DEMO_CREDENTIALS = os.environ.get("SHOW_DEMO_CREDENTIALS", "false").lower() == "true"
SESSION_TTL_SECONDS = int(float(os.environ.get("SESSION_TTL_HOURS", "12")) * 3600)
BACKUP_UPLOAD_LIMIT_MB = int(os.environ.get("BACKUP_UPLOAD_LIMIT_MB", "15"))

DIRS = {
    "admins": DATA_DIR / "admins",
    "teachers": DATA_DIR / "teachers",
    "students": DATA_DIR / "students",
    "groups": DATA_DIR / "groups",
    "attendance": DATA_DIR / "attendance",
    "settings": DATA_DIR / "settings",
}

SESSIONS = {}
RATE_BUCKETS = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def json_error(message, status=400):
    return {"error": message}, status


def clean_text(value, max_len=120):
    return str(value or "").strip()[:max_len]


def safe_entity_id(value):
    text = str(value or "").strip()
    if not re.match(r"^[A-Za-z0-9_-]{1,80}$", text):
        raise ValueError("ID formati noto‘g‘ri")
    return text


def entity_file(kind, entity_id):
    if kind not in DIRS:
        raise ValueError("Unknown entity type")
    clean_id = safe_entity_id(entity_id)
    file_path = (DIRS[kind] / f"{clean_id}.json").resolve()
    base = DIRS[kind].resolve()
    if base not in file_path.parents and file_path != base:
        raise ValueError("Fayl yo‘li xavfsiz emas")
    return file_path


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)


def read_json(file_path, fallback=None):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def write_json(file_path, value):
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(file_path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
    tmp.replace(file_path)


def list_json(dir_path):
    Path(dir_path).mkdir(parents=True, exist_ok=True)
    rows = []
    for file_path in sorted(Path(dir_path).glob("*.json")):
        item = read_json(file_path)
        if item is not None:
            rows.append(item)
    return rows


def make_id(prefix):
    return f"{prefix}_{secrets.token_hex(4)}_{int(time.time()*1000):x}"


def hash_password(password):
    salt = secrets.token_hex(16)
    rounds = 120000
    digest = pbkdf2_hmac("sha256", str(password or "").encode(), salt.encode(), rounds).hex()
    return f"pbkdf2_sha256${rounds}${salt}${digest}"


def compare_password(password, stored_hash):
    if not stored_hash:
        return False
    if str(stored_hash).startswith("pbkdf2_sha256$"):
        try:
            _algo, rounds, salt, expected = str(stored_hash).split("$", 3)
            digest = pbkdf2_hmac("sha256", str(password or "").encode(), salt.encode(), int(rounds)).hex()
            return secrets.compare_digest(digest, expected)
        except Exception:
            return False
    # Legacy Node bcrypt hashes cannot be verified without bcrypt dependency.
    return False


def clean_user(user):
    if not user:
        return None
    return {k: v for k, v in user.items() if k != "passwordHash"}


def get_all_data():
    return {
        "admins": list_json(DIRS["admins"]),
        "teachers": list_json(DIRS["teachers"]),
        "students": list_json(DIRS["students"]),
        "groups": list_json(DIRS["groups"]),
        "attendance": list_json(DIRS["attendance"]),
        "settings": read_json(DIRS["settings"] / "system.json", {}),
    }


def get_public_state(user):
    all_data = get_all_data()
    admins = [clean_user(x) for x in all_data["admins"]]
    teachers = [clean_user(x) for x in all_data["teachers"]]
    students = [clean_user(x) for x in all_data["students"]]
    groups = all_data["groups"]
    attendance = all_data["attendance"]

    if user.get("role") == "admin":
        return {"me": clean_user(user), "admins": admins, "teachers": teachers, "students": students, "groups": groups, "attendance": attendance}
    if user.get("role") == "teacher":
        my_groups = [g for g in groups if user["id"] in (g.get("teacherIds") or [])]
        student_ids = {sid for g in my_groups for sid in (g.get("studentIds") or [])}
        return {
            "me": clean_user(user), "admins": [], "teachers": [clean_user(user)],
            "students": [s for s in students if s.get("id") in student_ids],
            "groups": my_groups,
            "attendance": [a for a in attendance if any(g.get("id") == a.get("groupId") for g in my_groups)]
        }
    my_groups = [g for g in groups if user.get("id") in (g.get("studentIds") or [])]
    return {
        "me": clean_user(user), "admins": [],
        "teachers": [t for t in teachers if any(t.get("id") in (g.get("teacherIds") or []) for g in my_groups)],
        "students": [clean_user(user)], "groups": my_groups,
        "attendance": [a for a in attendance if any(g.get("id") == a.get("groupId") for g in my_groups)]
    }


def all_users():
    d = get_all_data()
    return d["admins"] + d["teachers"] + d["students"]


def find_user_by_username(username):
    normalized = str(username or "").strip().lower()
    return next((u for u in all_users() if str(u.get("username", "")).strip().lower() == normalized), None)


def find_user_by_id(user_id):
    return next((u for u in all_users() if u.get("id") == user_id), None)


def ensure_unique_username(username, except_id=""):
    user = find_user_by_username(username)
    if user and user.get("id") != except_id:
        raise Conflict("Bu username allaqachon band")


def validate_required(body, fields):
    for f in fields:
        if not str(body.get(f, "")).strip():
            raise BadRequest(f"{f} kiritilishi kerak")


def assert_password(password, label="Parol"):
    if len(str(password or "")) < 5:
        raise BadRequest(f"{label} kamida 5 ta belgidan iborat bo‘lsin")


def validate_date(value):
    text = str(value or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        raise BadRequest("Sana YYYY-MM-DD formatda bo‘lishi kerak")
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        raise BadRequest("Sana haqiqiy bo‘lishi kerak")


def safe_id_array(value):
    if not isinstance(value, list):
        return []
    seen, result = set(), []
    for item in value:
        sid = safe_entity_id(item)
        if sid not in seen:
            seen.add(sid)
            result.append(sid)
    return result


def sort_dates(dates):
    return sorted(set(dates or []))


def seed_fresh_data(with_demo=True):
    ensure_dirs()
    admin = {
        "id": "admin_main", "role": "admin",
        "firstName": os.environ.get("ADMIN_FIRST_NAME", "Smart"),
        "lastName": os.environ.get("ADMIN_LAST_NAME", "Admin"),
        "username": DEFAULT_ADMIN_USERNAME,
        "passwordHash": hash_password(DEFAULT_ADMIN_PASSWORD),
        "phone": os.environ.get("ADMIN_PHONE", "+998 90 000 00 00"),
        "createdAt": now_iso(), "updatedAt": now_iso()
    }
    write_json(entity_file("admins", "admin_main"), admin)
    write_json(DIRS["settings"] / "system.json", {
        "systemPasswordHash": hash_password(DEFAULT_SYSTEM_PASSWORD),
        "defaultSystemPasswordHint": "system123" if DEFAULT_SYSTEM_PASSWORD == "system123" else "ENV orqali berilgan",
        "updatedAt": now_iso()
    })
    if not with_demo:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    teacher_id, s1, s2, s3, group_id = "teacher_demo_1", "student_demo_1", "student_demo_2", "student_demo_3", "group_demo_1"
    write_json(entity_file("teachers", teacher_id), {"id": teacher_id, "role": "teacher", "firstName": "Azizbek", "lastName": "Karimov", "username": "ustoz1", "passwordHash": hash_password("12345"), "phone": "+998 90 123 45 67", "createdAt": now_iso(), "updatedAt": now_iso()})
    for sid, first, last, phone in [(s1, "Jasur", "Aliyev", "+998 91 111 22 33"), (s2, "Madina", "Sobirova", "+998 93 222 33 44"), (s3, "Aziza", "Tursunova", "+998 94 333 44 55")]:
        write_json(entity_file("students", sid), {"id": sid, "role": "student", "firstName": first, "lastName": last, "username": first.lower(), "passwordHash": hash_password("12345"), "phone": phone, "groupId": group_id, "createdAt": now_iso(), "updatedAt": now_iso()})
    write_json(entity_file("groups", group_id), {"id": group_id, "name": "IELTS Foundation A1", "teacherIds": [teacher_id], "studentIds": [s1, s2, s3], "createdAt": now_iso(), "updatedAt": now_iso()})
    write_json(entity_file("attendance", group_id), {"groupId": group_id, "dates": [today], "records": {s1: {today: {"status": "present", "note": "", "updatedAt": now_iso(), "by": "seed"}}, s2: {today: {"status": "absent", "note": "Xabar berilmagan", "updatedAt": now_iso(), "by": "seed"}}, s3: {today: {"status": "excused", "note": "Oilaviy sabab", "updatedAt": now_iso(), "by": "seed"}}}, "createdAt": now_iso(), "updatedAt": now_iso()})


def init_data():
    ensure_dirs()
    if not list(DIRS["admins"].glob("*.json")):
        seed_fresh_data(SEED_DEMO)
    if not (DIRS["settings"] / "system.json").exists():
        write_json(DIRS["settings"] / "system.json", {"systemPasswordHash": hash_password(DEFAULT_SYSTEM_PASSWORD), "defaultSystemPasswordHint": "system123" if DEFAULT_SYSTEM_PASSWORD == "system123" else "ENV orqali berilgan", "updatedAt": now_iso()})


class HTTPError(Exception):
    status = 400

class BadRequest(HTTPError):
    status = 400

class Unauthorized(HTTPError):
    status = 401

class Forbidden(HTTPError):
    status = 403

class NotFound(HTTPError):
    status = 404

class Conflict(HTTPError):
    status = 409


def prune_sessions():
    cutoff = time.time() - SESSION_TTL_SECONDS
    for token in list(SESSIONS.keys()):
        if SESSIONS[token].get("createdAtTs", 0) < cutoff:
            del SESSIONS[token]


def rate_limit(ip, prefix, window=15*60, max_count=30):
    key = f"{prefix}:{ip}"
    now = time.time()
    bucket = RATE_BUCKETS.get(key, {"count": 0, "resetAt": now + window})
    if now > bucket["resetAt"]:
        bucket = {"count": 0, "resetAt": now + window}
    bucket["count"] += 1
    RATE_BUCKETS[key] = bucket
    if bucket["count"] > max_count:
        raise HTTPError("Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.")


def can_access_group(user, group):
    if not group:
        return False
    if user.get("role") == "admin":
        return True
    if user.get("role") == "teacher":
        return user.get("id") in (group.get("teacherIds") or [])
    if user.get("role") == "student":
        return user.get("id") in (group.get("studentIds") or [])
    return False


def remove_from_groups(kind, entity_id):
    for group in list_json(DIRS["groups"]):
        if kind == "teacher":
            group["teacherIds"] = [x for x in (group.get("teacherIds") or []) if x != entity_id]
        elif kind == "student":
            group["studentIds"] = [x for x in (group.get("studentIds") or []) if x != entity_id]
        group["updatedAt"] = now_iso()
        write_json(entity_file("groups", group["id"]), group)


def verify_entity_access(user, kind, entity_id):
    item = read_json(entity_file(kind, entity_id))
    if not item:
        raise NotFound("Ma’lumot topilmadi")
    if user.get("role") != "admin":
        raise Forbidden("Ruxsat yo‘q")
    return item


class CRMHandler(SimpleHTTPRequestHandler):
    server_version = "DavomatCRM-Python/3.0"

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8") or "{}")

    def get_user(self):
        prune_sessions()
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        session = SESSIONS.get(token)
        if not session:
            raise Unauthorized("Avval tizimga kiring")
        user = find_user_by_id(session["userId"])
        if not user:
            raise Unauthorized("Foydalanuvchi topilmadi")
        session["lastSeenAt"] = now_iso()
        return user, token

    def require_admin(self, user):
        if user.get("role") != "admin":
            raise Forbidden("Bu amal faqat admin uchun")

    def verify_system_password(self, password):
        settings = read_json(DIRS["settings"] / "system.json", {})
        if not compare_password(password, settings.get("systemPasswordHash")):
            raise Forbidden("Maxfiy system parol noto‘g‘ri")

    def handle_error(self, exc):
        if isinstance(exc, HTTPError):
            status = getattr(exc, "status", 400)
            msg = str(exc) or "Xatolik"
        elif isinstance(exc, ValueError):
            status, msg = 400, str(exc) or "Noto‘g‘ri ma’lumot"
        else:
            status, msg = 500, str(exc) or "Server xatosi"
            print("SERVER ERROR:", repr(exc), file=sys.stderr)
        self.send_json({"error": msg}, status)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query = {k: v[0] if v else "" for k, v in parse_qs(parsed.query).items()}
            if path == "/api/health":
                return self.send_json({"ok": True, "app": "course-attendance-crm", "version": APP_VERSION, "time": now_iso()})
            if path == "/api/public-config":
                return self.send_json({"showDemoCredentials": SHOW_DEMO_CREDENTIALS})
            if path == "/api/state":
                user, _ = self.get_user()
                return self.send_json(get_public_state(user))
            if path == "/api/system/backup.zip":
                user, _ = self.get_user(); self.require_admin(user)
                self.verify_system_password(self.headers.get("x-system-password") or query.get("systemPassword", ""))
                return self.send_backup_zip()
            if path.startswith("/api/"):
                raise NotFound("API topilmadi")
            return self.serve_static(path)
        except Exception as exc:
            return self.handle_error(exc)

    def do_POST(self):
        try:
            parsed = urlparse(self.path); path = parsed.path
            if path == "/api/login":
                rate_limit(self.client_address[0], "login")
                body = self.read_json_body()
                user = find_user_by_username(body.get("username"))
                if not user or not compare_password(body.get("password"), user.get("passwordHash")):
                    raise Unauthorized("Username yoki parol noto‘g‘ri")
                token = secrets.token_hex(32)
                SESSIONS[token] = {"token": token, "userId": user["id"], "createdAt": now_iso(), "createdAtTs": time.time(), "lastSeenAt": now_iso()}
                return self.send_json({"token": token, "user": clean_user(user), "state": get_public_state(user)})
            if path == "/api/logout":
                _user, token = self.get_user(); SESSIONS.pop(token, None)
                return self.send_json({"ok": True})
            if path == "/api/teachers":
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body()
                validate_required(body, ["firstName", "lastName", "username", "password"]); assert_password(body.get("password")); ensure_unique_username(body.get("username"))
                teacher = {"id": make_id("teacher"), "role": "teacher", "firstName": clean_text(body.get("firstName")), "lastName": clean_text(body.get("lastName")), "username": clean_text(body.get("username"), 60), "passwordHash": hash_password(body.get("password")), "phone": clean_text(body.get("phone"), 40), "createdAt": now_iso(), "updatedAt": now_iso()}
                write_json(entity_file("teachers", teacher["id"]), teacher)
                return self.send_json({"ok": True, "teacher": clean_user(teacher), "state": get_public_state(user)})
            if path == "/api/students":
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body()
                validate_required(body, ["firstName", "lastName", "username", "password"]); assert_password(body.get("password")); ensure_unique_username(body.get("username"))
                student = {"id": make_id("student"), "role": "student", "firstName": clean_text(body.get("firstName")), "lastName": clean_text(body.get("lastName")), "username": clean_text(body.get("username"), 60), "passwordHash": hash_password(body.get("password")), "phone": clean_text(body.get("phone"), 40), "groupId": clean_text(body.get("groupId"), 80), "createdAt": now_iso(), "updatedAt": now_iso()}
                write_json(entity_file("students", student["id"]), student)
                if student["groupId"]:
                    group = read_json(entity_file("groups", student["groupId"]))
                    if group:
                        group["studentIds"] = sorted(set((group.get("studentIds") or []) + [student["id"]])); group["updatedAt"] = now_iso(); write_json(entity_file("groups", group["id"]), group)
                return self.send_json({"ok": True, "student": clean_user(student), "state": get_public_state(user)})
            if path == "/api/groups":
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body(); validate_required(body, ["name"])
                group = {"id": make_id("group"), "name": clean_text(body.get("name"), 120), "teacherIds": safe_id_array(body.get("teacherIds")), "studentIds": safe_id_array(body.get("studentIds")), "createdAt": now_iso(), "updatedAt": now_iso()}
                write_json(entity_file("groups", group["id"]), group)
                write_json(entity_file("attendance", group["id"]), {"groupId": group["id"], "dates": [], "records": {}, "createdAt": now_iso(), "updatedAt": now_iso()})
                for st in list_json(DIRS["students"]):
                    if st.get("id") in group["studentIds"]:
                        st["groupId"] = group["id"]; st["updatedAt"] = now_iso(); write_json(entity_file("students", st["id"]), st)
                return self.send_json({"ok": True, "group": group, "state": get_public_state(user)})
            m = re.match(r"^/api/groups/([^/]+)/dates$", path)
            if m:
                user, _ = self.get_user(); body = self.read_json_body(); group_id = unquote(m.group(1)); group = read_json(entity_file("groups", group_id))
                if not can_access_group(user, group) or user.get("role") == "student": raise Forbidden("Bu guruhga ruxsat yo‘q")
                date = clean_text(body.get("date")); validate_date(date)
                attendance = read_json(entity_file("attendance", group["id"]), {"groupId": group["id"], "dates": [], "records": {}, "createdAt": now_iso()})
                attendance["dates"] = sort_dates((attendance.get("dates") or []) + [date]); attendance["updatedAt"] = now_iso(); write_json(entity_file("attendance", group["id"]), attendance)
                return self.send_json({"ok": True, "attendance": attendance, "state": get_public_state(user)})
            if path == "/api/system/verify":
                rate_limit(self.client_address[0], "system")
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body(); self.verify_system_password(body.get("systemPassword")); return self.send_json({"ok": True})
            if path == "/api/system/change-password":
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body(); self.verify_system_password(body.get("systemPassword")); assert_password(body.get("newPassword"), "Yangi system parol")
                settings = read_json(DIRS["settings"] / "system.json", {}); settings["systemPasswordHash"] = hash_password(body.get("newPassword")); settings["defaultSystemPasswordHint"] = "O‘zgartirilgan"; settings["updatedAt"] = now_iso(); write_json(DIRS["settings"] / "system.json", settings); return self.send_json({"ok": True})
            if path == "/api/system/wipe":
                user, _ = self.get_user(); self.require_admin(user); body = self.read_json_body(); self.verify_system_password(body.get("systemPassword")); shutil.rmtree(DATA_DIR, ignore_errors=True); seed_fresh_data(False); SESSIONS.clear(); return self.send_json({"ok": True, "message": f"Barcha ma’lumotlar o‘chirildi. Admin login qayta yaratildi: {DEFAULT_ADMIN_USERNAME}"})
            if path == "/api/system/restore":
                return self.restore_backup()
            raise NotFound("API topilmadi")
        except Exception as exc:
            return self.handle_error(exc)

    def do_PUT(self):
        try:
            parsed = urlparse(self.path); path = parsed.path; body = self.read_json_body()
            user, _ = self.get_user()
            m = re.match(r"^/api/teachers/([^/]+)$", path)
            if m:
                self.require_admin(user); teacher = verify_entity_access(user, "teachers", unquote(m.group(1))); validate_required(body, ["firstName", "lastName", "username"]); ensure_unique_username(body.get("username"), teacher["id"])
                teacher.update({"firstName": clean_text(body.get("firstName")), "lastName": clean_text(body.get("lastName")), "username": clean_text(body.get("username"), 60), "phone": clean_text(body.get("phone"), 40), "updatedAt": now_iso()})
                if str(body.get("password") or "").strip(): assert_password(body.get("password")); teacher["passwordHash"] = hash_password(body.get("password"))
                write_json(entity_file("teachers", teacher["id"]), teacher); return self.send_json({"ok": True, "teacher": clean_user(teacher), "state": get_public_state(user)})
            m = re.match(r"^/api/students/([^/]+)$", path)
            if m:
                self.require_admin(user); student = verify_entity_access(user, "students", unquote(m.group(1))); validate_required(body, ["firstName", "lastName", "username"]); ensure_unique_username(body.get("username"), student["id"])
                old_group = student.get("groupId", "")
                student.update({"firstName": clean_text(body.get("firstName")), "lastName": clean_text(body.get("lastName")), "username": clean_text(body.get("username"), 60), "phone": clean_text(body.get("phone"), 40), "groupId": clean_text(body.get("groupId"), 80), "updatedAt": now_iso()})
                if str(body.get("password") or "").strip(): assert_password(body.get("password")); student["passwordHash"] = hash_password(body.get("password"))
                write_json(entity_file("students", student["id"]), student)
                if old_group and old_group != student.get("groupId"):
                    g = read_json(entity_file("groups", old_group));
                    if g: g["studentIds"] = [x for x in (g.get("studentIds") or []) if x != student["id"]]; g["updatedAt"] = now_iso(); write_json(entity_file("groups", g["id"]), g)
                if student.get("groupId"):
                    g = read_json(entity_file("groups", student["groupId"]));
                    if g: g["studentIds"] = sorted(set((g.get("studentIds") or []) + [student["id"]])); g["updatedAt"] = now_iso(); write_json(entity_file("groups", g["id"]), g)
                return self.send_json({"ok": True, "student": clean_user(student), "state": get_public_state(user)})
            m = re.match(r"^/api/groups/([^/]+)$", path)
            if m:
                self.require_admin(user); group = verify_entity_access(user, "groups", unquote(m.group(1))); validate_required(body, ["name"]); old_students = set(group.get("studentIds") or [])
                group.update({"name": clean_text(body.get("name"), 120), "teacherIds": safe_id_array(body.get("teacherIds")), "studentIds": safe_id_array(body.get("studentIds")), "updatedAt": now_iso()}); write_json(entity_file("groups", group["id"]), group)
                for st in list_json(DIRS["students"]):
                    should, was = st.get("id") in group["studentIds"], st.get("id") in old_students
                    if should or was: st["groupId"] = group["id"] if should else ""; st["updatedAt"] = now_iso(); write_json(entity_file("students", st["id"]), st)
                return self.send_json({"ok": True, "group": group, "state": get_public_state(user)})
            if path == "/api/attendance":
                group_id, student_id, date = body.get("groupId"), body.get("studentId"), body.get("date"); validate_date(date); status = clean_text(body.get("status")); note = clean_text(body.get("note"), 500)
                if status not in ["", "present", "absent", "late", "excused"]: raise BadRequest("Status noto‘g‘ri")
                group = read_json(entity_file("groups", group_id))
                if not can_access_group(user, group) or user.get("role") == "student": raise Forbidden("Bu guruhga ruxsat yo‘q")
                if student_id not in (group.get("studentIds") or []): raise BadRequest("O‘quvchi bu guruhda emas")
                attendance = read_json(entity_file("attendance", group_id), {"groupId": group_id, "dates": [], "records": {}, "createdAt": now_iso()})
                attendance["dates"] = sort_dates((attendance.get("dates") or []) + [date]); attendance.setdefault("records", {}).setdefault(student_id, {})
                if not status: attendance["records"][student_id].pop(date, None)
                else: attendance["records"][student_id][date] = {"status": status, "note": note, "updatedAt": now_iso(), "by": user["id"]}
                attendance["updatedAt"] = now_iso(); write_json(entity_file("attendance", group_id), attendance); return self.send_json({"ok": True, "attendance": attendance, "state": get_public_state(user)})
            raise NotFound("API topilmadi")
        except Exception as exc:
            return self.handle_error(exc)

    def do_DELETE(self):
        try:
            parsed = urlparse(self.path); path = parsed.path
            user, _ = self.get_user()
            m = re.match(r"^/api/teachers/([^/]+)$", path)
            if m:
                self.require_admin(user); entity_id = unquote(m.group(1)); verify_entity_access(user, "teachers", entity_id); remove_from_groups("teacher", entity_id); entity_file("teachers", entity_id).unlink(missing_ok=True); return self.send_json({"ok": True, "state": get_public_state(user)})
            m = re.match(r"^/api/students/([^/]+)$", path)
            if m:
                self.require_admin(user); entity_id = unquote(m.group(1)); verify_entity_access(user, "students", entity_id); remove_from_groups("student", entity_id)
                for att in list_json(DIRS["attendance"]):
                    if att.get("records", {}).get(entity_id) is not None: att["records"].pop(entity_id, None); att["updatedAt"] = now_iso(); write_json(entity_file("attendance", att["groupId"]), att)
                entity_file("students", entity_id).unlink(missing_ok=True); return self.send_json({"ok": True, "state": get_public_state(user)})
            m = re.match(r"^/api/groups/([^/]+)$", path)
            if m:
                self.require_admin(user); group_id = unquote(m.group(1)); verify_entity_access(user, "groups", group_id)
                for st in list_json(DIRS["students"]):
                    if st.get("groupId") == group_id: st["groupId"] = ""; st["updatedAt"] = now_iso(); write_json(entity_file("students", st["id"]), st)
                entity_file("groups", group_id).unlink(missing_ok=True); entity_file("attendance", group_id).unlink(missing_ok=True); return self.send_json({"ok": True, "state": get_public_state(user)})
            m = re.match(r"^/api/groups/([^/]+)/dates/([^/]+)$", path)
            if m:
                group_id, date = unquote(m.group(1)), unquote(m.group(2)); validate_date(date); group = read_json(entity_file("groups", group_id))
                if not can_access_group(user, group) or user.get("role") == "student": raise Forbidden("Bu guruhga ruxsat yo‘q")
                att = read_json(entity_file("attendance", group_id), {"groupId": group_id, "dates": [], "records": {}}); att["dates"] = [d for d in (att.get("dates") or []) if d != date]
                for sid in list((att.get("records") or {}).keys()): att["records"].get(sid, {}).pop(date, None)
                att["updatedAt"] = now_iso(); write_json(entity_file("attendance", group_id), att); return self.send_json({"ok": True, "state": get_public_state(user)})
            raise NotFound("API topilmadi")
        except Exception as exc:
            return self.handle_error(exc)

    def serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        target = (PUBLIC_DIR / rel).resolve()
        if PUBLIC_DIR.resolve() not in target.parents and target != PUBLIC_DIR.resolve():
            raise Forbidden("Ruxsat yo‘q")
        if target.exists() and target.is_file():
            self.path = "/" + rel
            self.directory = str(PUBLIC_DIR)
            return SimpleHTTPRequestHandler.do_GET(self)
        # SPA fallback
        self.path = "/index.html"
        self.directory = str(PUBLIC_DIR)
        return SimpleHTTPRequestHandler.do_GET(self)

    def send_backup_zip(self):
        import io
        bio = io.BytesIO()
        with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in DATA_DIR.rglob("*"):
                if p.is_file() and UPLOAD_DIR not in p.parents:
                    zf.write(p, p.relative_to(DATA_DIR.parent))
            zf.writestr("backup-manifest.json", json.dumps({"exportedAt": now_iso(), "app": "course-attendance-crm", "version": APP_VERSION}, ensure_ascii=False, indent=2))
        data = bio.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="course-attendance-backup-{datetime.now().strftime("%Y-%m-%d")}.zip"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


    def parse_multipart(self, raw, boundary):
        fields, files = {}, {}
        marker = b"--" + boundary
        for part in raw.split(marker):
            part = part.strip()
            if not part or part == b"--":
                continue
            if part.endswith(b"--"):
                part = part[:-2].strip()
            header_blob, sep, body = part.partition(b"\r\n\r\n")
            if not sep:
                header_blob, sep, body = part.partition(b"\n\n")
            if not sep:
                continue
            headers = header_blob.decode("utf-8", "ignore")
            name_match = re.search(r'name="([^"]+)"', headers)
            if not name_match:
                continue
            name = name_match.group(1)
            if body.endswith(b"\r\n"):
                body = body[:-2]
            elif body.endswith(b"\n"):
                body = body[:-1]
            if 'filename="' in headers:
                files[name] = body
            else:
                fields[name] = body.decode("utf-8", "ignore")
        return fields, files

    def restore_backup(self):
        user, _ = self.get_user(); self.require_admin(user)
        content_type = self.headers.get("Content-Type", "")
        match = re.search(r"multipart/form-data;\s*boundary=(.+)", content_type)
        if not match:
            raise BadRequest("Form-data kerak")
        boundary_text = match.group(1).strip().strip('"')
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > BACKUP_UPLOAD_LIMIT_MB * 1024 * 1024:
            raise BadRequest("ZIP hajmi limitdan katta")
        raw = self.rfile.read(length)
        fields, files = self.parse_multipart(raw, boundary_text.encode())
        password = fields.get("systemPassword", "")
        self.verify_system_password(password)
        backup_bytes = files.get("backup")
        if not backup_bytes:
            raise BadRequest("ZIP fayl yuklanmadi")
        temp = UPLOAD_DIR / f"restore_{int(time.time())}_{secrets.token_hex(3)}"; temp.mkdir(parents=True, exist_ok=True)
        zip_path = temp / "backup.zip"
        with open(zip_path, "wb") as f: f.write(backup_bytes)
        with zipfile.ZipFile(zip_path, "r") as zf:
            for name in zf.namelist():
                dest = (temp / name).resolve()
                if temp.resolve() not in dest.parents and dest != temp.resolve(): raise BadRequest("ZIP faylda xavfli path bor")
            zf.extractall(temp)
        imported = temp / "data"
        if not imported.exists(): raise BadRequest("Bu ZIP tizim backup fayliga o‘xshamayapti: data papkasi yo‘q")
        for folder in ["admins", "teachers", "students", "groups", "attendance", "settings"]:
            if not (imported / folder).exists(): raise BadRequest(f"Backup ichida {folder} papkasi yo‘q")
        shutil.rmtree(DATA_DIR, ignore_errors=True)
        shutil.copytree(imported, DATA_DIR)
        SESSIONS.clear()
        shutil.rmtree(temp, ignore_errors=True)
        return self.send_json({"ok": True, "message": "Backup qayta tiklandi. Qayta login qiling."})


def main():
    init_data()
    port = int(os.environ.get("PORT", "8000"))
    host = "0.0.0.0"
    print(f"Davomat CRM Python backend running on {host}:{port}")
    print(f"Data directory: {DATA_DIR}")
    ThreadingHTTPServer((host, port), CRMHandler).serve_forever()


if __name__ == "__main__":
    main()
