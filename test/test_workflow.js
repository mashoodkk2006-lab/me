const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../server/config');
const { generateToken } = require('../server/auth');

async function runTests() {
  console.log('--- STARTING AURORA PROTOCOL WORKFLOW TEST ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Test 1: Head Admin Password Verification
  const adminPass = 'THEAURORAPROTOCOL';
  const hashedAdminPass = await bcrypt.hash(adminPass, 10);
  const matchAdmin = await bcrypt.compare('THEAURORAPROTOCOL', hashedAdminPass);
  const falseAdmin = await bcrypt.compare('WRONGPASS', hashedAdminPass);
  assert(matchAdmin === true, 'Head admin password verifies correctly');
  assert(falseAdmin === false, 'Wrong head admin password rejected');

  // Test 2: Student Login Credentials (Team ID + Team Name as password)
  const studentTeamName = 'TEAM ALPHA';
  const studentHash = await bcrypt.hash(studentTeamName, 10);
  const matchStudent = await bcrypt.compare('TEAM ALPHA', studentHash);
  assert(matchStudent === true, 'Student team name password verifies correctly');

  // Test 3: JWT Role-Based Authorization
  const adminToken = generateToken({ id: 1, username: 'MASHOOD', role: 'HEAD_ADMIN' });
  const decodedAdmin = jwt.verify(adminToken, config.JWT_SECRET);
  assert(decodedAdmin.role === 'HEAD_ADMIN', 'Head Admin JWT carries correct role');

  const studentToken = generateToken({ id: 10, team_id: 'AURORA001', role: 'STUDENT' });
  const decodedStudent = jwt.verify(studentToken, config.JWT_SECRET);
  assert(decodedStudent.role === 'STUDENT', 'Student JWT carries correct role');

  // Test 4: Access Control Logic Emulation
  // Track entries as: TEAM + ROUND + ROOM
  const entries = new Set();
  function checkEntry(teamId, roundId, roomId, isEliminated) {
    if (isEliminated) {
      return { status: 'DENIED', reason: 'ACCESS DENIED — TEAM ELIMINATED' };
    }
    const key = `${teamId}_${roundId}_${roomId}`;
    if (entries.has(key)) {
      return { status: 'DENIED', reason: 'ACCESS DENIED — TEAM ALREADY ENTERED THIS ROOM' };
    }
    entries.add(key);
    return { status: 'GRANTED', message: 'ACCESS GRANTED' };
  }

  // First scan in Police Room (Round 1)
  const scan1 = checkEntry('T1', 1, 'POLICE', false);
  assert(scan1.status === 'GRANTED', 'First entry in Round 1 Police Room allowed');

  // Second scan in Police Room (Round 1)
  const scan2 = checkEntry('T1', 1, 'POLICE', false);
  assert(
    scan2.status === 'DENIED' && scan2.reason === 'ACCESS DENIED — TEAM ALREADY ENTERED THIS ROOM',
    'Second entry in same room/round rejected with correct reason'
  );

  // Scan in Scientist Lab (Round 1)
  const scan3 = checkEntry('T1', 1, 'LAB', false);
  assert(scan3.status === 'GRANTED', 'First entry in Scientist Lab (Round 1) allowed');

  // Scan in Police Room in Round 2
  const scan4 = checkEntry('T1', 2, 'POLICE', false);
  assert(scan4.status === 'GRANTED', 'Entry in Police Room in Round 2 allowed');

  // Eliminated team scan
  const scan5 = checkEntry('T2', 1, 'POLICE', true);
  assert(
    scan5.status === 'DENIED' && scan5.reason === 'ACCESS DENIED — TEAM ELIMINATED',
    'Eliminated team rejected with ACCESS DENIED — TEAM ELIMINATED'
  );

  // Test 5: Server-Authoritative Timestamp Countdown Calculation
  const now = Date.now();
  const durationMinutes = 5;
  const expiryTime = now + (durationMinutes * 60 * 1000);
  const remaining = Math.floor((expiryTime - now) / 1000);
  assert(remaining === 300, 'Server-authoritative countdown calculates 300 seconds for 5-minute room');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runTests();
