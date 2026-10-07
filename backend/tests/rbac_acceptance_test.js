const BASE_URL = 'http://localhost:3001/api';

async function runRBACTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' 🛡️  RED TAG ROLE-BASED ACCESS CONTROL (RBAC) ACCEPTANCE TEST');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  async function check(name, condition, extra = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name} ${extra ? `— ${extra}` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${extra ? `— ${extra}` : ''}`);
      failed++;
    }
  }

  // 1. Employee / User Login with credentials
  console.log('▶ [1] Employee (User) Authentication...');
  const userLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'user', password: 'user123' })
  }).then(r => r.json());

  await check('Employee login with credentials succeeds', userLogin.success === true && !!userLogin.token, `user=${userLogin.user?.name}`);
  await check('Employee role is strictly "user"', userLogin.user?.role === 'user', `role=${userLogin.user?.role}`);

  const userToken = userLogin.token;

  // 2. Employee Login with RFID UID (Sarah Jenkins A472198C)
  const rfidLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rfid_uid: 'A472198C' })
  }).then(r => r.json());

  await check('Employee login with RFID badge UID succeeds', rfidLogin.success === true && !!rfidLogin.token, `badge=${rfidLogin.user?.rfid_uid}`);
  await check('RFID mapped to Sarah Jenkins', rfidLogin.user?.name === 'Sarah Jenkins', `name=${rfidLogin.user?.name}`);

  // 3. Supervisor Authentication
  console.log('\n▶ [2] Supervisor Authentication...');
  const supervisorLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'supervisor', password: 'supervisor123' })
  }).then(r => r.json());

  await check('Supervisor login succeeds', supervisorLogin.success === true && !!supervisorLogin.token, `user=${supervisorLogin.user?.username}`);
  await check('Supervisor role is "supervisor"', supervisorLogin.user?.role === 'supervisor', `role=${supervisorLogin.user?.role}`);

  const supervisorToken = supervisorLogin.token;

  // 4. Admin Authentication
  console.log('\n▶ [3] Admin Authentication...');
  const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }).then(r => r.json());

  await check('Admin login succeeds', adminLogin.success === true && !!adminLogin.token, `user=${adminLogin.user?.username}`);
  await check('Admin role is "admin"', adminLogin.user?.role === 'admin', `role=${adminLogin.user?.role}`);

  const adminToken = adminLogin.token;

  // 5. User Restrictions
  console.log('\n▶ [4] Testing User (Employee) Isolation & Restrictions...');

  // User can register their own placement
  const placementCreate = await fetch(`${BASE_URL}/user/placements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      item_name: 'Test Router 5G',
      serial_number: 'SN-TEST-900',
      duration_min: 5,
      reason: 'Quality Control'
    })
  }).then(r => r.json());

  await check('Employee can register placement', placementCreate.success === true && !!placementCreate.placement_id, `id=${placementCreate.placement_id}`);

  // User can view their own placements
  const userPlacements = await fetch(`${BASE_URL}/user/placements`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  }).then(r => r.json());

  await check('Employee can view their own placements', Array.isArray(userPlacements) && userPlacements.length > 0, `count=${userPlacements.length}`);
  const allBelongToUser = userPlacements.every(p => p.employee_name === 'Sarah Jenkins' || p.rfid_uid === 'A472198C' || p.employee_id === 'EMP-001');
  await check('All returned placements strictly belong to this user', allBelongToUser, 'No leaks of other employees');

  // User CANNOT view events
  const userEventsRes = await fetch(`${BASE_URL}/events`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  await check('User CANNOT access /api/events (Forbidden 403)', userEventsRes.status === 403, `status=${userEventsRes.status}`);

  // User CANNOT access user management
  const userUsersRes = await fetch(`${BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  await check('User CANNOT access /api/users (Forbidden 403)', userUsersRes.status === 403, `status=${userUsersRes.status}`);

  // User CANNOT update settings
  const userSettingsRes = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({ alert_cooldown_sec: 10 })
  });
  await check('User CANNOT modify system settings (Forbidden 403)', userSettingsRes.status === 403, `status=${userSettingsRes.status}`);

  // 6. Supervisor Permissions & Restrictions
  console.log('\n▶ [5] Testing Supervisor Permissions & Restrictions...');

  // Supervisor CAN view events
  const supEventsRes = await fetch(`${BASE_URL}/events`, {
    headers: { 'Authorization': `Bearer ${supervisorToken}` }
  });
  await check('Supervisor CAN view /api/events (Allowed 200)', supEventsRes.status === 200, `status=${supEventsRes.status}`);

  // Supervisor CAN view placements
  const supPlacementsRes = await fetch(`${BASE_URL}/placements`, {
    headers: { 'Authorization': `Bearer ${supervisorToken}` }
  });
  await check('Supervisor CAN view /api/placements (Allowed 200)', supPlacementsRes.status === 200, `status=${supPlacementsRes.status}`);

  // Supervisor CANNOT access user management
  const supUsersRes = await fetch(`${BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${supervisorToken}` }
  });
  await check('Supervisor CANNOT access /api/users (Forbidden 403)', supUsersRes.status === 403, `status=${supUsersRes.status}`);

  // Supervisor CANNOT modify system settings
  const supSettingsRes = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supervisorToken}`
    },
    body: JSON.stringify({ alert_cooldown_sec: 10 })
  });
  await check('Supervisor CANNOT modify system settings (Forbidden 403)', supSettingsRes.status === 403, `status=${supSettingsRes.status}`);

  // 7. Admin Full Control
  console.log('\n▶ [6] Testing Administrator Full Access...');

  // Admin CAN view users
  const adminUsersRes = await fetch(`${BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  await check('Admin CAN access /api/users (Allowed 200)', adminUsersRes.status === 200, `status=${adminUsersRes.status}`);

  // Admin CAN view RFID cards
  const adminRfidRes = await fetch(`${BASE_URL}/rfid/cards`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  await check('Admin CAN access /api/rfid/cards (Allowed 200)', adminRfidRes.status === 200, `status=${adminRfidRes.status}`);

  // Admin CAN update system settings
  const adminSettingsRes = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ alert_cooldown_sec: 2 })
  });
  await check('Admin CAN modify system settings (Allowed 200)', adminSettingsRes.status === 200, `status=${adminSettingsRes.status}`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` SUMMARY: ${passed} / ${passed + failed} RBAC CHECKS PASSED (${failed} FAILED)`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runRBACTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
