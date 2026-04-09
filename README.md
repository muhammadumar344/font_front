# School Fond Management System - Backend

Maktabning fond hisob-kitob tizimi uchun Backend API.

## O'rnatish

```bash
npm install
```

## .env fayl sozlamasi

```
MONGODB_URI=mongodb://localhost:27017/school_fond
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_change_this
```

## Server ishga tushirish

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Teacher (O'qituvchi)
- `POST /api/teachers/register` - Ro'yxatdan o'tish
- `POST /api/teachers/login` - Login

### Classes (Sinflar)
- `GET /api/classes` - Hamma sinflarni chiqarish
- `POST /api/classes` - Yangi sinf yaratish
- `GET /api/classes/:classId/report` - Sinf uchun oylik to'lovlar jadvalini chiqarish

### Students (Talabalar)
- `GET /api/students` - Hamma talabalarni chiqarish
- `POST /api/students` - Yangi talaba qo'shish
- `GET /api/students/class/:classId` - Sinf uchun talabalarni chiqarish

### Monthly Payments (Oylik To'lovlar)
- `POST /api/payments/create-monthly` - Yangi oy uchun to'lovlarni yaratish (hamma not_paid)
- `PUT /api/payments/:paymentId/status` - To'lov statusini o'zgartirish (paid/not_paid)
- `GET /api/payments/unpaid/:classId` - Tolangan bo'lmagan talabalarni chiqarish

### Expenses (Xarajatlar)
- `POST /api/expenses` - Xarajat qo'shish
- `GET /api/expenses/:classId/:month/:year` - Oy uchun barcha xarajatlarni chiqarish

## MongoDB kerakli sozlamalar

MongoDB server ishga tushirish (Windows):

```bash
mongod --dbpath "C:\data\db"
```

Yoki MongoDB Atlas cloud service foydalanish:

```
mongodb+srv://<username>:<password>@cluster.mongodb.net/school_fond
```

## Keyingi qadamlar

- [ ] Frontend ro'yxatdan o'tish va login tizimi
- [ ] Frontend sinf va talaba boshqarishi
- [ ] Frontend oylik to'lovlar jadvalini chiqarish
- [ ] Email xabarnomalar (tolangan bo'lmaganlarga)
- [ ] Authentication middleware

