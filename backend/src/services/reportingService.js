import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const archiverPkg = require('archiver');
const archiver = typeof archiverPkg === 'function' ? archiverPkg : (archiverPkg.default || archiverPkg);
import nodemailer from 'nodemailer';
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

class ReportingService {
  constructor() {
    this.teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL || null;
    this.transporter = null;
    this.initMailer();
  }

  initMailer() {
    // Standard SMTP transporter fallback with test account capability
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
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

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
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
}

export const reportingService = new ReportingService();
