import express from 'express';
import * as dockerController from '../controllers/dockerController';
import authenticateToken from '../middleware/authMiddleware';
import multer from 'multer';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/create', authenticateToken, dockerController.createServer);
router.get('/list', authenticateToken, dockerController.listServers);
router.post('/:id/start', authenticateToken, dockerController.startServer);
router.post('/:id/stop', authenticateToken, dockerController.stopServer);
router.post('/:id/command', authenticateToken, dockerController.sendCommand);
router.post('/:id/upload', authenticateToken, upload.single('file'), dockerController.uploadFile);
router.get('/:id/files', authenticateToken, dockerController.listFiles);
router.delete('/:id/files', authenticateToken, dockerController.deleteFile);
router.post('/:id/files/folder', authenticateToken, dockerController.createFolder);

router.get('/:id/client-config', authenticateToken, dockerController.getClientConfig);
router.post('/:id/client-config', authenticateToken, dockerController.updateClientConfig);
router.post('/:id/client-upload', authenticateToken, upload.single('file'), dockerController.uploadClientFile);
router.get('/:id/client-manifest', authenticateToken, dockerController.getClientManifest);
router.get('/:id/client-config-status', authenticateToken, dockerController.checkClientConfigStatus);
router.get('/:id/client-files/*', authenticateToken, dockerController.downloadClientFile);

// File content operations for text editor
router.get('/:id/file-content', authenticateToken, dockerController.readFileContent);
router.post('/:id/file-content', authenticateToken, dockerController.writeFileContent);

// Copy and paste operations
router.post('/:id/files/copy', authenticateToken, dockerController.copyFile);
router.post('/:id/files/paste', authenticateToken, dockerController.pasteFile);

export default router;
