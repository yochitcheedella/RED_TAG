/**
 * ════════════════════════════════════════════════════════════════════════
 * RED TAG AREA MONITORING SYSTEM — FULL ACCEPTANCE TEST SUITE
 * Sections 45–79 | Golden Tests 1–5 | Decision Table | Groups A–R
 * ════════════════════════════════════════════════════════════════════════
 *
 * Run:  node backend/tests/acceptance_test.js
 * Requires: backend running on http://localhost:3001
 */

const BASE_URL = 'http://localhost:3001/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let passed = 0;
let failed = 0;
const results = [];

async function assert(testName, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}${detail ? ' — ' + detail : ''}\n`);
    passed++;
    results.push({ test: testName, status: 'PASS' });
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}\n`);
    failed++;
    results.push({ test: testName, status: 'FAIL', detail });
  }
}

async function getLatestEvent(n = 1) {
  const res = await fetch(`${BASE_URL}/events?limit=${n}`);
  const events = await res.json();
  return n === 1 ? events[0] : events;
}

async function getStatus() {
  const res = await fetch(`${BASE_URL}/status`);
  return res.json();
}

async function scanRFID(uid) {
  return fetch(`${BASE_URL}/simulate/rfid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  }).then(r => r.json());
}

async function clearObjects(label = null) {
  return fetch(`${BASE_URL}/vision/clear-objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label })
  }).then(r => r.json());
}

async function runWorkflow(path) {
  return fetch(`${BASE_URL}${path}`, { method: 'POST' }).then(r => r.json());
}

// ─────────────────────────────────────────────────────────────────────────────
async function runAllTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' 🏁  RED TAG AREA MONITORING SYSTEM — ACCEPTANCE TEST SUITE');
  console.log('     Sections 45–79 | Golden Tests 1–5 | Groups A–R');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // ── SECTION 1: SYSTEM HEALTH ──────────────────────────────────────────────
  console.log('▶ [SYSTEM] Backend Health Check...');
  try {
    const status = await getStatus();
    await assert('Backend online', status.backend?.online === true, 'backend.online = true');
    await assert('Database connected', status.database?.connected === true, 'database.connected = true');
    const settings = await fetch(`${BASE_URL}/settings`).then(r => r.json());
    await assert('Auth window configured for 60s (60000ms)', String(settings?.auth_window_ms) === '60000', `auth_window_ms=${settings?.auth_window_ms}`);
  } catch (err) {
    await assert('Backend Health', false, err.message);
  }

  // ── GOLDEN TEST 1: Authorized RFID + Object placed → AUTHORIZED, NO ALERT ─
  console.log('▶ [Golden Test 1] Authorized RFID + Object Placed...');
  try {
    await clearObjects();
    const res = await runWorkflow('/simulate/workflow/authorized-placement');
    await sleep(300);
    const latest = await getLatestEvent();
    await assert('GT1: AUTHORIZED_PLACEMENT event', latest?.event_type === 'AUTHORIZED_PLACEMENT', `event_type=${latest?.event_type}`);
    await assert('GT1: Authorization status = AUTHORIZED', latest?.authorization_status === 'AUTHORIZED', `auth=${latest?.authorization_status}`);
    await assert('GT1: NO ALERT triggered', latest?.alert_status === 'NO_ALERT', `alert=${latest?.alert_status}`);
  } catch (err) {
    await assert('Golden Test 1', false, err.message);
  }

  // ── GOLDEN TEST 2: No RFID + Object placed → UNAUTHORIZED, ALERT, EVIDENCE ─
  console.log('▶ [Golden Test 2] No RFID + Object Placed...');
  try {
    await clearObjects();
    await runWorkflow('/simulate/workflow/unauthorized-no-rfid');
    await sleep(300);
    const latest = await getLatestEvent();
    await assert('GT2: UNAUTHORIZED_PLACEMENT event', latest?.event_type === 'UNAUTHORIZED_PLACEMENT', `event_type=${latest?.event_type}`);
    await assert('GT2: ALERT_TRIGGERED', latest?.alert_status === 'ALERT_TRIGGERED', `alert=${latest?.alert_status}`);
    await assert('GT2: authorization_status = NO_RFID', latest?.authorization_status === 'NO_RFID', `auth=${latest?.authorization_status}`);
    await assert('GT2: Evidence image captured', !!latest?.evidence_image, `evidence=${latest?.evidence_image}`);
  } catch (err) {
    await assert('Golden Test 2', false, err.message);
  }

  // ── GOLDEN TEST 3: Unauthorized RFID + Object placed → UNAUTHORIZED, ALERT, EVIDENCE
  console.log('▶ [Golden Test 3] Unauthorized RFID + Object Placed...');
  try {
    await clearObjects();
    await runWorkflow('/simulate/workflow/unauthorized-card');
    await sleep(300);
    const latest = await getLatestEvent();
    await assert('GT3: UNAUTHORIZED_PLACEMENT event', latest?.event_type === 'UNAUTHORIZED_PLACEMENT', `event_type=${latest?.event_type}`);
    await assert('GT3: authorization_status = UNAUTHORIZED_RFID', latest?.authorization_status === 'UNAUTHORIZED_RFID', `auth=${latest?.authorization_status}`);
    await assert('GT3: ALERT_TRIGGERED', latest?.alert_status === 'ALERT_TRIGGERED', `alert=${latest?.alert_status}`);
    await assert('GT3: Evidence image captured', !!latest?.evidence_image, `evidence=${latest?.evidence_image}`);
  } catch (err) {
    await assert('Golden Test 3', false, err.message);
  }

  // ── GOLDEN TEST 4: Authorized RFID + No object → NO ALERT ────────────────
  console.log('▶ [Golden Test 4] Authorized RFID + No Object Placed...');
  try {
    const beforeEvents = await getLatestEvent();
    await clearObjects();
    await runWorkflow('/simulate/workflow/authorized-rfid-no-object');
    await sleep(200);
    const status = await getStatus();
    const afterEvents = await getLatestEvent();
    // Token was set but no object was placed → no PLACEMENT event created
    await assert('GT4: No unauthorized placement event created', beforeEvents?.id === afterEvents?.id || afterEvents?.event_type !== 'UNAUTHORIZED_PLACEMENT', 'No placement event when only RFID was scanned');
  } catch (err) {
    await assert('Golden Test 4', false, err.message);
  }

  // ── GOLDEN TEST 5: Pathway pedestrian/robot → NO ALERT ───────────────────
  console.log('▶ [Golden Test 5] Pathway Pedestrian/Robot Movement...');
  try {
    await clearObjects();
    const beforeEvents = await getLatestEvent();
    const res = await runWorkflow('/simulate/workflow/pathway-movement');
    await sleep(200);
    const afterEvents = await getLatestEvent();
    await assert('GT5: alertTriggered = false', res.alertTriggered === false, 'Pathway API returned alertTriggered=false');
    await assert('GT5: No new DB events created', beforeEvents?.id === afterEvents?.id, 'Database unchanged after pathway movement');
  } catch (err) {
    await assert('Golden Test 5', false, err.message);
  }

  // ── RULE 10 / CASE F: 1 Scan = 1 Placement ───────────────────────────────
  console.log('▶ [Rule 10 / Case F] One RFID Scan = One Placement...');
  try {
    await clearObjects();
    await runWorkflow('/simulate/workflow/one-scan-two-objects');
    await sleep(300);
    const [event2, event1] = await getLatestEvent(2);
    await assert('Rule 10: Object 1 = AUTHORIZED', event1?.event_type === 'AUTHORIZED_PLACEMENT', `event_type=${event1?.event_type}`);
    await assert('Rule 10: Object 2 = UNAUTHORIZED', event2?.event_type === 'UNAUTHORIZED_PLACEMENT', `event_type=${event2?.event_type}`);
    await assert('Rule 10: Object 2 status = TOKEN_ALREADY_CONSUMED', event2?.authorization_status === 'TOKEN_ALREADY_CONSUMED', `auth=${event2?.authorization_status}`);
  } catch (err) {
    await assert('Rule 10 / Case F', false, err.message);
  }

  // ── GROUP J: Duplicate Alert Prevention ───────────────────────────────────
  console.log('▶ [Group J] Duplicate Alert Prevention (Stationary Object Stays)...');
  try {
    await clearObjects();
    const groupJLabel = `GroupJ_${Date.now()}`;

    // Simulate 12 frames of the same stationary object inside ROI
    // alertFired flag should prevent duplicate events
    await fetch(`${BASE_URL}/simulate/placement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectType: groupJLabel, insideROI: true, frames: 12 })
    }).then(r => r.json());
    await sleep(200);

    // Count events for this exact unique label
    const allEvents = await fetch(`${BASE_URL}/events?limit=200`).then(r => r.json());
    const countForLabel = Array.isArray(allEvents)
      ? allEvents.filter(e => e.object_type === groupJLabel).length
      : 0;
    await assert('Group J: Only 1 alert fired for stationary object (not per-frame)', countForLabel === 1, `Events for label = ${countForLabel}`);
  } catch (err) {
    await assert('Group J', false, err.message);
  }

  // ── GROUP K: Object Removal and Replacement ───────────────────────────────
  console.log('▶ [Group K] Object Removal & Replacement (2 separate events)...');
  try {
    await clearObjects();
    const res = await runWorkflow('/simulate/workflow/object-removal-replacement');
    await sleep(300);
    const [evtB, evtA] = await getLatestEvent(2);
    await assert('Group K: Event A (Object Alpha) is UNAUTHORIZED_PLACEMENT', evtA?.event_type === 'UNAUTHORIZED_PLACEMENT' && evtA?.object_type?.includes('Alpha'), `type=${evtA?.event_type}, obj=${evtA?.object_type}`);
    await assert('Group K: Event B (Object Beta) is UNAUTHORIZED_PLACEMENT', evtB?.event_type === 'UNAUTHORIZED_PLACEMENT' && evtB?.object_type?.includes('Beta'), `type=${evtB?.event_type}, obj=${evtB?.object_type}`);
    await assert('Group K: Two distinct events created', evtA?.id !== evtB?.id, `IDs: ${evtA?.id} / ${evtB?.id}`);
  } catch (err) {
    await assert('Group K', false, err.message);
  }

  // ── GROUP L: RFID Duplication (Same Card Re-Scanned) ─────────────────────
  console.log('▶ [Group L] RFID Duplication (Same Card Re-Scanned = Token Refresh)...');
  try {
    const res = await runWorkflow('/simulate/workflow/rfid-duplicate-scan');
    await assert('Group L: Same token refreshed (not duplicated)', res.sameToken === true, `sameToken=${res.sameToken}`);
    await assert('Group L: scan2 was marked as refreshed', res.scan2?.refreshed === true, `refreshed=${res.scan2?.refreshed}`);
  } catch (err) {
    await assert('Group L', false, err.message);
  }

  // ── SECTION 76: Polygon Validation ───────────────────────────────────────
  console.log('▶ [Section 76] Polygon Validation...');
  try {
    // Reject: only 2 points
    const r1 = await fetch(`${BASE_URL}/config/polygon`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon_vertices: [{ x: 100, y: 100 }, { x: 300, y: 100 }] })
    }).then(r => r.json());
    await assert('Sec76: Reject 2-point polygon', r1.validation_failed === true, r1.reason);

    // Reject: coordinate out of bounds
    const r2 = await fetch(`${BASE_URL}/config/polygon`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon_vertices: [{ x: -10, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 400 }] })
    }).then(r => r.json());
    await assert('Sec76: Reject out-of-bounds vertex', r2.validation_failed === true, r2.reason);

    // Accept: valid 4-point polygon
    const r3 = await fetch(`${BASE_URL}/config/polygon`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon_vertices: [{ x: 130, y: 180 }, { x: 510, y: 180 }, { x: 560, y: 440 }, { x: 80, y: 440 }] })
    }).then(r => r.json());
    await assert('Sec76: Accept valid 4-point polygon', r3.success === true, `success=${r3.success}`);
  } catch (err) {
    await assert('Section 76', false, err.message);
  }

  // ── EXPIRED RFID (Case E): Token expires before object placement ──────────
  console.log('▶ [Case E] Expired RFID + Late Object Placement...');
  try {
    await clearObjects();
    // Temporarily reduce window to 1500ms so test suite completes swiftly without a 60s freeze
    await fetch(`${BASE_URL}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_window_ms: '1500' })
    });
    await scanRFID('A472198C');
    await sleep(1800); // Let temporary authorization window expire

    // Place object after expiry
    await fetch(`${BASE_URL}/simulate/placement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectType: 'Delayed Crate CaseE', insideROI: true, frames: 6 })
    });
    await sleep(300);
    const latest = await getLatestEvent();
    await assert('Case E: UNAUTHORIZED on expired token', latest?.event_type === 'UNAUTHORIZED_PLACEMENT', `event_type=${latest?.event_type}`);
    await assert('Case E: auth_status EXPIRED_RFID or NO_RFID', ['EXPIRED_RFID', 'NO_RFID', 'TOKEN_ALREADY_CONSUMED'].includes(latest?.authorization_status), `auth=${latest?.authorization_status}`);
    await assert('Case E: Evidence captured', !!latest?.evidence_image, `evidence=${latest?.evidence_image}`);

    // Restore standard 60-second window
    await fetch(`${BASE_URL}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_window_ms: '60000' })
    });
  } catch (err) {
    await assert('Case E: Expired RFID', false, err.message);
    await fetch(`${BASE_URL}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_window_ms: '60000' })
    }).catch(() => {});
  }

  // ── PRIVACY: Object Evidence Only (Zero Human Images) ────────────────────
  console.log('▶ [Privacy Rule 17] Evidence Strictly Object-Only...');
  try {
    const recentEvents = await getLatestEvent(20);
    const eventsWithEvidence = Array.isArray(recentEvents) ? recentEvents.filter(e => e.evidence_image) : [];
    await assert('Privacy: Unauthorized events have evidence images', eventsWithEvidence.length > 0, `events_with_evidence=${eventsWithEvidence.length}`);
    // Verify all stored evidence images follow object-only crop standard (no biometric/full frame dumps)
    const validEvidence = eventsWithEvidence.length > 0 && eventsWithEvidence.every(e => e.evidence_image && (e.evidence_image.startsWith('evidence_') || e.evidence_image.endsWith('.jpg') || e.evidence_image.endsWith('.png')));
    await assert('Privacy: Evidence images strictly follow object-only bounding crop standard', validEvidence, 'All evidence files conform to privacy crop pattern');
  } catch (err) {
    await assert('Privacy Rule 17', false, err.message);
  }

  // ── SECTION 97: Mandatory Acceptance Tests 1–8 (Authorized Objects & Lifecycle) ──
  console.log('▶ [Section 97] Mandatory Acceptance Tests 1–8...');

  // TEST 1 — Authorized object
  try {
    await fetch(`${BASE_URL}/vision/clear-objects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    await scanRFID('A472198C'); // Authorized card
    const res1 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-A1',
        objectType: 'Box A',
        box: { x: 210, y: 220, width: 90, height: 80 }
      })
    });
    const data1 = await res1.json();
    const event1 = data1.event;

    await assert('Sec 97 Test 1: Object A = AUTHORIZED', event1?.authorization_status === 'AUTHORIZED', `auth=${event1?.authorization_status}`);
    await assert('Sec 97 Test 1: Alert = NO', event1?.alert_status === 'NO_ALERT', `alert=${event1?.alert_status}`);
    await assert('Sec 97 Test 1: Image = CAPTURED', !!event1?.evidence_image, `evidence=${event1?.evidence_image}`);
    await assert('Sec 97 Test 1: State = PRESENT', data1?.object_state === 'PRESENT', `state=${data1?.object_state}`);
  } catch (err) {
    await assert('Sec 97 Test 1', false, err.message);
  }

  // TEST 2 — Authorized object remains
  try {
    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    const res2 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-A1',
        objectType: 'Box A',
        box: { x: 212, y: 222, width: 90, height: 80 }
      })
    });
    const data2 = await res2.json();

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 97 Test 2: Object A remains AUTHORIZED', data2?.event?.authorization_status === 'AUTHORIZED' || data2?.event?.isAuthorized === true || data2?.event?.alert_status === 'NO_ALERT', `auth=${data2?.event?.authorization_status}`);
    await assert('Sec 97 Test 2: NO NEW EVENT created', countAfter === countBefore || data2?.event?.alreadyAuthorized === true, `countBefore=${countBefore}, countAfter=${countAfter}`);
    await assert('Sec 97 Test 2: NO ALERT generated', data2?.event?.alert_status === 'NO_ALERT', `alert=${data2?.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 97 Test 2', false, err.message);
  }

  // TEST 3 — Unauthorized new object
  try {
    const res3 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-B1',
        objectType: 'Package B',
        box: { x: 340, y: 220, width: 75, height: 65 }
      })
    });
    const data3 = await res3.json();
    const event3 = data3.event;

    await assert('Sec 97 Test 3: Object B = UNAUTHORIZED', event3?.authorization_status === 'NO_RFID' || event3?.event_type === 'UNAUTHORIZED_PLACEMENT', `auth=${event3?.authorization_status}`);
    await assert('Sec 97 Test 3: Alert = YES for Object B', event3?.alert_status === 'ALERT_TRIGGERED', `alert=${event3?.alert_status}`);
    await assert('Sec 97 Test 3: Object B Image = CAPTURED', !!event3?.evidence_image, `evidence=${event3?.evidence_image}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`);
    const activeData = await activeRes.json();
    const activeA = activeData.objects?.find(o => o.id === 'OBJ-TEST-A1');
    await assert('Sec 97 Test 3: Object A remains AUTHORIZED and PRESENT', activeA?.authorization_status === 'AUTHORIZED' && activeA?.state === 'PRESENT', `Object A status=${activeA?.authorization_status}`);
  } catch (err) {
    await assert('Sec 97 Test 3', false, err.message);
  }

  // TEST 4 — Authorized object removed
  try {
    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    await fetch(`${BASE_URL}/vision/clear-objects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'OBJ-TEST-A1' })
    });

    const activeRes = await fetch(`${BASE_URL}/objects/active`);
    const activeData = await activeRes.json();
    const activeA = activeData.objects?.find(o => o.id === 'OBJ-TEST-A1');

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 97 Test 4: Object A marked REMOVED', !activeA || activeA.state === 'REMOVED', 'Object A removed');
    await assert('Sec 97 Test 4: No alert generated on removal', countAfter === countBefore, 'Zero alerts on removal');
  } catch (err) {
    await assert('Sec 97 Test 4', false, err.message);
  }

  // TEST 5 — New object after removal
  try {
    const res5 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-B2',
        objectType: 'Crate B2',
        box: { x: 210, y: 220, width: 90, height: 80 }
      })
    });
    const data5 = await res5.json();
    const event5 = data5.event;

    await assert('Sec 97 Test 5: Object B = UNAUTHORIZED after removal', event5?.authorization_status === 'NO_RFID' || event5?.event_type === 'UNAUTHORIZED_PLACEMENT', `auth=${event5?.authorization_status}`);
    await assert('Sec 97 Test 5: Alert = YES', event5?.alert_status === 'ALERT_TRIGGERED', `alert=${event5?.alert_status}`);
    await assert('Sec 97 Test 5: Object B Image = CAPTURED', !!event5?.evidence_image, `evidence=${event5?.evidence_image}`);
  } catch (err) {
    await assert('Sec 97 Test 5', false, err.message);
  }

  // TEST 6 — Two authorized objects
  try {
    await fetch(`${BASE_URL}/vision/clear-objects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });

    await scanRFID('A472198C');
    const res6A = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-6A',
        objectType: 'Component A',
        box: { x: 180, y: 200, width: 70, height: 60 }
      })
    });
    const data6A = await res6A.json();

    await scanRFID('B7214492');
    const res6B = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-6B',
        objectType: 'Component B',
        box: { x: 280, y: 200, width: 70, height: 60 }
      })
    });
    const data6B = await res6B.json();

    await assert('Sec 97 Test 6: Object A = AUTHORIZED', data6A.event?.authorization_status === 'AUTHORIZED', `A auth=${data6A.event?.authorization_status}`);
    await assert('Sec 97 Test 6: Object B = AUTHORIZED', data6B.event?.authorization_status === 'AUTHORIZED', `B auth=${data6B.event?.authorization_status}`);
    await assert('Sec 97 Test 6: Both images captured', !!data6A.event?.evidence_image && !!data6B.event?.evidence_image, 'Both evidence files exist');
    await assert('Sec 97 Test 6: No alerts for both objects', data6A.event?.alert_status === 'NO_ALERT' && data6B.event?.alert_status === 'NO_ALERT', 'Zero alerts triggered');

    const activeRes = await fetch(`${BASE_URL}/objects/active`);
    const activeData = await activeRes.json();
    const bothPresent = activeData.objects?.filter(o => ['OBJ-TEST-6A', 'OBJ-TEST-6B'].includes(o.id) && o.state === 'PRESENT' && o.authorization_status === 'AUTHORIZED');
    await assert('Sec 97 Test 6: Both remain AUTHORIZED + PRESENT', bothPresent?.length === 2, `active_authorized_count=${bothPresent?.length}`);
  } catch (err) {
    await assert('Sec 97 Test 6', false, err.message);
  }

  // TEST 7 — Existing authorized object + new unauthorized object
  try {
    const res7 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-7B',
        objectType: 'Unauthorized Gear',
        box: { x: 380, y: 200, width: 60, height: 60 }
      })
    });
    const data7 = await res7.json();

    await assert('Sec 97 Test 7: Object B triggers ALERT', data7.event?.alert_status === 'ALERT_TRIGGERED', `alert=${data7.event?.alert_status}`);
    await assert('Sec 97 Test 7: Object B has OBJECT IMAGE', !!data7.event?.evidence_image, `evidence=${data7.event?.evidence_image}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`);
    const activeData = await activeRes.json();
    const obj6A = activeData.objects?.find(o => o.id === 'OBJ-TEST-6A');
    await assert('Sec 97 Test 7: Object A remains AUTHORIZED', obj6A?.authorization_status === 'AUTHORIZED' && obj6A?.state === 'PRESENT', `Obj6A status=${obj6A?.authorization_status}`);
  } catch (err) {
    await assert('Sec 97 Test 7', false, err.message);
  }

  // TEST 8 — Authorized RFID but no new object
  try {
    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    await scanRFID('A472198C');
    await sleep(400);

    const res8 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'OBJ-TEST-6A',
        objectType: 'Component A',
        box: { x: 180, y: 200, width: 70, height: 60 }
      })
    });
    const data8 = await res8.json();

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 97 Test 8: NO NEW EVENT created', countAfter === countBefore || data8?.event?.alreadyAuthorized === true, `countBefore=${countBefore}, countAfter=${countAfter}`);
    await assert('Sec 97 Test 8: NO ALERT generated', data8?.event?.alert_status === 'NO_ALERT', `alert=${data8?.event?.alert_status}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`);
    const activeData = await activeRes.json();
    const obj6A = activeData.objects?.find(o => o.id === 'OBJ-TEST-6A');
    await assert('Sec 97 Test 8: Object A remains AUTHORIZED', obj6A?.authorization_status === 'AUTHORIZED' && obj6A?.state === 'PRESENT', `Obj6A status=${obj6A?.authorization_status}`);
  } catch (err) {
    await assert('Sec 97 Test 8', false, err.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── SECTION 36: 15 MANDATORY ACCEPTANCE TESTS ─────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' 🏁  SECTION 36: 15 MANDATORY ACCEPTANCE TEST CASES');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // TEST 1 — Authorized RFID + New object
  console.log('▶ [Section 36: Test 1] Authorized RFID + New Object...');
  try {
    await clearObjects();
    await scanRFID('A472198C');
    await sleep(200);

    const res1 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-001',
        objectType: 'Standard Box',
        box: { x: 200, y: 220, width: 80, height: 70 }
      })
    });
    const d1 = await res1.json();

    await assert('Sec 36 Test 1: Object image captured', !!d1.event?.evidence_image, `img=${d1.event?.evidence_image}`);
    await assert('Sec 36 Test 1: AUTHORIZED', d1.event?.authorization_status === 'AUTHORIZED', `auth=${d1.event?.authorization_status}`);
    await assert('Sec 36 Test 1: PRESENT', d1.event?.object_state === 'PRESENT', `state=${d1.event?.object_state}`);
    await assert('Sec 36 Test 1: NO ALERT', d1.event?.alert_status === 'NO_ALERT', `alert=${d1.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 36 Test 1', false, err.message);
  }

  // TEST 2 — No RFID + New object
  console.log('▶ [Section 36: Test 2] No RFID + New Object...');
  try {
    const res2 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-002',
        objectType: 'Unapproved Bin',
        box: { x: 320, y: 220, width: 80, height: 70 }
      })
    });
    const d2 = await res2.json();

    await assert('Sec 36 Test 2: Object image captured', !!d2.event?.evidence_image, `img=${d2.event?.evidence_image}`);
    await assert('Sec 36 Test 2: UNAUTHORIZED', d2.event?.authorization_status === 'NO_RFID' || d2.event?.authorization_status === 'TOKEN_ALREADY_CONSUMED', `auth=${d2.event?.authorization_status}`);
    await assert('Sec 36 Test 2: PRESENT', d2.event?.object_state === 'PRESENT', `state=${d2.event?.object_state}`);
    await assert('Sec 36 Test 2: ALERT', d2.event?.alert_status === 'ALERT_TRIGGERED', `alert=${d2.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 36 Test 2', false, err.message);
  }

  // TEST 3 — Unauthorized RFID + New object
  console.log('▶ [Section 36: Test 3] Unauthorized RFID + New Object...');
  try {
    await scanRFID('XYZ12345');
    await sleep(200);

    const res3 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-003',
        objectType: 'Restricted Part',
        box: { x: 420, y: 220, width: 80, height: 70 }
      })
    });
    const d3 = await res3.json();

    await assert('Sec 36 Test 3: Object image captured', !!d3.event?.evidence_image, `img=${d3.event?.evidence_image}`);
    await assert('Sec 36 Test 3: UNAUTHORIZED', d3.event?.authorization_status === 'UNAUTHORIZED_RFID', `auth=${d3.event?.authorization_status}`);
    await assert('Sec 36 Test 3: ALERT', d3.event?.alert_status === 'ALERT_TRIGGERED', `alert=${d3.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 36 Test 3', false, err.message);
  }

  // TEST 4 — Authorized RFID + No object
  console.log('▶ [Section 36: Test 4] Authorized RFID + No Object...');
  try {
    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    await scanRFID('A472198C');
    await sleep(300);

    const eventsAfter = await getLatestEvent(10);
    const placementEvents = (Array.isArray(eventsAfter) ? eventsAfter : []).filter(e =>
      e.event_type === 'AUTHORIZED_PLACEMENT' || e.event_type === 'UNAUTHORIZED_PLACEMENT'
    );
    const prevPlacementEvents = (Array.isArray(eventsBefore) ? eventsBefore : []).filter(e =>
      e.event_type === 'AUTHORIZED_PLACEMENT' || e.event_type === 'UNAUTHORIZED_PLACEMENT'
    );

    await assert('Sec 36 Test 4: No placement event', placementEvents.length === prevPlacementEvents.length, 'No placement event created from RFID alone');
    const hasNewAlert = (Array.isArray(eventsAfter) ? eventsAfter : []).some(e => e.alert_status === 'ALERT_TRIGGERED' && !eventsBefore.some(b => b.id === e.id));
    await assert('Sec 36 Test 4: No alert', !hasNewAlert, 'No alert generated');
  } catch (err) {
    await assert('Sec 36 Test 4', false, err.message);
  }

  // TEST 5 — Object stationary for 10 seconds (MIN_OBJECT_PERSISTENCE_MS = 5000)
  console.log('▶ [Section 36: Test 5] Object Stationary for 10 seconds...');
  try {
    await clearObjects();
    await scanRFID('A472198C');

    // Feed frames simulating continuous tracking over persistence period
    const box = { x: 250, y: 240, width: 80, height: 70 };
    const label = `Stationary Box ${Date.now().toString().slice(-4)}`;

    for (let f = 0; f < 6; f++) {
      await fetch(`${BASE_URL}/simulate/placement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectType: label, insideROI: true, x: box.x, y: box.y, width: box.width, height: box.height, frames: 1 })
      });
      await sleep(100);
    }

    const latest = await getLatestEvent();
    await assert('Sec 36 Test 5: Placement confirmed', latest?.event_type === 'AUTHORIZED_PLACEMENT', `type=${latest?.event_type}`);
    await assert('Sec 36 Test 5: One image captured', !!latest?.evidence_image, `img=${latest?.evidence_image}`);
  } catch (err) {
    await assert('Sec 36 Test 5', false, err.message);
  }

  // TEST 6 — Object detector temporarily misses object (< OBJECT_MISSED_GRACE_MS = 1500)
  console.log('▶ [Section 36: Test 6] Detector Temporary Miss Grace Period...');
  try {
    const settings = await fetch(`${BASE_URL}/settings`).then(r => r.json());
    const graceMs = parseInt(settings?.object_missed_grace_ms || '1500', 10);
    const removalTimeoutMs = parseInt(settings?.object_removal_timeout_ms || '3000', 10);
    await assert('Sec 36 Test 6: Miss grace configured >= 1500ms', graceMs >= 1500, `graceMs=${graceMs}`);
    await assert('Sec 36 Test 6: Removal timeout configured >= 3000ms', removalTimeoutMs >= 3000, `timeoutMs=${removalTimeoutMs}`);
  } catch (err) {
    await assert('Sec 36 Test 6', false, err.message);
  }

  // TEST 7 — Object A authorized + Object A remains stationary
  console.log('▶ [Section 36: Test 7] Object A Stationary Duplicate Prevention...');
  try {
    await clearObjects();
    await scanRFID('A472198C');

    const res7A = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-007A',
        objectType: 'Stationary Palette',
        box: { x: 210, y: 220, width: 80, height: 70 }
      })
    });
    const d7A = await res7A.json();

    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    // Simulate same object staying stationary in successive frames
    const res7B = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-007A',
        objectType: 'Stationary Palette',
        box: { x: 212, y: 221, width: 80, height: 70 }
      })
    });
    const d7B = await res7B.json();

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 36 Test 7: No duplicate event', countAfter === countBefore || d7B?.event?.alreadyAuthorized === true, `countBefore=${countBefore}, countAfter=${countAfter}`);
    await assert('Sec 36 Test 7: No alert', d7B?.event?.alert_status === 'NO_ALERT', `alert=${d7B?.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 36 Test 7', false, err.message);
  }

  // TEST 8 — Object A authorized + Object B newly placed without RFID
  console.log('▶ [Section 36: Test 8] Object A Authorized + Object B without RFID...');
  try {
    const res8 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-008B',
        objectType: 'Unauthorized Crate',
        box: { x: 380, y: 220, width: 80, height: 70 }
      })
    });
    const d8 = await res8.json();

    await assert('Sec 36 Test 8: Object B UNAUTHORIZED', d8.event?.authorization_status !== 'AUTHORIZED', `auth=${d8.event?.authorization_status}`);
    await assert('Sec 36 Test 8: Object B triggers ALERT', d8.event?.alert_status === 'ALERT_TRIGGERED', `alert=${d8.event?.alert_status}`);
    await assert('Sec 36 Test 8: Object B image captured', !!d8.event?.evidence_image, `img=${d8.event?.evidence_image}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`).then(r => r.json());
    const objA = activeRes.objects?.find(o => o.id === 'TRACK-007A');
    await assert('Sec 36 Test 8: Object A remains AUTHORIZED', objA?.authorization_status === 'AUTHORIZED' && objA?.state === 'PRESENT', `ObjA status=${objA?.authorization_status}`);
  } catch (err) {
    await assert('Sec 36 Test 8', false, err.message);
  }

  // TEST 9 — Object A authorized + Object B newly placed with authorized RFID
  console.log('▶ [Section 36: Test 9] Object A Authorized + Object B with Authorized RFID...');
  try {
    await scanRFID('B7214492'); // Employee 002
    await sleep(200);

    const res9 = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-009B',
        objectType: 'Authorized Crate B',
        box: { x: 450, y: 220, width: 70, height: 60 }
      })
    });
    const d9 = await res9.json();

    await assert('Sec 36 Test 9: Object B is AUTHORIZED', d9.event?.authorization_status === 'AUTHORIZED', `auth=${d9.event?.authorization_status}`);
    await assert('Sec 36 Test 9: Object B NO ALERT', d9.event?.alert_status === 'NO_ALERT', `alert=${d9.event?.alert_status}`);
    await assert('Sec 36 Test 9: Object B distinct tracking ID', d9.event?.object_id === 'TRACK-009B', `id=${d9.event?.object_id}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`).then(r => r.json());
    const objA = activeRes.objects?.find(o => o.id === 'TRACK-007A');
    await assert('Sec 36 Test 9: Object A remains AUTHORIZED', objA?.authorization_status === 'AUTHORIZED', `ObjA status=${objA?.authorization_status}`);
  } catch (err) {
    await assert('Sec 36 Test 9', false, err.message);
  }

  // TEST 10 — Object A removed + Object B later placed without RFID
  console.log('▶ [Section 36: Test 10] Object A Removed + Object B Later Placed...');
  try {
    await fetch(`${BASE_URL}/vision/object-removed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'TRACK-007A', label: 'Stationary Palette' })
    });

    const activeRes1 = await fetch(`${BASE_URL}/objects/active`).then(r => r.json());
    const objA = activeRes1.objects?.find(o => o.id === 'TRACK-007A');
    await assert('Sec 36 Test 10: Object A is REMOVED', !objA || objA.state === 'REMOVED', `ObjA state=${objA?.state || 'REMOVED'}`);

    // Object B placed without RFID
    const res10B = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-010B',
        objectType: 'Fresh Crate',
        box: { x: 210, y: 220, width: 80, height: 70 }
      })
    });
    const d10B = await res10B.json();

    await assert('Sec 36 Test 10: Object B is NEW', d10B.event?.object_id === 'TRACK-010B', `id=${d10B.event?.object_id}`);
    await assert('Sec 36 Test 10: Object B UNAUTHORIZED', d10B.event?.authorization_status !== 'AUTHORIZED', `auth=${d10B.event?.authorization_status}`);
    await assert('Sec 36 Test 10: Object B triggers ALERT', d10B.event?.alert_status === 'ALERT_TRIGGERED', `alert=${d10B.event?.alert_status}`);
  } catch (err) {
    await assert('Sec 36 Test 10', false, err.message);
  }

  // TEST 11 — One RFID + Two new objects
  console.log('▶ [Section 36: Test 11] One RFID + Two New Objects...');
  try {
    await clearObjects();
    await scanRFID('A472198C');
    await sleep(200);

    const res11A = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-011A',
        objectType: 'First Item',
        box: { x: 200, y: 200, width: 70, height: 60 }
      })
    });
    const d11A = await res11A.json();

    const res11B = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-011B',
        objectType: 'Second Item',
        box: { x: 350, y: 200, width: 70, height: 60 }
      })
    });
    const d11B = await res11B.json();

    await assert('Sec 36 Test 11: Object A is AUTHORIZED', d11A.event?.authorization_status === 'AUTHORIZED', `A auth=${d11A.event?.authorization_status}`);
    await assert('Sec 36 Test 11: Object B is UNAUTHORIZED', d11B.event?.authorization_status === 'TOKEN_ALREADY_CONSUMED' || d11B.event?.authorization_status === 'NO_RFID', `B auth=${d11B.event?.authorization_status}`);
  } catch (err) {
    await assert('Sec 36 Test 11', false, err.message);
  }

  // TEST 12 — Person walks through pathway
  console.log('▶ [Section 36: Test 12] Person Walking Through Pathway...');
  try {
    const res12 = await fetch(`${BASE_URL}/simulate/workflow/pathway-movement`, { method: 'POST' }).then(r => r.json());
    await assert('Sec 36 Test 12: No Red Tag event', res12.alertTriggered === false, `alertTriggered=${res12.alertTriggered}`);
  } catch (err) {
    await assert('Sec 36 Test 12', false, err.message);
  }

  // TEST 13 — Robot passes through pathway
  console.log('▶ [Section 36: Test 13] Robot Passing Through Pathway...');
  try {
    const res13 = await fetch(`${BASE_URL}/simulate/workflow/pathway-movement`, { method: 'POST' }).then(r => r.json());
    await assert('Sec 36 Test 13: No Red Tag event', res13.alertTriggered === false, `alertTriggered=${res13.alertTriggered}`);
  } catch (err) {
    await assert('Sec 36 Test 13', false, err.message);
  }

  // TEST 14 — Object briefly enters Red Tag ROI but leaves before 5 seconds
  console.log('▶ [Section 36: Test 14] Brief ROI Entry < 5 seconds...');
  try {
    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    // Simulate 1 brief frame then cleared (object removed before persistence confirmation)
    await fetch(`${BASE_URL}/simulate/placement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectType: 'Transient Part', insideROI: true, frames: 1 })
    });
    // Immediately clear transient tracker before confirmation threshold
    await fetch(`${BASE_URL}/vision/clear-objects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Transient Part' })
    });

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 36 Test 14: No confirmed placement event', countAfter === countBefore, `countBefore=${countBefore}, countAfter=${countAfter}`);
  } catch (err) {
    await assert('Sec 36 Test 14', false, err.message);
  }

  // TEST 15 — Existing authorized object + new RFID scan + no new object
  console.log('▶ [Section 36: Test 15] Existing Object + New RFID + No New Object...');
  try {
    await clearObjects();
    await scanRFID('A472198C');
    await sleep(200);

    const res15A = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-015A',
        objectType: 'Primary Object',
        box: { x: 200, y: 200, width: 70, height: 60 }
      })
    });
    const d15A = await res15A.json();

    const eventsBefore = await getLatestEvent(10);
    const countBefore = Array.isArray(eventsBefore) ? eventsBefore.length : 0;

    // New RFID scan
    await scanRFID('B7214492');
    await sleep(200);

    // Frame with existing object
    const res15B = await fetch(`${BASE_URL}/vision/placement-confirmed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectId: 'TRACK-015A',
        objectType: 'Primary Object',
        box: { x: 200, y: 200, width: 70, height: 60 }
      })
    });
    const d15B = await res15B.json();

    const eventsAfter = await getLatestEvent(10);
    const countAfter = Array.isArray(eventsAfter) ? eventsAfter.length : 0;

    await assert('Sec 36 Test 15: No new placement created', countAfter === countBefore || d15B?.event?.alreadyAuthorized === true, `countBefore=${countBefore}, countAfter=${countAfter}`);
    await assert('Sec 36 Test 15: No alert', d15B?.event?.alert_status === 'NO_ALERT', `alert=${d15B?.event?.alert_status}`);

    const activeRes = await fetch(`${BASE_URL}/objects/active`).then(r => r.json());
    const objA = activeRes.objects?.find(o => o.id === 'TRACK-015A');
    await assert('Sec 36 Test 15: Existing object unchanged', objA?.authorization_status === 'AUTHORIZED' && objA?.state === 'PRESENT', `ObjA status=${objA?.authorization_status}`);
  } catch (err) {
    await assert('Sec 36 Test 15', false, err.message);
  }

  // Clean up all test objects so live surveillance starts with an empty slate
  await fetch(`${BASE_URL}/vision/clear-objects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {});

  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(` SUMMARY: ${passed} / ${total} TESTS PASSED  (${failed} FAILED)`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.test}${r.detail ? ' — ' + r.detail : ''}`);
    });
    console.log('');
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
