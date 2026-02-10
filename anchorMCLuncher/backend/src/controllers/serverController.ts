import { Request, Response } from 'express';
import db from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import * as dockerService from '../services/dockerService';

const getAllServers = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT s.*, ds.container_id 
      FROM servers s 
      LEFT JOIN docker_servers ds ON s.container_id = ds.container_id
    `;
    const [servers] = await db.query<RowDataPacket[]>(query);
    res.json(servers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const createServer = async (req: Request, res: Response) => {
  const { name, ip_address, port, description } = req.body;

  if (!name || !ip_address) {
    return res.status(400).json({ message: 'Name and IP address are required' });
  }

  try {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO servers (name, ip_address, port, description) VALUES (?, ?, ?, ?)',
      [name, ip_address, port || 25565, description]
    );
    res.status(201).json({ id: result.insertId, name, ip_address, port, description });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateServer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, ip_address, port, description } = req.body;

  try {
    await db.query(
      'UPDATE servers SET name = ?, ip_address = ?, port = ?, description = ? WHERE id = ?',
      [name, ip_address, port, description, id]
    );
    res.json({ message: 'Server updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteServer = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, container_id FROM servers WHERE id = ?',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Server not found' });
    }

    const containerId = rows[0].container_id as string | null;

    if (containerId) {
      await dockerService.deleteDockerServer(containerId);
      return res.json({ message: 'Docker server deleted successfully' });
    }

    await db.query('DELETE FROM servers WHERE id = ?', [id]);
    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export default { getAllServers, createServer, updateServer, deleteServer };
