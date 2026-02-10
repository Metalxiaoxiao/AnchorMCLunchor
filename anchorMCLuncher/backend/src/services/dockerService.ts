import Docker from 'dockerode';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import db from '../config/db';
import { RowDataPacket } from 'mysql2';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

const docker = new Docker(); // Defaults to socket/pipe
const SERVERS_DIR = path.resolve(__dirname, '../../minecraft_servers');

const resolveJavaVersion = (mcVersion?: string) => {
    if (!mcVersion) return 17;
    const match = mcVersion.match(/^(\d+)\.(\d+)/);
    if (!match) return 17;
    const major = Number(match[1]);
    const minor = Number(match[2]);

    if (major > 1) return 21;
    if (minor >= 20) {
        return minor >= 21 || minor >= 20 && mcVersion.includes("1.20.5") ? 21 : 17;
    }
    if (minor >= 18) return 17;
    return 8;
};

interface DeployProgress {
    taskId: string;
    percent: number;
    stage: string;
    message: string;
    done?: boolean;
    error?: boolean;
    containerId?: string;
}

const deployProgress = new Map<string, DeployProgress>();
const deploySubscribers = new Map<string, Set<(progress: DeployProgress) => void>>();
const deployCancel = new Map<string, { cancel: boolean; deleteServer: boolean }>();

const notifyDeployProgress = (taskId: string, progress: DeployProgress) => {
    const subscribers = deploySubscribers.get(taskId);
    if (!subscribers) return;
    subscribers.forEach(cb => cb(progress));
};

export const initDeployProgress = (taskId: string, stage: string, message: string, percent: number) => {
    const progress: DeployProgress = { taskId, stage, message, percent };
    deployProgress.set(taskId, progress);
    notifyDeployProgress(taskId, progress);
};

export const reportDeployProgress = (taskId: string, patch: Partial<DeployProgress>) => {
    const current = deployProgress.get(taskId) || { taskId, stage: 'init', message: '', percent: 0 };
    const next = { ...current, ...patch, taskId } as DeployProgress;
    deployProgress.set(taskId, next);
    notifyDeployProgress(taskId, next);
};

export const getDeployProgress = (taskId: string) => {
    return deployProgress.get(taskId);
};

export const subscribeDeployProgress = (taskId: string, cb: (progress: DeployProgress) => void) => {
    const subscribers = deploySubscribers.get(taskId) || new Set();
    subscribers.add(cb);
    deploySubscribers.set(taskId, subscribers);
    return () => {
        const next = deploySubscribers.get(taskId);
        if (!next) return;
        next.delete(cb);
        if (next.size === 0) {
            deploySubscribers.delete(taskId);
        }
    };
};

export const cancelDeployTask = async (taskId: string, deleteServer: boolean) => {
    deployCancel.set(taskId, { cancel: true, deleteServer });
    const progress = deployProgress.get(taskId);
    if (deleteServer && progress?.containerId) {
        await deleteDockerServer(progress.containerId);
        reportDeployProgress(taskId, { stage: 'cancelled', message: '已取消并删除服务器', percent: 100, done: true, error: true });
    } else {
        reportDeployProgress(taskId, { stage: 'cancelled', message: '已取消部署', percent: 100, done: true, error: true });
    }
};

const getCancelInfo = (taskId?: string) => {
    if (!taskId) return null;
    return deployCancel.get(taskId) || null;
};

const checkCancel = async (taskId?: string, containerId?: string) => {
    if (!taskId) return false;
    const info = getCancelInfo(taskId);
    if (!info?.cancel) return false;
    if (info.deleteServer && containerId) {
        await deleteDockerServer(containerId);
        reportDeployProgress(taskId, { stage: 'cancelled', message: '已取消并删除服务器', percent: 100, done: true, error: true });
    } else {
        reportDeployProgress(taskId, { stage: 'cancelled', message: '已取消部署', percent: 100, done: true, error: true });
    }
    return true;
};

if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
}

export const createServer = async (
    userId: number,
    name: string,
    version: string,
    ram: string,
    taskId?: string,
    runtime?: { mcVersion?: string; loaderType?: string; loaderVersion?: string }
) => {
    if (taskId) {
        initDeployProgress(taskId, 'init', '准备部署', 5);
    }
    // 0. Check Docker Availability
    try {
        await docker.ping();
    } catch (e) {
        console.error("Docker connection failed:", e);
        if (taskId) {
            reportDeployProgress(taskId, { stage: 'error', message: 'Docker 未运行或无法连接', percent: 100, done: true, error: true });
        }
        throw new Error("Docker Desktop 未运行或无法连接。请确保 Docker Desktop 已启动。");
    }

    if (await checkCancel(taskId)) {
        throw new Error('Deployment cancelled');
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
    const selectedMcVersion = runtime?.mcVersion || version;
    const javaVersion = resolveJavaVersion(selectedMcVersion);
    const imageName = `itzg/minecraft-server:java${javaVersion}`;
    
    try {
        console.log(`Attempting to pull image: ${imageName}...`);
        if (taskId) {
            reportDeployProgress(taskId, { stage: 'pull-image', message: '正在拉取服务器镜像', percent: 20 });
        }
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
            if (taskId) {
                reportDeployProgress(taskId, { stage: 'error', message: '镜像下载失败', percent: 100, done: true, error: true });
            }
            throw new Error(`无法获取服务器镜像 '${imageName}'。下载失败且本地不存在。请检查网络连接（可能需要配置 Docker 镜像加速或代理）。错误: ${e.message}`);
        }
    }

    if (await checkCancel(taskId)) {
        throw new Error('Deployment cancelled');
    }

    // Sanitize container name: only allow [a-zA-Z0-9][a-zA-Z0-9_.-]
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '') || 'server';
    const containerName = `mc_${safeName}_${Date.now()}`;

    if (taskId) {
        reportDeployProgress(taskId, { stage: 'create-container', message: '正在创建容器', percent: 55 });
    }

    const env = [
        'EULA=TRUE',
        `MEMORY=${ram}`
    ];

    if (selectedMcVersion) {
        env.push(`VERSION=${selectedMcVersion}`);
    }
    env.push(`JAVA_VERSION=${javaVersion}`);
    env.push(`JAVA_VERSION_OVERRIDE=${javaVersion}`);

    const loaderType = runtime?.loaderType;
    const loaderVersion = runtime?.loaderVersion;
    if (loaderType && loaderType !== 'vanilla') {
        env.push(`TYPE=${loaderType.toUpperCase()}`);
        if (loaderType === 'fabric' && loaderVersion) {
            env.push(`FABRIC_LOADER_VERSION=${loaderVersion}`);
        }
        if (loaderType === 'forge' && loaderVersion) {
            env.push(`FORGE_VERSION=${loaderVersion}`);
        }
        if (loaderType === 'neoforge' && loaderVersion) {
            env.push(`NEOFORGE_VERSION=${loaderVersion}`);
        }
    }

    const container = await docker.createContainer({
        Image: imageName,
        name: containerName,
        Env: env,
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

    if (taskId) {
        reportDeployProgress(taskId, { stage: 'save', message: '正在写入数据库', percent: 70, containerId });
    }

    // 4. Save to DB
    const [result] = await db.execute(
        'INSERT INTO docker_servers (user_id, container_id, name, port, volume_path, status, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, containerId, name, port, dataDir, 'created', version]
    );

    // 5. Add to public server list (optional, but requested)
    // Assuming host IP is localhost or auto-detected. For now use 'localhost' or '127.0.0.1'
    await db.execute(
        'INSERT INTO servers (name, ip_address, port, description, container_id) VALUES (?, ?, ?, ?, ?)',
        [name, '127.0.0.1', port, `Docker Server: ${name}`, containerId]
    );

    if (await checkCancel(taskId, containerId)) {
        throw new Error('Deployment cancelled');
    }

    if (taskId) {
        reportDeployProgress(taskId, { stage: 'done', message: '部署完成', percent: 100, done: true });
    }

    return { container_id: containerId, containerId, port, serverDir };
};

const normalizeContainerStatus = (state?: string) => {
    if (!state) return 'unknown';
    if (state === 'running' || state === 'restarting' || state === 'paused') return 'running';
    if (state === 'created') return 'created';
    return 'stopped';
};

export const getContainerStatus = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    try {
        const info = await container.inspect();
        return normalizeContainerStatus(info?.State?.Status);
    } catch (error: any) {
        const msg = error?.statusCode || error?.response?.statusCode;
        if (msg === 404) return 'missing';
        return 'unknown';
    }
};

export const listServers = async (userId: number) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT id, user_id, container_id, name, port, status, created_at, client_config_type, client_config_value, version FROM docker_servers WHERE user_id = ?',
        [userId]
    );

    for (const row of rows) {
        const nextStatus = await getContainerStatus(row.container_id);
        if (nextStatus !== row.status) {
            await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', [nextStatus, row.container_id]);
            row.status = nextStatus;
        }
    }

    return rows;
};

export const cleanupMissingDockerServers = async () => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT container_id FROM docker_servers'
    );

    for (const row of rows) {
        const status = await getContainerStatus(row.container_id);
        if (status === 'missing') {
            await deleteDockerServer(row.container_id);
        }
    }
};

export const deleteDockerServer = async (containerId: string) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT volume_path FROM docker_servers WHERE container_id = ?',
        [containerId]
    );

    const container = docker.getContainer(containerId);

    try {
        const info = await container.inspect();
        if (info?.State?.Running) {
            await container.stop();
        }
    } catch (error: any) {
        const code = error?.statusCode || error?.response?.statusCode;
        if (code !== 404) {
            console.warn('Failed to inspect/stop container:', error?.message || error);
        }
    }

    try {
        await container.remove({ force: true });
    } catch (error: any) {
        const code = error?.statusCode || error?.response?.statusCode;
        if (code !== 404) {
            console.warn('Failed to remove container:', error?.message || error);
        }
    }

    await db.execute('DELETE FROM docker_servers WHERE container_id = ?', [containerId]);
    await db.execute('DELETE FROM servers WHERE container_id = ?', [containerId]);

    if (rows.length) {
        const volumePath = rows[0].volume_path as string;
        const serverRoot = path.dirname(volumePath);
        if (fs.existsSync(serverRoot)) {
            fs.rmSync(serverRoot, { recursive: true, force: true });
        }
    }
};

export const startServer = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    try {
        await container.start();
    } catch (error: any) {
        const code = error?.statusCode || error?.response?.statusCode;
        if (code === 304) {
            // Already started
        } else if (code === 404) {
            await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', ['missing', containerId]);
            throw new Error('Container not found');
        } else {
            throw error;
        }
    }

    const nextStatus = await getContainerStatus(containerId);
    await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', [nextStatus, containerId]);
};

export const stopServer = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    try {
        await container.stop();
    } catch (error: any) {
        const code = error?.statusCode || error?.response?.statusCode;
        if (code === 304) {
            // Already stopped
        } else if (code === 404) {
            await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', ['missing', containerId]);
            throw new Error('Container not found');
        } else {
            throw error;
        }
    }

    const nextStatus = await getContainerStatus(containerId);
    await db.execute('UPDATE docker_servers SET status = ? WHERE container_id = ?', [nextStatus, containerId]);
};

export const getServerInfo = async (containerId: string) => {
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM docker_servers WHERE container_id = ?', [containerId]);
    return rows[0];
};

const normalizeRelativePath = (relativePath: string) => {
    const trimmed = relativePath.replace(/^[/\\]+/, '');
    return trimmed.length ? trimmed : '.';
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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

const clientOnlyHints = [
    'sodium',
    'iris',
    'oculus',
    'optifine',
    'embeddium',
    'rubidium',
    'entityculling',
    'entity_culling',
    'litematica',
    'malilib',
    'minihud',
    'xaerominimap',
    'xaeroworldmap',
    'journeymap'
];

const isClientOnlyMod = (jarPath: string) => {
    const name = path.basename(jarPath).toLowerCase();
    if (clientOnlyHints.some(hint => name.includes(hint))) return true;

    try {
        const jar = new AdmZip(jarPath);
        const fabricEntry = jar.getEntry('fabric.mod.json');
        if (fabricEntry) {
            const data = JSON.parse(jar.readAsText(fabricEntry));
            const env = String(data?.environment || '').toLowerCase();
            if (env === 'client') return true;
        }

        const quiltEntry = jar.getEntry('quilt.mod.json');
        if (quiltEntry) {
            const data = JSON.parse(jar.readAsText(quiltEntry));
            const env = String(data?.environment || data?.metadata?.environment || data?.quilt_loader?.metadata?.environment || '').toLowerCase();
            if (env === 'client') return true;
        }

        const tomlEntry = jar.getEntry('META-INF/mods.toml');
        if (tomlEntry) {
            const text = jar.readAsText(tomlEntry);
            if (/clientSideOnly\s*=\s*true/i.test(text)) return true;
            if (/clientOnly\s*=\s*true/i.test(text)) return true;
            if (/side\s*=\s*"CLIENT"/i.test(text)) return true;
        }
    } catch (e) {
        // Ignore parse errors and treat as server-capable.
    }

    return false;
};

const removeClientOnlyMods = (modsDir: string) => {
    if (!fs.existsSync(modsDir)) return 0;
    const entries = fs.readdirSync(modsDir, { withFileTypes: true });
    let removed = 0;

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.jar')) continue;
        const fullPath = path.join(modsDir, entry.name);
        if (isClientOnlyMod(fullPath)) {
            fs.rmSync(fullPath, { force: true });
            removed += 1;
        }
    }

    return removed;
};

const safeJoin = (basePath: string, relativePath: string) => {
    const target = path.join(basePath, normalizeRelativePath(relativePath.replace(/\\/g, '/')));
    if (!target.startsWith(basePath)) {
        throw new Error('Invalid path');
    }
    return target;
};

const extractPackZipToData = (zip: AdmZip, dataDir: string) => {
    const allowedRoots = [
        'mods/',
        'config/',
        'defaultconfigs/',
        'kubejs/',
        'scripts/',
        'datapacks/',
        'global_packs/'
    ];
    const overrideRoot = 'overrides/';
    const serverOverrideRoot = 'server-overrides/';
    const serverRoot = 'server/';
    const entries = zip.getEntries();
    const entryNames = entries.map(entry => entry.entryName.replace(/\\/g, '/'));
    const hasServerOverrides = entryNames.some(name => name.startsWith(serverOverrideRoot) || name.includes(`/${serverOverrideRoot}`));

    const resolveRelative = (entryName: string) => {
        const normalized = entryName.replace(/\\/g, '/');
        if (hasServerOverrides) {
            if (normalized.startsWith(serverOverrideRoot)) {
                return normalized.slice(serverOverrideRoot.length);
            }
            const serverOverrideIndex = normalized.indexOf(`/${serverOverrideRoot}`);
            if (serverOverrideIndex > 0) {
                return normalized.slice(serverOverrideIndex + serverOverrideRoot.length + 1);
            }
        } else if (normalized.startsWith(overrideRoot)) {
            return normalized.slice(overrideRoot.length);
        }
        if (!hasServerOverrides) {
            const overrideIndex = normalized.indexOf(`/${overrideRoot}`);
            if (overrideIndex > 0) {
                return normalized.slice(overrideIndex + overrideRoot.length + 1);
            }
        }

        if (normalized.startsWith(serverRoot)) {
            return normalized.slice(serverRoot.length);
        }

        const serverIndex = normalized.indexOf(`/${serverRoot}`);
        if (serverIndex > 0) {
            return normalized.slice(serverIndex + serverRoot.length + 1);
        }

        for (const root of allowedRoots) {
            if (normalized.startsWith(root)) return normalized;
            const idx = normalized.indexOf(`/${root}`);
            if (idx > 0) return normalized.slice(idx + 1);
        }

        return null;
    };

    for (const entry of entries) {
        const relative = resolveRelative(entry.entryName);
        if (!relative) continue;

        const targetPath = safeJoin(dataDir, relative);
        if (entry.isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
            continue;
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
    }
};

const extractMrpackOverrides = (zip: AdmZip, dataDir: string) => {
    const entries = zip.getEntries();
    const normalized = entries.map(entry => entry.entryName.replace(/\\/g, '/'));
    const hasServerOverrides = normalized.some(name => name.startsWith('server-overrides/'));
    const root = hasServerOverrides ? 'server-overrides/' : 'overrides/';

    for (const entry of entries) {
        const entryName = entry.entryName.replace(/\\/g, '/');
        if (!entryName.startsWith(root)) continue;
        const relative = entryName.slice(root.length);
        if (!relative) continue;

        const targetPath = safeJoin(dataDir, relative);
        if (entry.isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
            continue;
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
    }
};

const installMrpackFiles = async (zip: AdmZip, dataDir: string) => {
    const indexEntry = zip.getEntry('modrinth.index.json');
    if (!indexEntry) {
        throw new Error('Missing modrinth.index.json');
    }

    const index = JSON.parse(zip.readAsText(indexEntry));
    const files = Array.isArray(index?.files) ? index.files : [];

    for (const file of files) {
        const env = file?.env?.server;
        if (env && String(env).toLowerCase() === 'unsupported') continue;

        const url = Array.isArray(file?.downloads) ? file.downloads[0] : undefined;
        if (!url || !file?.path) continue;

        const targetPath = safeJoin(dataDir, file.path);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const resp = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(targetPath, Buffer.from(resp.data));
    }
};

const installClientPackToServer = async (
    dataDir: string,
    packPath: string,
    packName: string
) => {
    const isMrPack = packName.toLowerCase().endsWith('.mrpack');
    const zip = new AdmZip(packPath);

    if (isMrPack) {
        extractMrpackOverrides(zip, dataDir);
        await installMrpackFiles(zip, dataDir);
    } else {
        extractPackZipToData(zip, dataDir);
    }

    removeClientOnlyMods(path.join(dataDir, 'mods'));
};

const ensureServerDefaults = (dataDir: string, serverName: string) => {
    const eulaPath = path.join(dataDir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) {
        fs.writeFileSync(eulaPath, 'eula=true\n');
    }

    const propsPath = path.join(dataDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
        const motd = serverName ? serverName.replace(/\r?\n/g, ' ').slice(0, 58) : 'Minecraft Server';
        const content = [
            `motd=${motd}`,
            'online-mode=true',
            'allow-flight=false',
            'enable-command-block=false',
            'max-players=20',
            'view-distance=10',
            'sync-chunk-writes=false'
        ].join('\n') + '\n';
        fs.writeFileSync(propsPath, content);
    }
};

export const uploadClientFile = async (containerId: string, file: Express.Multer.File, clientType: string = 'full', taskId?: string) => {
    const [rows] = await db.execute<RowDataPacket[]>('SELECT volume_path, name FROM docker_servers WHERE container_id = ?', [containerId]);
    
    if (!rows.length) throw new Error("Server not found");
    
    const volumePath = rows[0].volume_path as string;
    const serverName = (rows[0] as any).name || '';
    const serverRoot = path.dirname(volumePath);
    const clientDir = path.join(serverRoot, 'ClientForServer');
    
    // Clean up existing directory to ensure fresh state for new upload
    if (fs.existsSync(clientDir)) {
        fs.rmSync(clientDir, { recursive: true, force: true });
    }
    fs.mkdirSync(clientDir, { recursive: true });
    
    const isZip = file.originalname.toLowerCase().endsWith('.zip');
    const isMrPack = file.originalname.toLowerCase().endsWith('.mrpack');
    
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
    
    const shouldInstall = isZip || isMrPack;
    if (shouldInstall && (isZip || isMrPack)) {
        if (taskId) {
            reportDeployProgress(taskId, { stage: 'install-pack', message: '正在安装服务端整合包', percent: 92 });
        }
        await installClientPackToServer(volumePath, file.path, file.originalname);
        if (taskId) {
            reportDeployProgress(taskId, { stage: 'install-pack-done', message: '服务端整合包安装完成', percent: 94 });
        }
    }

    ensureServerDefaults(volumePath, serverName);
    if (taskId) {
        reportDeployProgress(taskId, { stage: 'server-defaults', message: '已写入服务器默认配置', percent: 96 });
    }

    if (taskId) {
        try {
            reportDeployProgress(taskId, { stage: 'start-server', message: '正在启动服务器生成基础文件', percent: 98 });
            await startServer(containerId);
            reportDeployProgress(taskId, { stage: 'start-server-done', message: '服务器已启动', percent: 99 });
        } catch (e: any) {
            reportDeployProgress(taskId, { stage: 'start-server-error', message: `服务器启动失败: ${e.message || e}`, percent: 99, error: true });
        }
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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(relativePath));

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

    const basePath = path.dirname(server.volume_path);
    const targetPath = path.join(basePath, normalizeRelativePath(targetRelativePath));

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

