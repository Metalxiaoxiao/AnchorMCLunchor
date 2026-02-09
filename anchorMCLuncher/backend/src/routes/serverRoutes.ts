import express from 'express';
import serverController from '../controllers/serverController';
import authenticateToken from '../middleware/authMiddleware';

const router = express.Router();

// Public route to list servers
router.get('/', serverController.getAllServers);

// Protected routes
router.post('/', authenticateToken, serverController.createServer);
router.put('/:id', authenticateToken, serverController.updateServer);
router.delete('/:id', authenticateToken, serverController.deleteServer);

export default router;
