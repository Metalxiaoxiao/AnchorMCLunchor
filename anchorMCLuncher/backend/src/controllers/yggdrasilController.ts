import { Request, Response } from 'express';
import db from '../config/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { keys } from '../config/keys';
import crypto from 'crypto';

// Helper to format UUID without dashes (Minecraft style)
const formatUUID = (uuid: string) => uuid.replace(/-/g, '');

// Helper to sign data
const signData = (data: string) => {
  const sign = crypto.createSign('SHA1');
  sign.update(data);
  sign.end();
  return sign.sign(keys.privateKey, 'base64');
};

const authenticate = async (req: Request, res: Response) => {
  const { username, password, clientToken, requestUser } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials.' });
  }

  try {
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials. Invalid username or password.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials. Invalid username or password.' });
    }

    const accessToken = uuidv4(); // Hex string with dashes usually, but Yggdrasil often uses hex without dashes. Let's stick to standard UUID for now or strip dashes if needed. Minecraft usually expects hex without dashes for UUIDs, but tokens can be anything. Let's use standard UUID.
    const finalClientToken = clientToken || uuidv4();

    // Store token
    await db.query('INSERT INTO tokens (access_token, client_token, user_id) VALUES (?, ?, ?)', [accessToken, finalClientToken, user.id]);

    const response: any = {
      accessToken,
      clientToken: finalClientToken,
      selectedProfile: {
        id: formatUUID(user.uuid),
        name: user.username
      },
      availableProfiles: [
        {
          id: formatUUID(user.uuid),
          name: user.username
        }
      ]
    };

    if (requestUser) {
      response.user = {
        id: formatUUID(user.uuid),
        properties: [] // Add properties if needed (e.g. language)
      };
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const refresh = async (req: Request, res: Response) => {
  const { accessToken, clientToken, requestUser } = req.body;

  if (!accessToken || !clientToken) {
    return res.status(400).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token.' });
  }

  try {
    const [tokens] = await db.query<RowDataPacket[]>('SELECT * FROM tokens WHERE access_token = ? AND client_token = ?', [accessToken, clientToken]);

    if (tokens.length === 0) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token.' });
    }

    const token = tokens[0];
    const newAccessToken = uuidv4();

    // Invalidate old token and create new one
    await db.query('DELETE FROM tokens WHERE access_token = ?', [accessToken]);
    await db.query('INSERT INTO tokens (access_token, client_token, user_id) VALUES (?, ?, ?)', [newAccessToken, clientToken, token.user_id]);

    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [token.user_id]);
    const user = users[0];

    const response: any = {
      accessToken: newAccessToken,
      clientToken,
      selectedProfile: {
        id: formatUUID(user.uuid),
        name: user.username
      }
    };

    if (requestUser) {
      response.user = {
        id: formatUUID(user.uuid),
        properties: []
      };
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const validate = async (req: Request, res: Response) => {
  const { accessToken, clientToken } = req.body;

  try {
    let query = 'SELECT * FROM tokens WHERE access_token = ?';
    let params = [accessToken];

    if (clientToken) {
      query += ' AND client_token = ?';
      params.push(clientToken);
    }

    const [tokens] = await db.query<RowDataPacket[]>(query, params);

    if (tokens.length === 0) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token.' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const invalidate = async (req: Request, res: Response) => {
  const { accessToken, clientToken } = req.body;

  try {
    await db.query('DELETE FROM tokens WHERE access_token = ? AND client_token = ?', [accessToken, clientToken]);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const signout = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials.' });
    }

    await db.query('DELETE FROM tokens WHERE user_id = ?', [user.id]);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

// Session Server Endpoints

// In-memory session store for simplicity (or use Redis/DB in production)
// Map<accessToken, serverId>
// Actually, standard Yggdrasil 'join' associates the accessToken with a serverId.
// And 'hasJoined' checks if the username has joined the serverId.
// We need to store this association.
// Let's add a table `server_joins` or just use memory if it's transient.
// Ideally DB.
// CREATE TABLE server_joins (access_token VARCHAR(255), server_id VARCHAR(255), user_id INT, created_at TIMESTAMP);

const join = async (req: Request, res: Response) => {
  const { accessToken, selectedProfile, serverId } = req.body;

  try {
    const [tokens] = await db.query<RowDataPacket[]>('SELECT * FROM tokens WHERE access_token = ?', [accessToken]);

    if (tokens.length === 0) {
      return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token.' });
    }

    const token = tokens[0];
    
    // Verify profile matches user
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [token.user_id]);
    const user = users[0];

    if (formatUUID(user.uuid) !== selectedProfile) {
       return res.status(403).json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid profile.' });
    }

    // Store join (using a simple in-memory map or DB? Let's use DB for persistence across restarts)
    // We need a table for this. For now, let's assume we can create it or use a simple hack.
    // Let's use a global Map for this session since I can't easily migrate DB again and again without user interaction.
    // But wait, I can create table if not exists in the code? No, better to stick to SQL file.
    // I'll add `server_joins` to `update_schema.sql` later or just use a Map.
    // Map is fine for a small project.
    
    // Actually, let's use a Map for now.
    serverJoins.set(selectedProfile, serverId); // Map profileId -> serverId

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const serverJoins = new Map<string, string>(); // profileId -> serverId

const hasJoined = async (req: Request, res: Response) => {
  const { username, serverId } = req.query;

  if (!username || !serverId) {
    return res.status(400).json({ error: 'IllegalArgumentException', errorMessage: 'Missing required parameters.' });
  }

  try {
    const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(204).send(); // Or 403? Standard says 204 if not joined? No, usually returns JSON if joined, 204 if not?
      // Actually, if successful, returns profile JSON. If not, 204 (No Content).
    }

    const user = users[0];
    const profileId = formatUUID(user.uuid);

    const joinedServerId = serverJoins.get(profileId);

    if (joinedServerId && joinedServerId === serverId) {
      // Return profile with textures
      const textureValue = Buffer.from(JSON.stringify({
        timestamp: Date.now(),
        profileId: profileId,
        profileName: user.username,
        textures: {
          SKIN: { url: user.skin_url || '' },
          CAPE: user.cape_url ? { url: user.cape_url } : undefined
        }
      })).toString('base64');

      const response: any = {
        id: profileId,
        name: user.username,
        properties: [
          {
            name: 'textures',
            value: textureValue,
            signature: signData(textureValue)
          }
        ]
      };
      return res.json(response);
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
  }
};

const profile = async (req: Request, res: Response) => {
    const { uuid } = req.params;
    try {
        // uuid might be with or without dashes
        // DB stores with dashes (from uuidv4).
        // We need to handle both.
        // Actually, I stored it as uuidv4() which has dashes.
        // formatUUID removes dashes.
        
        // If input has no dashes, we can't easily query if DB has dashes unless we strip dashes in SQL or fetch all.
        // Let's assume input might be either.
        
        // Better: Store UUID without dashes in DB? Or handle query.
        // Let's try to match both.
        
        const [users] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE uuid = ? OR REPLACE(uuid, "-", "") = ?', [uuid, uuid]);
        
        if (users.length === 0) {
            return res.status(204).send();
        }
        
        const user = users[0];
        
        const textureValue = Buffer.from(JSON.stringify({
          timestamp: Date.now(),
          profileId: formatUUID(user.uuid),
          profileName: user.username,
          textures: {
            SKIN: { url: user.skin_url || '' },
            CAPE: user.cape_url ? { url: user.cape_url } : undefined
          }
        })).toString('base64');

        const response = {
            id: formatUUID(user.uuid),
            name: user.username,
            properties: [
                 {
                    name: 'textures',
                    value: textureValue,
                    signature: signData(textureValue)
                  }
            ]
        };
        
        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'InternalServerError', errorMessage: 'Internal server error.' });
    }
}

export default { authenticate, refresh, validate, invalidate, signout, join, hasJoined, profile };
