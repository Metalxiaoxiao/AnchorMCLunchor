import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import axios from 'axios';
import { getCAFConfig } from '../services/cafService';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for login states (state -> { status, token, user })
const loginStates = new Map<string, { status: 'pending' | 'success' | 'failed', token?: string, user?: any }>();

const register = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const [existingUsers] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uuid = uuidv4();
    await db.query<ResultSetHeader>('INSERT INTO users (username, password, uuid) VALUES (?, ?, ?)', [username, hashedPassword, uuid]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getCAFLoginUrl = (req: Request, res: Response) => {
  try {
    const cafConfig = getCAFConfig();
    const cafUrl = process.env.CAF_SERVER_URL;
    const state = uuidv4();
    
    // Assuming the backend is running on localhost:3000 for the callback
    // In production, this should be the public URL of the backend
    // We append state to the redirect_uri because CAF server might not pass back the state parameter directly
    const redirectUri = `http://localhost:3000/api/auth/callback?state=${state}`;
    
    const loginUrl = `${cafUrl}/web/oauth/authorize?client_id=${cafConfig.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    
    loginStates.set(state, { status: 'pending' });
    
    // Clean up state after 5 minutes
    setTimeout(() => loginStates.delete(state), 5 * 60 * 1000);

    res.json({ url: loginUrl, state });
  } catch (error) {
    console.error('Failed to generate CAF login URL:', error);
    res.status(500).json({ message: 'Failed to initialize CAF login' });
  }
};

const cafCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).send('Invalid request');
  }

  const loginState = loginStates.get(state);
  if (!loginState) {
    return res.status(400).send('Invalid or expired state');
  }

  try {
    const cafConfig = getCAFConfig();
    const cafUrl = process.env.CAF_SERVER_URL;

    const response = await axios.post(`${cafUrl}/api/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: cafConfig.clientId,
      client_secret: cafConfig.clientSecret,
      code
    });

    const { access_token } = response.data;
    
    // Fetch user info from CAF using the access token
    let cafUsername;
    try {
      const userInfoResponse = await axios.get(`${cafUrl}/api/user/info`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      cafUsername = userInfoResponse.data.username;
    } catch (err) {
      console.warn('Failed to fetch user info from CAF, falling back to token decode:', err);
      const decoded: any = jwt.decode(access_token);
      cafUsername = decoded?.username || decoded?.sub;
    }

    if (!cafUsername) {
      throw new Error('Could not determine username from token or user info endpoint');
    }

    // Auto-register or login local user
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [cafUsername]);
    
    let user;
    if (users.length === 0) {
      // Auto-register with a random password since we don't know the real one
      const dummyPassword = await bcrypt.hash(uuidv4(), 10);
      const uuid = uuidv4();
      const [result] = await db.query<ResultSetHeader>('INSERT INTO users (username, password, uuid) VALUES (?, ?, ?)', [cafUsername, dummyPassword, uuid]);
      user = { id: result.insertId, username: cafUsername, uuid };
    } else {
      user = users[0];
    }

    const localToken = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    loginStates.set(state, { status: 'success', token: localToken, user: { id: user.id, username: user.username, uuid: user.uuid } });

    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录成功</title>
  <style>
    body {
      background: #fff;
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      max-width: 400px;
      width: 100%;
      padding: 1.5rem;
      background-color: #fff;
      border: 1px solid #e3eaf2;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 24px 0 #0001;
      transition: all 0.3s ease;
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    .logo-text {
      font-size: 1.4rem;
      font-weight: bold;
      color: #0ea5e9;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin-left: 0.5rem;
    }
    h1 {
      color: #0ea5e9;
      margin: 0 0 10px 0;
      font-size: 2rem;
      font-weight: 600;
      letter-spacing: 1px;
      text-align: center;
    }
    p {
      color: #64748b;
      margin: 0 0 18px 0;
      font-size: 1.1rem;
      text-align: center;
    }
    .close-btn {
      width: 100%;
      padding: 0.8rem 1.2rem;
      background-color: #0ea5e9;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease;
      text-align: center;
      position: relative;
      z-index: 1;
      box-shadow: 0 1px 3px rgba(14,165,233,0.12);
      margin-top: 10px;
    }
    .close-btn:hover {
      background-color: #0284c7;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span class="logo-text">西浦沙盒社</span>
    </div>
    <h1>登录成功</h1>
    <p>你可以关闭此页面并返回启动器。</p>
    <button class="close-btn" onclick="window.close()">关闭窗口</button>
  </div>
</body>
</html>`);

  } catch (error) {
    console.error('CAF Callback failed:', error);
    loginStates.set(state, { status: 'failed' });
    res.status(500).send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录失败</title>
  <style>
    body {
      background: #fff;
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      max-width: 400px;
      width: 100%;
      padding: 1.5rem;
      background-color: #fff;
      border: 1px solid #e3eaf2;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 24px 0 #0001;
      transition: all 0.3s ease;
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    .logo-text {
      font-size: 1.4rem;
      font-weight: bold;
      color: #0ea5e9;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin-left: 0.5rem;
    }
    h1 {
      color: #0ea5e9;
      margin: 0 0 10px 0;
      font-size: 2rem;
      font-weight: 600;
      letter-spacing: 1px;
      text-align: center;
    }
    p {
      color: #64748b;
      margin: 0 0 18px 0;
      font-size: 1.1rem;
      text-align: center;
    }
    .close-btn {
      width: 100%;
      padding: 0.8rem 1.2rem;
      background-color: #0ea5e9;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease;
      text-align: center;
      position: relative;
      z-index: 1;
      box-shadow: 0 1px 3px rgba(14,165,233,0.12);
      margin-top: 10px;
    }
    .close-btn:hover {
      background-color: #0284c7;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span class="logo-text">西浦沙盒社</span>
    </div>
    <h1>登录失败</h1>
    <p>登录失败，请重试或联系管理员。</p>
    <button class="close-btn" onclick="window.close()">关闭窗口</button>
  </div>
</body>
</html>`);
  }
};

const checkLoginStatus = (req: Request, res: Response) => {
  const { state } = req.query;
  
  if (!state || typeof state !== 'string') {
    return res.status(400).json({ message: 'State is required' });
  }

  const loginState = loginStates.get(state);
  if (!loginState) {
    return res.status(404).json({ message: 'State not found' });
  }

  if (loginState.status === 'success') {
    // Clear state after successful retrieval
    loginStates.delete(state);
    return res.json({ status: 'success', token: loginState.token, user: loginState.user });
  }

  res.json({ status: loginState.status });
};


// 删除服务器接口
const deleteServer = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Server id is required' });
  }
  try {
    await db.query('DELETE FROM servers WHERE id = ?', [id]);
    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export default { register, login, getCAFLoginUrl, cafCallback, checkLoginStatus, deleteServer };
