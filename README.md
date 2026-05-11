# Davomat CRM — Python Backend Version

Bu versiya Railway uchun Python-only backend bilan tayyorlandi. `node_modules`, `npm install`, `express` kerak emas.

## Railway Variables

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=kuchli_admin_parol
SYSTEM_PASSWORD=kuchli_system_parol
SEED_DEMO=false
SHOW_DEMO_CREDENTIALS=false
SESSION_TTL_HOURS=12
BACKUP_UPLOAD_LIMIT_MB=15
```

## Start

```bash
python app.py
```

Railway `PORT`ni o‘zi beradi. App `0.0.0.0:$PORT`da ishga tushadi.
