-- ==============================================================================
-- THE AURORA PROTOCOL — DATABASE SCHEMA (MySQL 8.0+ / TiDB Cloud Compatible)
-- Database Name: aurora_protocol
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS aurora_protocol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aurora_protocol;

-- 1. USERS TABLE (Head Admin & Sub Admins)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('HEAD_ADMIN', 'SUB_ADMIN') NOT NULL DEFAULT 'SUB_ADMIN',
  assigned_room VARCHAR(50) NULL, -- 'POLICE' or 'LAB' for Sub Admins, NULL for Head Admin
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TEAMS TABLE
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'AURORA001'
  team_name VARCHAR(150) NOT NULL,     -- e.g., 'TEAM ALPHA'
  password_hash VARCHAR(255) NOT NULL, -- Hashed Team Name for student login
  qr_token VARCHAR(100) UNIQUE NOT NULL, -- Secure token embedded in QR
  score INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'ELIMINATED') NOT NULL DEFAULT 'ACTIVE',
  current_round INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. ROUNDS TABLE
CREATE TABLE IF NOT EXISTS rounds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  round_number INT UNIQUE NOT NULL,
  status ENUM('PENDING', 'ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. ROOMS TABLE
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(50) UNIQUE NOT NULL, -- 'POLICE', 'LAB'
  room_name VARCHAR(150) NOT NULL       -- 'Police Investigation Room', 'Scientist Lab'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. ROOM SETTINGS TABLE (Configurable time limits per room and round)
CREATE TABLE IF NOT EXISTS room_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  round_id INT NOT NULL,
  room_id INT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 5,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  UNIQUE KEY unique_round_room (round_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. ROOM ENTRIES TABLE (Strict Crowd Access & Countdown Tracking)
-- Crucial: UNIQUE KEY on (team_id, round_id, room_id) prevents double entry in the same round
CREATE TABLE IF NOT EXISTS room_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  round_id INT NOT NULL,
  room_id INT NOT NULL,
  sub_admin_id INT NULL,
  entry_time BIGINT NOT NULL,   -- Server Epoch Milliseconds
  expiry_time BIGINT NOT NULL,  -- Server Epoch Milliseconds (entry_time + duration_ms)
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_entry (team_id, round_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. SCORE HISTORY TABLE (Audit Log for Score Adjustments)
CREATE TABLE IF NOT EXISTS score_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  old_score INT NOT NULL,
  new_score INT NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  reason VARCHAR(255) NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. ACTIVITY LOGS TABLE (Operational Action Trail)
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  action VARCHAR(100) NOT NULL,
  details TEXT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
