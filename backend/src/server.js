import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRouter from './routes/api.js';
import { rfidService } from './services/rfidService.js';
import { visionService } from './services/visionService.js';
import { correlationEngine } from './services/correlationEngine.js';
import { requireAdmin } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Socket.io initialization with open CORS for dev & production dashboard
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Protect evidence directory with administrator authentication (Rule 9: Evidence Privacy)
app.use('/evidence', requireAdmin);

// Serve cropped object evidence images with multi-path resolution
const evidenceDir = path.resolve(__dirname, '../uploads/evidence');
app.use('/evidence', express.static(evidenceDir));
app.use('/evidence/authorized', express.static(path.resolve(evidenceDir, 'authorized')));
app.use('/evidence/unauthorized', express.static(path.resolve(evidenceDir, 'unauthorized')));

// Intelligent fallback resolver for evidence files
app.get('/evidence/:filename(*)', (req, res, next) => {
  const rawParam = req.params.filename || '';
  const base = path.basename(rawParam);
  const candidates = [
    path.resolve(evidenceDir, base),
    path.resolve(evidenceDir, 'authorized', base),
    path.resolve(evidenceDir, 'unauthorized', base),
    path.resolve(__dirname, '../../../uploads/evidence', base),
    path.resolve(__dirname, '../../../uploads/evidence/authorized', base),
    path.resolve(__dirname, '../../../uploads/evidence/unauthorized', base)
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        const stats = fs.statSync(cand);
        if (stats.size > 0) {
          return res.sendFile(cand);
        }
      } catch (_) {}
    }
  }

  next();
});

// Mount REST API
app.use('/api', apiRouter);

// Root healthcheck
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'Red Tag Area Monitoring System',
    stack: 'Node.js + Express + SQLite + SerialPort + Vision',
    time: new Date().toISOString()
  });
});

// Initialize core services
correlationEngine.init(io);
rfidService.init(io);
visionService.init(io);

// Socket.IO real-time event subscriptions
io.on('connection', (socket) => {
  console.log(`⚡ Dashboard client connected: ${socket.id}`);

  // Send initial state to newly connected client
  socket.emit('initial_state', {
    roi: visionService.getROI(),
    polygon_vertices: visionService.getPolygon(),
    rfidConnected: rfidService.isConnected,
    rfidPort: rfidService.currentPortName,
    activeToken: rfidService.getActiveToken()
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Dashboard client disconnected: ${socket.id}`);
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Red Tag Monitoring Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO real-time server ready`);
  console.log(`🔒 Privacy Evidence Directory: ${evidenceDir}`);
  console.log(`======================================================\n`);
});

export { app, server, io };
