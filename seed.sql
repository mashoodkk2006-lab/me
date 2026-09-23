-- ==============================================================================
-- THE AURORA PROTOCOL — SEED DATA
-- Default Users, Rooms, Rounds, Settings, and Demo Teams
-- ==============================================================================

USE aurora_protocol;

-- 1. Insert Head Admin (Username: MASHOOD, Password: THEAURORAPROTOCOL)
INSERT INTO users (username, password_hash, name, role, assigned_room)
VALUES (
  'MASHOOD',
  '$2a$10$IfGuU/ZwmwLgzTlnmhpFHezYgukyuSa1fNK5ntXvqmoOM5WomEpdi',
  'Mashood (Head Admin)',
  'HEAD_ADMIN',
  NULL
) ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 2. Insert Default Rooms
INSERT INTO rooms (id, room_code, room_name)
VALUES 
  (1, 'POLICE', 'Police Investigation Room'),
  (2, 'LAB', 'Scientist Lab')
ON DUPLICATE KEY UPDATE room_name = VALUES(room_name);

-- 3. Insert Sub Admins / Room Volunteers (Password: SecurePassword)
INSERT INTO users (username, password_hash, name, role, assigned_room)
VALUES 
  ('POLICE01', '$2a$10$VrdQ8PFEz5DFElU4Tyod8unyotCquDWaHy1HBNISYIen5NfS0GgLq', 'Police Station Officer', 'SUB_ADMIN', 'POLICE'),
  ('LAB01', '$2a$10$VrdQ8PFEz5DFElU4Tyod8unyotCquDWaHy1HBNISYIen5NfS0GgLq', 'Forensic Lab Scientist', 'SUB_ADMIN', 'LAB')
ON DUPLICATE KEY UPDATE assigned_room = VALUES(assigned_room);

-- 4. Insert Default Rounds (1, 2, 3)
INSERT INTO rounds (id, round_number, status)
VALUES 
  (1, 1, 'ACTIVE'),
  (2, 2, 'PENDING'),
  (3, 3, 'PENDING')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- 5. Insert Configured Room Settings per Round
-- Round 1: Police 5 mins, Lab 7 mins
-- Round 2: Police 6 mins, Lab 5 mins
-- Round 3: Police 5 mins, Lab 5 mins
INSERT INTO room_settings (round_id, room_id, duration_minutes)
VALUES 
  (1, 1, 5), -- Round 1 Police (5 mins)
  (1, 2, 7), -- Round 1 Lab (7 mins)
  (2, 1, 6), -- Round 2 Police (6 mins)
  (2, 2, 5), -- Round 2 Lab (5 mins)
  (3, 1, 5), -- Round 3 Police (5 mins)
  (3, 2, 5)  -- Round 3 Lab (5 mins)
ON DUPLICATE KEY UPDATE duration_minutes = VALUES(duration_minutes);

-- 6. Insert Default Demo Teams (Password = Team Name)
-- Team IDs: AURORA001 to AURORA005
INSERT INTO teams (team_id, team_name, password_hash, qr_token, score, status, current_round)
VALUES 
  ('AURORA001', 'TEAM ALPHA',   '$2a$10$LEodZ55YLCYGGDQpX786b.kYv/YMpMp2ahdjstTLvzUoXbKPIss4W', 'aurora_token_alpha_99182',   950, 'ACTIVE', 1),
  ('AURORA002', 'TEAM PHANTOM', '$2a$10$7wIyhxA4h/4VEKT8iBLy9Ofk.SjXM7/kdI8KnHdwuoqT/EG5zkhV.', 'aurora_token_phantom_44129', 910, 'ACTIVE', 1),
  ('AURORA003', 'TEAM SHADOW',  '$2a$10$zCaGZpoaSixNGMw2ONNZ0.ZP917VUSSHODHNR8GQlH7UOC4.XlBsO', 'aurora_token_shadow_87123',  875, 'ACTIVE', 1),
  ('AURORA004', 'TEAM VECTOR',  '$2a$10$UklHTL2jf6QegYsLeNfl5.vdijgY3EHUV4ZXQS8LrLxvJI5WHlTqm', 'aurora_token_vector_33891',  820, 'ACTIVE', 1),
  ('AURORA005', 'TEAM HUNTER',  '$2a$10$XMN7lLwehl5J4QZcZEc5SOPA1Xg5dIb1n7DakXObCtJmQ.zdiNWvS', 'aurora_token_hunter_65219',  780, 'ACTIVE', 1)
ON DUPLICATE KEY UPDATE score = VALUES(score);
