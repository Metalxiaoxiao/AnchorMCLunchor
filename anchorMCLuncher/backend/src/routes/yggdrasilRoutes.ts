import express from 'express';
import yggdrasilController from '../controllers/yggdrasilController';

const router = express.Router();

// Auth Server Routes
router.post('/authserver/authenticate', yggdrasilController.authenticate);
router.post('/authserver/refresh', yggdrasilController.refresh);
router.post('/authserver/validate', yggdrasilController.validate);
router.post('/authserver/invalidate', yggdrasilController.invalidate);
router.post('/authserver/signout', yggdrasilController.signout);

// Session Server Routes
router.post('/sessionserver/session/minecraft/join', yggdrasilController.join);
router.get('/sessionserver/session/minecraft/hasJoined', yggdrasilController.hasJoined);
router.get('/sessionserver/session/minecraft/profile/:uuid', yggdrasilController.profile);

// Profile API (Mojang API)
router.get('/api/profiles/minecraft/:uuid', yggdrasilController.profile);

export default router;
