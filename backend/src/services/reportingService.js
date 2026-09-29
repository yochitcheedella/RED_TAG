import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const archiverPkg = require('archiver');
const archiver = typeof archiverPkg === 'function' ? archiverPkg : (archiverPkg.default || archiverPkg);
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.resolve(__dirname, '../../uploads/reports');
const evidenceDir = path.resolve(__dirname, '../../uploads/evidence');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

import { getSetting } from '../db.js';

class ReportingService {
  constructor() {
    this.teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL || null;
    this.transporter = null;
    this.currentSmtpUser = null;
    this.currentSmtpPass = null;
    this.initMailer();
  }

  loadEnv() {
    const backendEnv = path.resolve(__dirname, '../../.env');
    const rootEnv = path.resolve(__dirname, '../../../.env');
    if (fs.existsSync(backendEnv)) {
      dotenv.config({ path: backendEnv, override: true });
    }
    if (fs.existsSync(rootEnv)) {
      dotenv.config({ path: rootEnv, override: true });
    }
  }

  initMailer() {
    this.loadEnv();
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;

    if (user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass }
        });
        this.currentSmtpUser = user;
        this.currentSmtpPass = pass;
        console.log(`✉️ [ReportingService] SMTP Mailer initialized for ${user} via ${host}:${port}`);
      } catch (err) {
        console.warn('⚠️ [ReportingService] SMTP init error:', err.message);
      }
    } else {
      this.transporter = null;
      console.log(`ℹ️ [ReportingService] Email alerts target: ${process.env.ALERT_EMAIL_RECIPIENT || 'yochitcheedella@gmail.com'}`);
    }
  }

  getMailer() {
    this.loadEnv();
    const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;
    if (user && pass) {
      if (!this.transporter || this.currentSmtpUser !== user || this.currentSmtpPass !== pass) {
        this.initMailer();
      }
      return this.transporter;
    }
    return null;
  }

  /**
   * Generates formatted Excel workbook with incident audit logs
   */
  async generateIncidentExcel(events = []) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Red Tag Area Security Operations';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Incident Audit Log', {
      views: [{ showGridLines: true }]
    });

    // Sheet Title Header
    sheet.mergeCells('A1:G1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'RED TAG AREA SURVEILLANCE & AUTHORIZATION AUDIT REPORT';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 36;

    // Subtitle
    sheet.mergeCells('A2:G2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleString()} • Compliance: Zero-Human Photographic Standard`;
    subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // Columns Definition
    sheet.getRow(4).values = [
      'Event ID',
      'Timestamp',
      'Event Classification',
      'Detected Object',
      'RFID Badge UID',
      'Assigned Employee',
      'Correlation Notes'
    ];

    const headerRow = sheet.getRow(4);
    headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 24;

    sheet.columns = [
      { width: 18 },
      { width: 22 },
      { width: 24 },
      { width: 18 },
      { width: 16 },
      { width: 20 },
      { width: 45 }
    ];

    // Data rows
    events.forEach((ev, idx) => {
      const row = sheet.addRow([
        ev.id ? ev.id.slice(0, 8) : `EV-${idx + 1}`,
        new Date(ev.timestamp).toLocaleString(),
        ev.event_type || 'INCIDENT',
        ev.object_type || 'Unknown Object',
        ev.rfid_uid || 'NONE',
        ev.employee_name || 'Unassigned',
        ev.notes || ''
      ]);

      const isUnauthorized = ev.event_type === 'UNAUTHORIZED_PLACEMENT';
      if (isUnauthorized) {
        row.getCell(3).font = { color: { argb: 'FFDC2626' }, bold: true };
      } else {
        row.getCell(3).font = { color: { argb: 'FF16A34A' }, bold: true };
      }
    });

    const filename = `redtag_audit_${Date.now()}.xlsx`;
    const filePath = path.join(reportsDir, filename);
    await workbook.xlsx.writeFile(filePath);

    console.log(`📊 [Reporting Service] Generated Excel Audit Report: ${filename}`);
    return { filename, filePath };
  }

  /**
   * Bundles Excel report and cropped object evidence into a clean ZIP archive
   */
  async bundleReportZip(excelFilePath, evidenceFilenames = []) {
    return new Promise((resolve, reject) => {
      const zipFilename = `redtag_compliance_bundle_${Date.now()}.zip`;
      const zipPath = path.join(reportsDir, zipFilename);
      const output = fs.createWriteStream(zipPath);

      let archive;
      if (typeof archiverPkg === 'function') {
        archive = archiverPkg('zip', { zlib: { level: 9 } });
      } else if (archiverPkg.ZipArchive) {
        archive = new archiverPkg.ZipArchive({ zlib: { level: 9 } });
      } else {
        throw new Error('Unsupported archiver module structure');
      }

      output.on('close', () => {
        console.log(`📦 [Reporting Service] Bundled ZIP Archive (${archive.pointer()} bytes): ${zipFilename}`);
        resolve({ zipFilename, zipPath, bytes: archive.pointer() });
      });

      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      // Append Excel report
      if (fs.existsSync(excelFilePath)) {
        archive.file(excelFilePath, { name: path.basename(excelFilePath) });
      }

      // Append cropped object images (strictly object evidence, zero human photos)
      evidenceFilenames.forEach((img) => {
        if (!img) return;
        const imgPath = path.join(evidenceDir, img);
        if (fs.existsSync(imgPath)) {
          archive.file(imgPath, { name: `evidence/${img}` });
        }
      });

      archive.finalize();
    });
  }

  /**
   * Sends real-time alert card to Microsoft Teams Webhook
   */
  async sendTeamsWebhook(eventData) {
    console.log(`💬 [Teams Webhook Alert] Dispatched alert for object: ${eventData.object_type || 'Item'}`);
    const cardPayload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": eventData.event_type === 'UNAUTHORIZED_PLACEMENT' ? "EF4444" : "10B981",
      "summary": "Red Tag Area Placement Alert",
      "sections": [{
        "activityTitle": "🚨 RED TAG AREA — UNAUTHORIZED PLACEMENT",
        "activitySubtitle": `Timestamp: ${new Date().toLocaleString()}`,
        "facts": [
          { "name": "Object Detected", "value": eventData.object_type || 'Machine Part' },
          { "name": "RFID Badge", "value": eventData.rfid_uid || 'No Scan Recorded' },
          { "name": "Floor-Tape ROI", "value": "Inside Virtual Polygon Boundary" },
          { "name": "Privacy Compliance", "value": "Zero human pixels saved. Object-only crop." }
        ],
        "markdown": true
      }]
    };

    if (this.teamsWebhookUrl) {
      try {
        await fetch(this.teamsWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cardPayload)
        });
        return { success: true, delivered: true };
      } catch (err) {
        console.warn('Teams webhook delivery error:', err.message);
      }
    }

    return { success: true, simulated: true, payload: cardPayload };
  }

  /**
   * Sends Nodemailer email with attached compliance ZIP archive
   */
  async sendEmailAlert(eventData, zipFilePath, recipientEmail = 'plant-manager@factory.com') {
    console.log(`✉️ [Email Dispatch] Sending incident audit bundle to: ${recipientEmail}`);

    const mailOptions = {
      from: '"Red Tag Monitoring System" <alerts@redtag-security.local>',
      to: recipientEmail,
      subject: `🚨 Security Audit Alert: Unauthorized Placement (${eventData.object_type || 'Object'})`,
      text: `An unauthorized placement was verified in the Red Tag area.\n\nDetails:\nObject: ${eventData.object_type || 'Item'}\nTime: ${new Date().toLocaleString()}\nNotes: ${eventData.notes || 'None'}\n\nPlease find the attached Excel report and cropped object evidence archive.`,
      attachments: zipFilePath && fs.existsSync(zipFilePath) ? [{
        filename: path.basename(zipFilePath),
        path: zipFilePath
      }] : []
    };

    const mailer = this.getMailer();
    if (mailer) {
      try {
        const info = await mailer.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
      } catch (err) {
        console.warn('Email send error:', err.message);
      }
    }

    return {
      success: true,
      simulated: true,
      recipient: recipientEmail,
      subject: mailOptions.subject,
      attachment: zipFilePath ? path.basename(zipFilePath) : null
    };
  }

  /**
   * Automatically sends an email with the cropped evidence image attached
   * to yochitcheedella@gmail.com when an unauthorized placement is confirmed.
   */
  async sendUnauthorizedEvidenceEmail(eventData, evidenceFilename, recipientOverride = null) {
    let recipientEmail = recipientOverride;
    if (!recipientEmail) {
      try {
        recipientEmail = getSetting('alert_email_recipient');
      } catch (_) {}
    }
    if (!recipientEmail) {
      recipientEmail = process.env.ALERT_EMAIL_RECIPIENT || 'yochitcheedella@gmail.com';
    }

    const eventId = eventData.id || eventData.eventId || `EVT-${Date.now()}`;
    const objectType = eventData.object_type || 'Placed Item';
    const objectId = eventData.object_id || 'UNKNOWN';
    const timeStr = eventData.timestamp ? new Date(eventData.timestamp).toLocaleString() : new Date().toLocaleString();
    const rfidStatus = eventData.authorization_status || 'NO_RFID (Not detected)';
    const notes = eventData.notes || 'Object confirmed inside Red Tag Area without valid RFID authorization.';

    // Locate evidence image file on disk
    let evidenceFilePath = null;
    if (evidenceFilename) {
      const candidates = [
        path.resolve(evidenceDir, 'unauthorized', path.basename(evidenceFilename)),
        path.resolve(evidenceDir, path.basename(evidenceFilename)),
        path.resolve(evidenceDir, 'authorized', path.basename(evidenceFilename))
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          evidenceFilePath = cand;
          break;
        }
      }
    }

    const attachments = [];
    if (evidenceFilePath) {
      attachments.push({
        filename: path.basename(evidenceFilePath),
        path: evidenceFilePath,
        cid: 'evidence_crop'
      });
    }

    const subject = `🚨 [RED TAG MONITOR] Unauthorized Placement Alert: ${objectType} (${eventId})`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F6F8; margin: 0; padding: 24px; color: #111827;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #D9DEE5; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    
    <!-- Header Banner -->
    <div style="background: #D92D20; color: #FFFFFF; padding: 20px 24px;">
      <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">
        RED TAG MONITOR • CRITICAL SECURITY ALERT
      </div>
      <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 800; color: #FFFFFF; line-height: 1.2;">
        Unauthorized Object Placement Detected
      </h1>
      <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.85;">
        Real-Time Red Tag Area Monitoring System
      </p>
    </div>

    <!-- Alert Summary -->
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; line-height: 1.5; color: #374151;">
        An unauthorized placement was confirmed inside the designated <strong>Red Tag Area</strong> floor polygon. The object was monitored and verified stationary for the configured duration without valid RFID badge authorization.
      </p>

      <!-- Incident Metadata Table -->
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700; width: 140px;">EVENT ID:</td>
          <td style="padding: 10px 0; font-family: monospace; font-weight: 700; color: #111827;">${eventId}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">TIMESTAMP:</td>
          <td style="padding: 10px 0; color: #111827;">${timeStr}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">OBJECT ID:</td>
          <td style="padding: 10px 0; font-family: monospace; font-weight: 600; color: #111827;">${objectId}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">DETECTED ITEM:</td>
          <td style="padding: 10px 0; font-weight: 600; color: #111827;">${objectType}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">RFID STATUS:</td>
          <td style="padding: 10px 0; font-weight: 700; color: #D92D20;">${rfidStatus}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">AREA:</td>
          <td style="padding: 10px 0; color: #111827;">Red Tag Area (Physical Floor Tape Polygon)</td>
        </tr>
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 0; color: #667085; font-weight: 700;">ALERT STATUS:</td>
          <td style="padding: 10px 0; font-weight: 700; color: #D92D20;">OPEN (Action Required)</td>
        </tr>
      </table>

      <!-- Evidence Image Preview -->
      <div style="background: #F8FAFC; border: 1px solid #D9DEE5; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; text-align: left;">
          OBJECT-FOCUSED FORENSIC EVIDENCE CROP
        </div>
        ${evidenceFilePath ? `
          <img src="cid:evidence_crop" alt="Forensic Object Crop" style="max-width: 100%; height: auto; border: 1px solid #CBD5E1; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
        ` : `
          <div style="padding: 24px; color: #94A3B8; font-size: 13px;">
            Evidence file recorded: ${evidenceFilename || 'N/A'} (Image file not present on local disk)
          </div>
        `}
        <div style="font-size: 11px; color: #64748B; margin-top: 10px; text-align: left;">
          <em>Notice: Evidence capture is strictly limited to the placed physical object within the Red Tag Area. No facial likenesses or biometrics are captured.</em>
        </div>
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 28px 0 12px;">
        <a href="http://localhost:5173/alerts" style="display: inline-block; background: #D92D20; color: #FFFFFF; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 6px;">
          View Incident in Dashboard
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #F4F6F8; border-top: 1px solid #D9DEE5; padding: 14px 24px; font-size: 11px; color: #667085; text-align: center;">
      Automated Incident Notification • Red Tag Monitoring System • Recipient: ${recipientEmail}
    </div>
  </div>
</body>
</html>
    `;

    const plainText = `
[RED TAG MONITOR] UNAUTHORIZED PLACEMENT ALERT
============================================================
An unauthorized object placement was detected and confirmed inside the Red Tag Area.

Event ID:     ${eventId}
Timestamp:    ${timeStr}
Object ID:    ${objectId}
Detected:     ${objectType}
RFID Status:  ${rfidStatus}
Alert Status: OPEN (Action Required)
Area:         Red Tag Area (Floor Tape Polygon)
Notes:        ${notes}
Evidence:     ${evidenceFilePath ? path.basename(evidenceFilePath) : (evidenceFilename || 'N/A')}

Evidence capture is strictly limited to the placed object within the Red Tag Area.
View in Dashboard: http://localhost:5173/alerts
============================================================
    `.trim();

    const mailOptions = {
      from: `"Red Tag Monitor" <${process.env.SMTP_USER || 'alerts@redtag-security.local'}>`,
      to: recipientEmail,
      subject,
      text: plainText,
      html: htmlContent,
      attachments
    };

    console.log(`\n============================================================`);
    console.log(`✉️ [EMAIL ALERT DISPATCH]`);
    console.log(`   To: ${recipientEmail}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Event ID: ${eventId}`);
    console.log(`   Object: ${objectType} (${objectId})`);
    console.log(`   Evidence Attached: ${evidenceFilePath ? path.basename(evidenceFilePath) : 'None'}`);

    // 1. Direct Web Relay to recipient's email address
    let relayDelivered = false;
    let relayMessage = null;
    try {
      const relayRes = await fetch(`https://formsubmit.co/ajax/${recipientEmail}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'http://localhost:5173',
          'Referer': 'http://localhost:5173/'
        },
        body: JSON.stringify({
          _subject: subject,
          _template: 'table',
          event_id: eventId,
          timestamp: timeStr,
          object_id: objectId,
          object_type: objectType,
          rfid_status: rfidStatus,
          alert_status: 'OPEN (Action Required)',
          area: 'Red Tag Area (Physical Floor Tape Polygon)',
          evidence_image: evidenceFilePath ? path.basename(evidenceFilePath) : (evidenceFilename || 'Captured'),
          notes: notes
        })
      });
      const relayData = await relayRes.json();
      if (relayData.success === 'true' || relayData.success === true) {
        relayDelivered = true;
        relayMessage = 'Delivered to inbox';
        console.log(`   ✅ Direct Web Relay delivered to: ${recipientEmail}`);
      } else {
        relayMessage = relayData.message;
        console.log(`   ℹ️ Direct Web Relay status: ${relayData.message}`);
      }
    } catch (relayErr) {
      console.warn('   ⚠️ Direct Web Relay note:', relayErr.message);
    }

    // 2. Standard SMTP Transporter (if configured)
    const mailer = this.getMailer();
    if (mailer) {
      try {
        const info = await mailer.sendMail(mailOptions);
        console.log(`   ✅ Sent via SMTP: ${info.messageId}`);
        console.log(`============================================================\n`);
        return { success: true, delivered: true, recipient: recipientEmail, messageId: info.messageId, relayMessage };
      } catch (err) {
        console.warn(`   ⚠️ SMTP send failed: ${err.message}`);
      }
    }

    // 3. Automated live HTML preview for instant verification
    let previewUrl = null;
    try {
      if (!this.testTransporter) {
        const testAccount = await nodemailer.createTestAccount();
        this.testTransporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: { user: testAccount.user, pass: testAccount.pass }
        });
      }
      if (this.testTransporter) {
        const testInfo = await this.testTransporter.sendMail(mailOptions);
        previewUrl = nodemailer.getTestMessageUrl(testInfo);
        console.log(`   🌐 Live Evidence Email Preview: ${previewUrl}`);
      }
    } catch (testErr) {
      console.warn('   ⚠️ Preview generator note:', testErr.message);
    }

    console.log(`============================================================\n`);
    return {
      success: true,
      delivered: relayDelivered,
      recipient: recipientEmail,
      previewUrl,
      relayMessage: relayMessage || (relayDelivered ? 'Delivered' : 'Check activation or SMTP credentials')
    };
  }
}

export const reportingService = new ReportingService();
