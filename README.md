# THE AURORA PROTOCOL — EVENT MANAGEMENT & CROWD CONTROL PLATFORM

A high-performance, real-time event crowd management platform built for **THE AURORA PROTOCOL** college investigation competition.

---

## ⚡ Tech Stack

- **Frontend**: React (Vite SPA) + Vanilla CSS Cyberpunk/Investigation Design System
- **Backend**: Node.js + Express (listening on `0.0.0.0` and `$PORT`)
- **Database**: TiDB Cloud (MySQL-compatible distributed database)
- **Driver**: `mysql2` with TLS/SSL enabled
- **Real-Time Engine**: Socket.IO WebSockets (instant leaderboard updates without page reload)
- **Authentication**: `bcryptjs` + JWT (Cookie & Bearer Token)
- **Deployment**: Render Free Web Service

---

## 🎯 Architecture & Workflow

```
[Team QR Badge]
      │
      ▼
[Room Volunteer Phone Scanner] ───► [Backend Access Validation]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       [First Entry in Round]                      [Duplicate / Eliminated]
                   │                                           │
            ACCESS GRANTED                              ACCESS DENIED
                   │
                   ▼
     [Server-Authoritative Countdown]
                   │
                   ▼
              TIME'S UP
                   │
                   ▼
   [Score Awarded by Head Admin] ───► [Live Socket.IO Leaderboard]
```

---

## 🔐 Credentials & Default Logins

### 1. Head Administrator (`/admin`)
- **ID**: `MASHOOD`
- **Password**: `THEAURORAPROTOCOL`
- **Permissions**: Full control (Team registration, mark edits, sub-admin management, round progression, room duration limits, team elimination/restoration, event reset).

### 2. Room Volunteers / Sub Admins (`/admin`)
- **Police Investigation Room**:
  - **Username**: `POLICE01`
  - **Password**: `SecurePassword`
- **Scientist Lab**:
  - **Username**: `LAB01`
  - **Password**: `SecurePassword`

### 3. Student Portal (`/student`)
- **ID**: Team ID (e.g. `AURORA001`)
- **Password**: Team Name (e.g. `TEAM ALPHA`)
- Pre-seeded Demo Teams:
  - `AURORA001` — `TEAM ALPHA` (Score: 950)
  - `AURORA002` — `TEAM PHANTOM` (Score: 910)
  - `AURORA003` — `TEAM SHADOW` (Score: 875)
  - `AURORA004` — `TEAM VECTOR` (Score: 820)
  - `AURORA005` — `TEAM HUNTER` (Score: 780)

---

## 🚀 1. How to Create the TiDB Cloud Database

1. Go to [TiDB Cloud](https://tidbcloud.com/) and register for a free account.
2. Click **Create Cluster** and select the **Serverless (Free)** tier.
3. Choose your preferred region and name your cluster (e.g., `aurora-cluster`).
4. Once provisioned, click **Connect**:
   - Choose connection type: **General Connection** (MySQL Client or Node.js).
   - Generate your database user and strong password.
   - Note the **Host**, **Port** (usually `4000`), **User**, and **Password**.
5. TiDB Cloud automatically enforces secure TLS/SSL connections.

---

## ⚙️ 2. How to Configure Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Set your values in `.env`:

```env
PORT=3000
DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=your_user.root
DB_PASSWORD=your_password
DB_NAME=aurora_protocol
JWT_SECRET=your_super_long_random_jwt_secret_token_aurora_2026
NODE_ENV=production
```

---

## 🛠️ 3. How to Initialize the Database

The application automatically verifies and bootstraps all tables upon starting! 

Alternatively, you can manually run the SQL scripts or run the initialization script:

### Option A: Via Command Line Script
```bash
npm run init-db
```

### Option B: Via TiDB SQL Console
1. In the TiDB Cloud Console, open the **SQL Editor**.
2. Run the queries in [`schema.sql`](./schema.sql) to build all tables.
3. Run the queries in [`seed.sql`](./seed.sql) to populate initial data.

---

## 💻 4. How to Run Locally

### Step 1: Install Dependencies
```bash
npm install
npm --prefix client install
```

### Step 2: Build the React Client
```bash
npm run build
```

### Step 3: Start Server
```bash
npm start
```

Visit:
- **Landing Page**: `http://localhost:3000/`
- **Student Portal**: `http://localhost:3000/student`
- **Command / Scanner Terminal**: `http://localhost:3000/admin`

---

## ☁️ 5. How to Deploy to Render Free Web Service

1. Push this repository to your GitHub account.
2. Log in to [Render](https://dashboard.render.com/) and click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   - **Name**: `aurora-protocol`
   - **Environment**: `Node`
   - **Region**: Closest to your database or audience
   - **Branch**: `master` (or `main`)
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Instance Type**: **Free**
5. Add Environment Variables under the **Environment** tab:
   - `DB_HOST`: Your TiDB host
   - `DB_PORT`: `4000`
   - `DB_USER`: Your TiDB username
   - `DB_PASSWORD`: Your TiDB password
   - `DB_NAME`: `aurora_protocol`
   - `JWT_SECRET`: Random 32+ character string
   - `NODE_ENV`: `production`
6. Click **Deploy Web Service**.
7. Render will build the React frontend, start the unified Express server on `0.0.0.0:$PORT`, and provide your live HTTPS URL!

---

## 🛡️ Security & Performance Highlights

1. **Server-Authoritative Clock**: Entry expiry timestamps are computed strictly on the backend. Client device clocks cannot cheat the countdown.
2. **Database Unique Constraints**: `room_entries` has a strict composite unique key on `(team_id, round_id, room_id)` preventing duplicate room entries within the same round under any race condition.
3. **Web Audio Synthesizer**: Zero external MP3 downloads; immediate synthesizer sounds via Web Audio API.
4. **Mobile Camera & Manual Fallback**: Sub admins can scan QR badges directly with mobile phone cameras or type the Team ID manually if lighting/camera is impaired.
