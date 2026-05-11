# Course Attendance CRM — sotuvga tayyor Node.js + Express loyiha

Bu loyiha o‘quv markazlar uchun minimalistik **davomat CRM**: admin, ustoz va o‘quvchi rollari, guruhlar, sana bo‘yicha davomat, XLSX/PDF eksport, ZIP backup/restore va Railway deploy sozlamalari bor.

## Imkoniyatlar

- Admin, ustoz, o‘quvchi rollari
- Admin ustoz/o‘quvchi/guruh yaratadi, tahrirlaydi va o‘chiradi
- Ustoz faqat o‘ziga biriktirilgan guruhlarda davomat belgilaydi
- O‘quvchi o‘z davomatini ko‘radi
- Davomat statuslari: `Keldi`, `Kelmadi`, `Sababli`, `Kechikdi`
- Sana qo‘shish: bugungi sana yoki calendar orqali istalgan sana
- Guruh davomatini XLSX/PDF eksport qilish
- Ustozlar va o‘quvchilar ro‘yxatini XLSX/PDF eksport qilish
- Admin uchun alohida `System / Backup` sahifasi
- ZIP backup olish va backupdan qayta tiklash
- File-based database: kichik/mid o‘quv markazlar uchun sodda o‘rnatiladi
- Railway Volume bilan persistent data saqlashga tayyor

## 2.1.0 da kuchaytirilgan joylar

- Railway uchun `0.0.0.0:$PORT` bind qilindi
- `RAILWAY_VOLUME_MOUNT_PATH` avtomatik ishlatiladi
- `/api/health` healthcheck endpoint qo‘shildi
- Login va system parol tekshirishda rate limit qo‘shildi
- Sessiyalar uchun TTL qo‘shildi
- `helmet` dependency qo‘shmasdan asosiy security headerlar qo‘shildi
- Backup ZIP paroli URL querydan olib tashlandi, header orqali yuboriladi
- ZIP restore path traversal himoyasi kuchaytirildi
- Entity ID path traversal himoyasi qo‘shildi
- Sana validatsiyasi faqat regex emas, real sana sifatida tekshiriladi
- `.env.example`, `.dockerignore`, `railway.json`, `package-lock.json` tayyorlandi
- Login oynasida demo parollar default holda yashirildi

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env
npm start
```

Brauzerda oching:

```txt
http://localhost:3000
```

## Default demo loginlar

Lokal demo uchun, agar `.env`da parollarni o‘zgartirmasangiz:

```txt
Admin:  admin / admin123
Ustoz:  ustoz1 / 12345
O‘quvchi: jasur / 12345
System parol: system123
```

> Real mijozga topshirishda `.env` yoki Railway Variables orqali `ADMIN_PASSWORD` va `SYSTEM_PASSWORD` ni albatta o‘zgartiring.

## Railway deploy

1. Loyihani GitHub repositoryga yuklang.
2. Railway → New Project → Deploy from GitHub repo.
3. Variables bo‘limiga quyidagilarni kiriting:

```txt
NODE_ENV=production
HOST=0.0.0.0
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong_admin_password
SYSTEM_PASSWORD=strong_system_password
SEED_DEMO=false
SHOW_DEMO_CREDENTIALS=false
SESSION_TTL_HOURS=12
BACKUP_UPLOAD_LIMIT_MB=15
```

4. Railway service uchun **Volume** qo‘shing.
5. Volume mount path sifatida quyidagini bering:

```txt
/app/data
```

Ilova Railway Volume ulanganini avtomatik sezadi va data fayllarni shu papkaga yozadi.

## Ma’lumotlar saqlanish joyi

```txt
data/
  admins/
  teachers/
  students/
  groups/
  attendance/
  settings/
  _tmp_uploads/
```

## Muhim production eslatma

Bu versiya kichik va o‘rta o‘quv markazlar uchun sotishga yaroqli MVP/ready product darajasiga keltirildi. Juda katta markazlar, ko‘p filiallar, minglab userlar yoki yuqori audit talabi bo‘lsa keyingi bosqichda quyidagilar tavsiya qilinadi:

- PostgreSQL database
- Payment/monthly billing moduli
- Audit log
- Role permission matrix
- Server-side PDF export
- Multi-branch/filial tizimi
- SMS/Telegram notification
- CSRF himoyasi bilan cookie-based auth

## Sotuvda qanday yozish mumkin

Soff.uz tavsifi uchun qisqa matn:

> O‘quv markazlar uchun tayyor Davomat CRM. Admin, ustoz va o‘quvchi rollari, guruhlar, dars sanalari, keldi-ketdi statuslari, XLSX/PDF eksport, ZIP backup/restore va Railway deploy sozlamalari mavjud. Node.js + Express backend, minimalistik UI, file database. O‘rnatish bo‘yicha README berilgan.

## Tekshirish

```bash
npm run check
npm start
```

Healthcheck:

```txt
GET /api/health
```
