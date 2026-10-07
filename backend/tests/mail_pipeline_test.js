import { mailQueueService } from '../src/services/mailQueueService.js';
import db, {
  createMailJob,
  getMailJobById,
  getMailJobByEventId,
  updateMailJob,
  getAlertById,
  logEvent
} from '../src/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evidenceDir = path.resolve(__dirname, '../../uploads/evidence');

async function runMailPipelineTests() {
  console.log('\n============================================================');
  console.log('🧪 RUNNING RED TAG MONITOR — MAIL PROCESSING PIPELINE TESTS');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Prepare sample evidence image file
  const unauthDir = path.resolve(evidenceDir, 'unauthorized');
  if (!fs.existsSync(unauthDir)) fs.mkdirSync(unauthDir, { recursive: true });
  const testEvidenceFilename = `test_crop_${Date.now()}.jpg`;
  const testEvidencePath = path.resolve(unauthDir, testEvidenceFilename);
  fs.writeFileSync(testEvidencePath, Buffer.from('FAKE_JPEG_IMAGE_DATA_FOR_TESTING'));

  // 2. Create simulated unauthorized placement event
  const testEventId = `RT-${Date.now().toString().slice(-5)}`;
  const testObjectId = `OBJ-${Math.floor(Math.random() * 9000 + 1000)}`;

  const savedEvent = logEvent({
    id: testEventId,
    timestamp: new Date().toISOString(),
    event_type: 'UNAUTHORIZED_PLACEMENT',
    rfid_uid: null,
    employee_id: null,
    employee_name: null,
    object_type: 'Carton Box',
    object_id: testObjectId,
    object_state: 'PRESENT',
    authorization_status: 'NO_RFID',
    alert_status: 'ALERT_TRIGGERED',
    confidence: 0.94,
    evidence_image: testEvidenceFilename,
    notes: 'Unauthorized placement verified stationary for 5.0 seconds in Red Tag Area.'
  });

  // Verify alert was created in alerts table
  const alertRow = db.prepare('SELECT * FROM alerts WHERE object_event_id = ?').get(testEventId);
  assert(!!alertRow, 'Alert record created for unauthorized event');
  assert(alertRow.status === 'OPEN', 'Alert initial status is OPEN');

  // Test 1: Verify evidence file existence verification
  const verifiedPath = mailQueueService.verifyEvidenceFile(testEvidenceFilename);
  assert(verifiedPath && fs.existsSync(verifiedPath), 'Requirement 4 & 5: Evidence verified on disk before mail processing');

  // Test 2: Structured payload building
  const timeline = mailQueueService.buildEventTimeline(savedEvent.timestamp, 5.0);
  assert(timeline.length === 6, 'Requirement 7: Event timeline generated with 6 milestone stages');
  assert(timeline[0].label.includes('Object detected'), 'Timeline stage 1: Object detected in CCTV');
  assert(timeline[2].label.includes('Stationary verification completed'), 'Timeline stage 3: Stationary verification completed');

  // Test 3: Enqueue Mail Job
  const enqResult = await mailQueueService.enqueueMailJob(savedEvent, testEvidenceFilename, 'safety-admin@company.com');
  assert(enqResult.success === true, 'Requirement 2: Enqueue mail job succeeds');
  assert(enqResult.mailJob && enqResult.mailJob.id.startsWith('MAIL-'), 'Requirement 18: Mail job ID generated format MAIL-XXXXX');
  assert(enqResult.mailJob.subject === `🚨 RED TAG ALERT | Unauthorized Placement | ${testEventId}`, 'Requirement 8: Dynamic subject format');
  assert(enqResult.mailJob.recipient === 'safety-admin@company.com', 'Requirement 9: Configured recipient assigned');

  // Test 4: Verify Mail Job Payload
  const jobPayload = JSON.parse(enqResult.mailJob.payload);
  assert(jobPayload.eventId === testEventId, 'Requirement 3: Payload eventId matches');
  assert(jobPayload.objectId === testObjectId, 'Requirement 3: Payload objectId matches');
  assert(jobPayload.objectType === 'Carton Box', 'Requirement 3: Payload objectType matches');
  assert(jobPayload.rfidStatus === 'NO_RFID', 'Requirement 3: Payload rfidStatus matches');
  assert(jobPayload.authorization === 'UNAUTHORIZED', 'Requirement 3: Payload authorization is UNAUTHORIZED');
  assert(jobPayload.verificationDuration === 5.0, 'Requirement 3: Payload verificationDuration is 5.0s');
  assert(jobPayload.alertStatus === 'OPEN', 'Requirement 3: Payload alertStatus is OPEN');

  // Test 5: Process Mail Job (Ethereal test message preview)
  const processResult = await mailQueueService.processJob(enqResult.mailJob.id, { forceRetry: true });
  assert(processResult.success === true, 'Mail processor transmits email successfully');
  assert(processResult.status === 'SENT', 'Requirement 10: Mail status updated to SENT');

  // Verify updated mail_job in database
  const updatedJob = getMailJobById(enqResult.mailJob.id);
  assert(updatedJob.status === 'SENT', 'Database mail_jobs status persisted as SENT');
  assert(!!updatedJob.sent_at, 'Database mail_jobs sent_at timestamp recorded');
  assert(updatedJob.attempt_count >= 1, 'Database mail_jobs attempt_count incremented');

  // Verify alert table updated with email status
  const updatedAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertRow.id);
  assert(updatedAlert.email_status === 'SENT', 'Requirement 10: Alert email_status updated to SENT');
  assert(!!updatedAlert.email_sent_at, 'Alert email_sent_at updated');

  // Test 6: Idempotency (Requirement 14 - Prevent duplicate emails)
  const duplicateAttempt = await mailQueueService.enqueueMailJob(savedEvent, testEvidenceFilename);
  assert(duplicateAttempt.alreadySent === true, 'Requirement 14: Duplicate enqueue suppressed when status === SENT');

  const duplicateProcess = await mailQueueService.processJob(enqResult.mailJob.id);
  assert(duplicateProcess.alreadySent === true, 'Requirement 14: Duplicate processJob suppressed without forceRetry');

  // Test 7: Email failure resilience (Requirement 11 - Failure must not lose the alert)
  const failedEventId = `RT-${Date.now().toString().slice(-5)}-FAIL`;
  const failedEvent = logEvent({
    id: failedEventId,
    timestamp: new Date().toISOString(),
    event_type: 'UNAUTHORIZED_PLACEMENT',
    object_type: 'Industrial Drill',
    object_id: 'OBJ-FAIL-01',
    authorization_status: 'NO_RFID',
    alert_status: 'ALERT_TRIGGERED',
    notes: 'Failure resilience test'
  });

  const failAlert = db.prepare('SELECT * FROM alerts WHERE object_event_id = ?').get(failedEventId);
  const failJob = createMailJob({
    id: `MAIL-FAIL-${Date.now().toString().slice(-4)}`,
    event_id: failedEventId,
    alert_id: failAlert.id,
    recipient: 'test@invalid.domain',
    subject: `🚨 RED TAG ALERT | Unauthorized Placement | ${failedEventId}`,
    status: 'PENDING',
    attempt_count: 3 // simulate exhausted retries
  });

  updateMailJob(failJob.id, {
    status: 'FAILED',
    failure_reason: 'SMTP connection unavailable (Simulated error)'
  });

  const finalFailAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(failAlert.id);
  assert(finalFailAlert.status === 'OPEN', 'Requirement 11: Alert status remains OPEN on mail failure');
  assert(finalFailAlert.email_status === 'FAILED', 'Alert email_status is FAILED');
  assert(finalFailAlert.email_error.includes('SMTP connection unavailable'), 'Alert records failure reason');

  // Test 8: Manual retry mechanism (Requirement 12 & 13)
  const retryResult = await mailQueueService.retryJob(failJob.id);
  assert(retryResult.job.status === 'SENT', 'Requirement 12: Manual retry successfully re-executes mail job');
  const alertAfterRetry = db.prepare('SELECT * FROM alerts WHERE id = ?').get(failAlert.id);
  assert(alertAfterRetry.email_status === 'SENT', 'Alert email_status synchronized to SENT after retry');

  // Clean up test file
  try {
    if (fs.existsSync(testEvidencePath)) fs.unlinkSync(testEvidencePath);
  } catch (_) {}

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` SUMMARY: ${passed} / ${passed + failed} MAIL PIPELINE TESTS PASSED (${failed} FAILED)`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMailPipelineTests().catch(err => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
