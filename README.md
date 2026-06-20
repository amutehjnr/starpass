# ⭐ StarPass – Celebrity Meet & Greet Platform

A production-grade celebrity meet & greet platform built with Node.js, Express.js, MongoDB, EJS, and Custom CSS.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Seed Database
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Visit http://localhost:3000

## 🔑 Demo Accounts

| Role        | Email                        | Password        |
|-------------|------------------------------|-----------------|
| Super Admin | superadmin@starpass.com      | SuperAdmin@123! |
| Admin       | admin@demo.com               | Demo@1234       |
| Fan         | fan@demo.com                 | Demo@1234       |
| Celebrity   | celebrity@demo.com           | Demo@1234       |

## 📦 Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB Atlas + Mongoose
- **Auth**: JWT + Refresh Tokens + RBAC
- **Storage**: Cloudinary
- **Email**: Nodemailer
- **PDF**: PDFKit
- **Real-time**: Socket.IO
- **Security**: Helmet, Rate Limiting, CSRF, XSS, Mongo Sanitize
- **Frontend**: EJS + Custom CSS + Vanilla JS

## 🏗️ Project Structure

```
starpass/
├── config/          # DB, Cloudinary, Socket.IO, Logger
├── controllers/     # Business logic (auth, fan, celebrity, admin, public)
├── middleware/      # Auth, CSRF, validation, error handler, rate limiter, audit
├── models/          # Mongoose schemas (User, Celebrity, Event, Ticket, GiftCard, etc.)
├── routes/          # Express routes
├── services/        # Email, PDF, QR code, notifications
├── utils/           # Seeder
├── views/           # EJS templates (public, auth, fan, celebrity, admin, partials)
├── public/          # CSS (design system), JS, images
├── app.js           # Express app configuration
├── server.js        # Entry point
└── render.yaml      # Render deployment config
```

## 🎯 Key Features

- **7 User Roles**: Fan, Celebrity, Manager, Organizer, Moderator, Admin, Super Admin
- **Gift Card Payments**: Upload & admin review workflow with fraud detection
- **Ticket System**: QR codes, PDF downloads, check-in scanner
- **Fan Clubs**: Posts, exclusive content, member management
- **Real-Time**: Socket.IO notifications and check-in dashboard
- **Security**: Helmet CSP, CSRF, rate limiting, bcrypt, JWT rotation
- **Email**: Transactional emails via Nodemailer with branded HTML templates

## 🚀 Deploy to Render

1. Push to GitHub
2. Create Render Web Service
3. Set environment variables from `.env.example`
4. Deploy!
