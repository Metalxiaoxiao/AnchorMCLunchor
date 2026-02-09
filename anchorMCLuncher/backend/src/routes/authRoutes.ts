import express from 'express';
import authController from '../controllers/authController';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/caf-login-url', authController.getCAFLoginUrl);
router.get('/callback', authController.cafCallback);

router.get('/caf-status', authController.checkLoginStatus);

// 删除服务器接口（需要登录验证可后续添加中间件）
router.delete('/server/:id', authController.deleteServer);

export default router;
