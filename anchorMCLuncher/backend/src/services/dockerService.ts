import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import db from '../config/db';
import { RowDataPacket } from 'mysql2';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

const docker = new Docker(); // Defaults to socket/pipe
const SERVERS_DIR = path.resolve(__dirname, '../../minecraft_servers');

if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
}

export const createServer = async (userId: number, name: string, version: string, ram: string) => {
    // 0. Check Docker Availability
    try {
        await docker.ping();
    } catch (e) {
        console.error("Docker connection failed:", e);
        throw new Error("Docker Desktop 未运行或无法连接。请确保 Docker Desktop 已启动。");
    }

    // 1. Prepare Directory
    const serverDir = path.join(SERVERS_DIR, `${name}_${Date.now()}`);
    fs.mkdirSync(serverDir, { recursive: true });
    // Create data dir for mounting
    const dataDir = path.join(serverDir, 'data');
    fs.mkdirSync(dataDir);

    // 2. Find a free port (Simple random for now, better to check)
    const port = Math.floor(Math.random() * (65535 - 10000) + 10000);

    // 3. Create Container
    const imageName = 'itzg/minecraft-server';
    
    try {
        console.log(`Attempting to pull image: ${imageName}...`);
        // Promisify the pull stream to wait for completion
        await new Promise((resolve, reject) => {
            docker.pull(imageName, (err: any, stream: any) => {
                if (err) return reject(err);
                docker.modem.followProgress(stream, onFinished, onProgress);

                function onFinished(err: any, output: any) {
                    if (err) return reject(err);
                    resolve(output);
                }
                function onProgress(event: any) {
                    // Optional: log progress
                }
            });
        });
    } catch (e: any) {
        console.warn("Image pull failed:", e.message);
        console.log("Checking if image exists locally...");
        try {
            const image = docker.getImage(imageName);
            await image.inspect();
            console.log("Image found locally, proceeding with cached version.");
        } catch (inspectError) {
            console.error("Image not found locally.");
            throw new Error(`无法获取服务器镜像 '${imageName}'。下载失败且本地不存在。请检查网络连接（可能需要配置 Docker 镜像加速或代理）。错误: ${e.message}`);
        }
    }

    // Sanitize container name: only allow [a-zA-Z0-9][a-zA-Z0-9_.-]
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '') || 'server';
    const containerName = `mc_${safeName}_${Date.now()}`;

    const container = await docker.createContainer({
        Image: imageName,
        name: containerName,
        Env: [
            'EULA=TRUE',
            `VERSION=${version}`,
            `MEMORY=${ram}`
        ],
        HostConfig: {
            PortBindings: {
                '25565/tcp': [{ HostPort: port.toString() }]
            },
            Binds: [
                `${dataDir}:/data`
            ]
        },
        Tty: true,
        OpenStdin: true,
        StdinOnce: false
    });

    const containerId = container.id;

    // 4. Save to DB
    const [result] = await db.execute(
        'INSERT INTO docker_servers (user_id, container_id, name, port, volume_path, status, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, containerId, name, port, dataDir, 'created', version]
    );

    // 5. Add to public server list (optional, but requested)
    // Assuming host IP is localhost or auto-detected. For now use 'localhost' or '127.0.0.1'
    await db.execute(
        'INSERT INTO servers (name, ip_address, port, description) VALUES (?, ?, ?, ?)',
        [name, '127.0.0.1', port, `Docker Server: ${name}`]
    );

    return { containerId, port, serverDir };
};

export const listServers = async (userId: number) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT id, user_id, container_id, name, port, status, created_at, client_config_type, client_config_value, version FROM docker_servers WHERE user_id = ?', 
        [userId]
    );
    return rows;
};

export const startServer = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.start();
    await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', ['running', containerId]);
};

export const stopServer = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.stop();
    await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', ['stopped', containerId]);
};

export const getServerInfo = async (containerId: string) => {
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM docker_servers WHERE container_id = ?', [containerId]);
    return rows[0];
};

export const sendCommand = async (containerId: string, command: string) => {
    const container = docker.getContainer(containerId);
    // Attach to container and write command
    const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true
    });
    stream.write(command + '\n');
    // We don't close stream here immediately to allow output? 
    // Actually for single command, we might just write.
};

export const uploadFile = async (containerId: string, file: Express.Multer.File) => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");
    
    const targetPath = path.join(server.volume_path, file.originalname);
    fs.renameSync(file.path, targetPath);
};

export const listFiles = async (containerId: string, relativePath: string = '/') => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    // Security check: prevent directory traversal
    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (!fs.existsSync(targetPath)) {
        return [];
    }

    const files = fs.readdirSync(targetPath, { withFileTypes: true });
    return files.map(file => ({
        name: file.name,
        isDirectory: file.isDirectory(),
        size: file.isDirectory() ? 0 : fs.statSync(path.join(targetPath, file.name)).size,
        updatedAt: fs.statSync(path.join(targetPath, file.name)).mtime
    }));
};

export const deleteFile = async (containerId: string, relativePath: string) => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
};

export const createFolder = async (containerId: string, relativePath: string) => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
};

export const updateClientConfig = async (containerId: string, type: string, value: string) => {
    await db.execute(
        'UPDATE docker_servers SET client_config_type = ?, client_config_value = ? WHERE container_id = ?',
        [type, value, containerId]
    );
};

export const getClientConfig = async (containerId: string) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT client_config_type, client_config_value FROM docker_servers WHERE container_id = ?',
        [containerId]
    );
    return rows[0];
};

export const uploadClientFile = async (containerId: string, file: Express.Multer.File, clientType: string = 'full') => {
    const [rows] = await db.execute<RowDataPacket[]>('SELECT volume_path FROM docker_servers WHERE container_id = ?', [containerId]);
    
    if (!rows.length) throw new Error("Server not found");
    
    const volumePath = rows[0].volume_path;
    const serverRoot = path.dirname(volumePath);
    const clientDir = path.join(serverRoot, 'ClientForServer');
    
    // Clean up existing directory to ensure fresh state for new upload
    if (fs.existsSync(clientDir)) {
        fs.rmSync(clientDir, { recursive: true, force: true });
    }
    fs.mkdirSync(clientDir, { recursive: true });
    
    const isZip = file.originalname.toLowerCase().endsWith('.zip');
    const isMrPack = file.originalname.toLowerCase().endsWith('.mrpack'); // Standard modpack exclusion
    
    if (isZip && !isMrPack && clientType !== 'modpack') {
        try {
            const zip = new AdmZip(file.path);
            zip.extractAllTo(clientDir, true);
            
            // Create config file
            fs.writeFileSync(path.join(clientDir, 'client_config.json'), JSON.stringify({
                type: clientType,
                updatedAt: new Date().toISOString()
            }));
        } catch (e) {
            console.error("Failed to unzip:", e);
            throw new Error("Failed to unzip client file");
        }
    } else {
        const targetPath = path.join(clientDir, file.originalname);
        fs.copyFileSync(file.path, targetPath);
        
        // Create config file
        fs.writeFileSync(path.join(clientDir, 'client_config.json'), JSON.stringify({
            type: clientType === 'full' ? 'modpack' : clientType, // Default to modpack if not zip/full, or use provided
            mainFile: file.originalname,
            updatedAt: new Date().toISOString()
        }));
    }
    
    fs.unlinkSync(file.path);
    
    return file.originalname;
};

export const getClientManifest = async (containerId: string) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT volume_path FROM docker_servers WHERE container_id = ?',
        [containerId]
    );
    
    if (!rows.length) throw new Error("Server not found");
    
    const volumePath = rows[0].volume_path;
    const serverRoot = path.dirname(volumePath);
    const clientDir = path.join(serverRoot, 'ClientForServer');
    
    if (!fs.existsSync(clientDir)) {
        return [];
    }

    const files: any[] = [];
    
    const walk = (dir: string, rootDir: string) => {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                walk(filePath, rootDir);
            } else {
                const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
                const fileBuffer = fs.readFileSync(filePath);
                const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                
                files.push({
                    path: relativePath,
                    size: stat.size,
                    hash: hash
                });
            }
        });
    };
    
    walk(clientDir, clientDir);
    return files;
};

export const getClientFile = async (containerId: string, filePath: string) => {
     const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT volume_path FROM docker_servers WHERE container_id = ?',
        [containerId]
    );
    
    if (!rows.length) throw new Error("Server not found");
    
    const volumePath = rows[0].volume_path;
    const serverRoot = path.dirname(volumePath);
    const clientDir = path.join(serverRoot, 'ClientForServer');
    const fullPath = path.join(clientDir, filePath);
    
    // Security check
    if (!fullPath.startsWith(clientDir)) {
        throw new Error("Invalid path");
    }
    
    if (!fs.existsSync(fullPath)) {
        throw new Error("File not found");
    }
    
    return fullPath;
};


export const hasClientConfig = async (containerId: string): Promise<boolean> => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT volume_path FROM docker_servers WHERE container_id = ?',
        [containerId]
    );
    
    if (!rows.length) return false;
    
    const volumePath = rows[0].volume_path;
    const serverRoot = path.dirname(volumePath);
    const configPath = path.join(serverRoot, 'ClientForServer', 'client_config.json');
    
    return fs.existsSync(configPath);
};

// Read file content for text editor
export const readFileContent = async (containerId: string, relativePath: string): Promise<string> => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    // Security check: prevent directory traversal
    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (!fs.existsSync(targetPath)) {
        throw new Error("File not found");
    }

    if (fs.statSync(targetPath).isDirectory()) {
        throw new Error("Cannot read directory as file");
    }

    return fs.readFileSync(targetPath, 'utf-8');
};

// Write file content from text editor
export const writeFileContent = async (containerId: string, relativePath: string, content: string): Promise<void> => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    // Security check: prevent directory traversal
    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (!fs.existsSync(targetPath)) {
        throw new Error("File not found");
    }

    if (fs.statSync(targetPath).isDirectory()) {
        throw new Error("Cannot write to directory");
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
};

// Copy file (stores source path in memory for paste operation)
const copyCache: Map<string, { sourcePath: string; containerId: string; timestamp: number }> = new Map();

export const copyFile = async (containerId: string, relativePath: string): Promise<void> => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, relativePath);

    // Security check
    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    if (!fs.existsSync(targetPath)) {
        throw new Error("File not found");
    }

    // Store copy operation with 5-minute expiry
    const cacheKey = `${containerId}:${relativePath}`;
    copyCache.set(cacheKey, {
        sourcePath: targetPath,
        containerId,
        timestamp: Date.now()
    });

    // Clean up old entries (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, value] of copyCache.entries()) {
        if (value.timestamp < fiveMinutesAgo) {
            copyCache.delete(key);
        }
    }
};

// Paste file (copy to new location)
export const pasteFile = async (containerId: string, targetRelativePath: string, sourceRelativePath: string): Promise<void> => {
    const server = await getServerInfo(containerId);
    if (!server) throw new Error("Server not found");

    const basePath = server.volume_path;
    const targetPath = path.join(basePath, targetRelativePath);

    // Security check
    if (!targetPath.startsWith(basePath)) {
        throw new Error("Invalid path");
    }

    // Find cached copy operation using source path as cache key
    const cacheKey = `${containerId}:${sourceRelativePath}`;
    const cached = copyCache.get(cacheKey);

    if (!cached) {
        throw new Error("No copied file found. Please copy a file first.");
    }

    // Verify source still exists
    if (!fs.existsSync(cached.sourcePath)) {
        throw new Error("Source file no longer exists");
    }

    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(cached.sourcePath, targetPath);
};

