import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/authRoutes';
import serverRoutes from './routes/serverRoutes';
import yggdrasilRoutes from './routes/yggdrasilRoutes';
import dockerRoutes from './routes/dockerRoutes';
import { initializeCAF } from './services/cafService';
import { cleanupMissingDockerServers } from './services/dockerService';
import { initDatabase } from './services/dbMigrationService';
import { keys } from './config/keys';
import Docker from 'dockerode';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const docker = new Docker();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/', yggdrasilRoutes);

app.get('/', (req, res) => {
  res.json({
    meta: {
      serverName: "AnchorMC",
      implementationName: "AnchorMC-Backend",
      implementationVersion: "1.0.0"
    },
    skinDomains: ["localhost"],
    signaturePublickey: keys.publicKey
  });
});

// Socket.IO for Virtual Console
io.on('connection', (socket: any) => {
  console.log('A user connected to console');
  
  socket.on('attach-console', async (containerId: string) => {
    try {
      const container = docker.getContainer(containerId);
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        logs: true
      });
      
      stream.on('data', (chunk: any) => {
        socket.emit('console-output', chunk.toString());
      });
      
      socket.on('console-input', (command: string) => {
        // For input, we might need a separate attach with stdin
        // Or just use the REST API for input for now to avoid complexity of bidirectional stream management here
        // But let's try to write if we can.
        // Actually, 'attach' returns a duplex stream if stdin is true.
        // But we attached with logs: true, which might complicate things.
        // Let's keep input via REST API for stability, or separate stream.
      });

      socket.on('disconnect', () => {
        // stream.destroy();
      });
    } catch (e) {
      console.error("Failed to attach", e);
    }
  });
});

const startServer = async () => {
  try {
    await initDatabase();
    await initializeCAF();
    await cleanupMissingDockerServers();

    setInterval(() => {
      cleanupMissingDockerServers().catch(err => {
        console.warn('Docker cleanup failed:', err?.message || err);
      });
    }, 5 * 60 * 1000);
    
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
