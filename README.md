# Davomat CRM — Railway Python Clean Final

O‘quv markazlar uchun Davomat CRM web tizimi.

## Railway deploy
1. ZIP faylni Railway `Add files via upload` orqali yuklang.
2. Variables bo‘limiga `.env.example` ichidagi qiymatlarni kiriting.
3. Deploy tugagach `Settings -> Networking -> Generate Domain` bosing.

## Start command
Railway avtomatik ishlatadi:

```bash
python app.py
```

## Muhim
Bu versiyada Node.js, npm, package.json, node_modules, Express, dotenv yo‘q. Railway Python app sifatida deploy qiladi.

## Login
Default:
- username: admin
- password: Railway Variables ichidagi `ADMIN_PASSWORD`

## Lokal ishga tushirish
```bash
python app.py
```
Keyin: http://127.0.0.1:8000
