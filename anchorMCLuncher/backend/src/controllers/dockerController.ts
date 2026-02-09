import { Request, Response } from 'express';
import * as dockerService from '../services/dockerService';

export const createServer = async (req: Request, res: Response) => {
    try {
        const { name, version, ram } = req.body;
        // @ts-ignore
        const userId = req.user.id; 
        const result = await dockerService.createServer(userId, name, version, ram);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const listServers = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const servers = await dockerService.listServers(userId);
        res.json(servers);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const startServer = async (req: Request, res: Response) => {
    try {
        await dockerService.startServer(req.params.id);
        res.json({ message: "Server started" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const stopServer = async (req: Request, res: Response) => {
    try {
        await dockerService.stopServer(req.params.id);
        res.json({ message: "Server stopped" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendCommand = async (req: Request, res: Response) => {
    try {
        const { command } = req.body;
        await dockerService.sendCommand(req.params.id, command);
        res.json({ message: "Command sent" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const uploadFile = async (req: Request, res: Response) => {
    try {
        if (!req.file) throw new Error("No file uploaded");
        await dockerService.uploadFile(req.params.id, req.file);
        res.json({ message: "File uploaded" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const listFiles = async (req: Request, res: Response) => {
    try {
        const path = req.query.path as string || '/';
        const files = await dockerService.listFiles(req.params.id, path);
        res.json(files);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteFile = async (req: Request, res: Response) => {
    try {
        const path = req.query.path as string;
        if (!path) throw new Error("Path is required");
        await dockerService.deleteFile(req.params.id, path);
        res.json({ message: "File deleted" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createFolder = async (req: Request, res: Response) => {
    try {
        const { path } = req.body;
        if (!path) throw new Error("Path is required");
        await dockerService.createFolder(req.params.id, path);
        res.json({ message: "Folder created" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateClientConfig = async (req: Request, res: Response) => {
    try {
        const { type, value } = req.body;
        await dockerService.updateClientConfig(req.params.id, type, value);
        res.json({ message: "Client config updated" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getClientConfig = async (req: Request, res: Response) => {
    try {
        const config = await dockerService.getClientConfig(req.params.id);
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const uploadClientFile = async (req: Request, res: Response) => {
    try {
        if (!req.file) throw new Error("No file uploaded");
        const type = req.body.type || 'full';
        const filename = await dockerService.uploadClientFile(req.params.id, req.file, type);
        res.json({ filename });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getClientManifest = async (req: Request, res: Response) => {
    try {
        const manifest = await dockerService.getClientManifest(req.params.id);
        res.json(manifest);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const downloadClientFile = async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0]; // Capture wildcard path
        const fullPath = await dockerService.getClientFile(req.params.id, filePath);
        res.download(fullPath);
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
};


export const checkClientConfigStatus = async (req: Request, res: Response) => {
    try {
        const hasConfig = await dockerService.hasClientConfig(req.params.id);
        res.json({ hasConfig });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// File content operations for text editor
export const readFileContent = async (req: Request, res: Response) => {
    try {
        const path = req.query.path as string;
        if (!path) throw new Error("Path is required");
        const content = await dockerService.readFileContent(req.params.id, path);
        res.json({ content });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const writeFileContent = async (req: Request, res: Response) => {
    try {
        const { path, content } = req.body;
        if (!path) throw new Error("Path is required");
        if (content === undefined) throw new Error("Content is required");
        await dockerService.writeFileContent(req.params.id, path, content);
        res.json({ message: "File saved successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Copy and paste operations
export const copyFile = async (req: Request, res: Response) => {
    try {
        const { path } = req.body;
        if (!path) throw new Error("Path is required");
        await dockerService.copyFile(req.params.id, path);
        res.json({ message: "File copied. You can now paste it to a new location." });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const pasteFile = async (req: Request, res: Response) => {
    try {
        const { targetPath, sourcePath } = req.body;
        if (!targetPath) throw new Error("Target path is required");
        if (!sourcePath) throw new Error("Source path is required");
        await dockerService.pasteFile(req.params.id, targetPath, sourcePath);
        res.json({ message: "File pasted successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
