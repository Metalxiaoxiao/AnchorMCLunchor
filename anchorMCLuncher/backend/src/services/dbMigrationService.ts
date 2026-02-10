import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const dbName = process.env.DB_NAME || 'mc_launcher';

export const initDatabase = async () => {
  console.log('Checking database configuration...');
  
  // 1. Ensure Database Exists
  // Connect without database selected to create it if needed
  let connection = await mysql.createConnection({ ...dbConfig });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    console.log(`Database '${dbName}' checked/created.`);
  } catch (error) {
    console.error('Failed to check/create database:', error);
    throw error;
  } finally {
    await connection.end();
  }

  // 2. Connect to the specific database to manage tables
  connection = await mysql.createConnection({ ...dbConfig, database: dbName });

  try {
    // 3. Ensure Tables Exist
    
    // Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Servers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS servers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        ip_address VARCHAR(255) NOT NULL,
        port INT DEFAULT 25565,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Docker Servers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS docker_servers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        container_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        port INT NOT NULL,
        volume_path VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'stopped',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Tokens Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        access_token VARCHAR(255) PRIMARY KEY,
        client_token VARCHAR(255),
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 4. Check and Patch Columns (Schema Evolution)
    
    // Helper to check column existence
    const checkColumnExists = async (tableName: string, columnName: string) => {
      const [rows] = await connection.query<any[]>(`
        SELECT count(*) as count FROM information_schema.columns 
        WHERE table_schema = ? AND table_name = ? AND column_name = ?
      `, [dbName, tableName, columnName]);
      return rows[0].count > 0;
    };

    const checkIndexExists = async (tableName: string, indexName: string) => {
      const [rows] = await connection.query<any[]>(`
        SELECT count(*) as count FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ? AND index_name = ?
      `, [dbName, tableName, indexName]);
      return rows[0].count > 0;
    };

    const checkConstraintExists = async (tableName: string, constraintName: string) => {
      const [rows] = await connection.query<any[]>(`
        SELECT count(*) as count FROM information_schema.table_constraints
        WHERE table_schema = ? AND table_name = ? AND constraint_name = ?
      `, [dbName, tableName, constraintName]);
      return rows[0].count > 0;
    };

    // Patch Users Table
    if (!(await checkColumnExists('users', 'uuid'))) {
      console.log('Patching users table: adding uuid column');
      await connection.query('ALTER TABLE users ADD COLUMN uuid VARCHAR(36) UNIQUE');
    }
    
    if (!(await checkColumnExists('users', 'skin_url'))) {
      console.log('Patching users table: adding skin_url column');
      await connection.query('ALTER TABLE users ADD COLUMN skin_url VARCHAR(255)');
    }

    if (!(await checkColumnExists('users', 'cape_url'))) {
      console.log('Patching users table: adding cape_url column');
      await connection.query('ALTER TABLE users ADD COLUMN cape_url VARCHAR(255)');
    }

    // Patch Docker Servers Table
    if (!(await checkColumnExists('docker_servers', 'client_config_type'))) {
      console.log('Patching docker_servers table: adding client_config_type column');
      await connection.query('ALTER TABLE docker_servers ADD COLUMN client_config_type VARCHAR(50) DEFAULT NULL');
    }

    if (!(await checkColumnExists('docker_servers', 'client_config_value'))) {
      console.log('Patching docker_servers table: adding client_config_value column');
      await connection.query('ALTER TABLE docker_servers ADD COLUMN client_config_value TEXT DEFAULT NULL');
    }

    if (!(await checkColumnExists('docker_servers', 'version'))) {
      console.log('Patching docker_servers table: adding version column');
      await connection.query('ALTER TABLE docker_servers ADD COLUMN version VARCHAR(50) DEFAULT NULL');
    }

    // Patch Servers Table to link docker containers
    if (!(await checkColumnExists('servers', 'container_id'))) {
      console.log('Patching servers table: adding container_id column');
      await connection.query('ALTER TABLE servers ADD COLUMN container_id VARCHAR(255) DEFAULT NULL');
    }

    // Backfill container_id by port for existing docker entries
    await connection.query(`
      UPDATE servers s
      JOIN docker_servers ds ON s.port = ds.port
      SET s.container_id = ds.container_id
      WHERE s.container_id IS NULL
    `);

    // Remove orphaned docker-backed servers before adding FK
    await connection.query(`
      DELETE FROM servers
      WHERE container_id IS NOT NULL
        AND container_id NOT IN (SELECT container_id FROM docker_servers)
    `);

    if (!(await checkIndexExists('docker_servers', 'uq_docker_servers_container_id'))) {
      console.log('Patching docker_servers table: adding unique index on container_id');
      await connection.query('ALTER TABLE docker_servers ADD UNIQUE KEY uq_docker_servers_container_id (container_id)');
    }

    if (!(await checkIndexExists('servers', 'idx_servers_container_id'))) {
      console.log('Patching servers table: adding index on container_id');
      await connection.query('ALTER TABLE servers ADD INDEX idx_servers_container_id (container_id)');
    }

    if (!(await checkConstraintExists('servers', 'fk_servers_container_id'))) {
      console.log('Patching servers table: adding FK to docker_servers.container_id');
      await connection.query(
        'ALTER TABLE servers ADD CONSTRAINT fk_servers_container_id FOREIGN KEY (container_id) REFERENCES docker_servers(container_id) ON DELETE CASCADE'
      );
    }

    console.log('Database migration completed successfully.');

  } catch (error) {
    console.error('Database migration failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
};
