import axios from 'axios';
import { AuthResponse, BackendServer } from './types';

const API_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add a request interceptor to include the token in headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Dispatch a custom event that App.tsx can listen to
      window.dispatchEvent(new Event('auth-error'));
    }
    return Promise.reject(error);
  }
);

export const login = async (username: string, password: string): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>('/auth/login', { username, password });
  return response.data;
};

export const getCAFLoginUrl = async (): Promise<{ url: string; state: string }> => {
  const response = await api.get<{ url: string; state: string }>('/auth/caf-login-url');
  return response.data;
};

export const checkCAFStatus = async (state: string): Promise<{ status: string; token?: string; user?: any }> => {
  const response = await api.get<{ status: string; token?: string; user?: any }>(`/auth/caf-status?state=${state}`);
  return response.data;
};

export const register = async (username: string, password: string): Promise<void> => {
  await api.post('/auth/register', { username, password });
};

export const getServers = async (): Promise<BackendServer[]> => {
  const response = await api.get<BackendServer[]>('/servers');
  return response.data;
};

export const addServer = async (name: string, ip_address: string, port?: number, description?: string): Promise<BackendServer> => {
  const response = await api.post<BackendServer>('/servers', { name, ip_address, port, description });
  return response.data;
};

export const deleteServer = async (id: number): Promise<void> => {
  await api.delete(`/servers/${id}`);
};

// Docker API
export const createDockerServer = async (name: string, version: string, ram: string) => {
  const response = await api.post('/docker/create', { name, version, ram });
  return response.data;
};

export const listDockerServers = async () => {
  const response = await api.get('/docker/list');
  return response.data;
};

export const startDockerServer = async (id: string) => {
  const response = await api.post(`/docker/${id}/start`);
  return response.data;
};

export const stopDockerServer = async (id: string) => {
  const response = await api.post(`/docker/${id}/stop`);
  return response.data;
};

export const sendDockerCommand = async (id: string, command: string) => {
  const response = await api.post(`/docker/${id}/command`, { command });
  return response.data;
};

export const uploadDockerFile = async (id: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/docker/${id}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const listDockerFiles = async (id: string, path: string = '/') => {
  const response = await api.get(`/docker/${id}/files`, { params: { path } });
  return response.data;
};

export const deleteDockerFile = async (id: string, path: string) => {
  const response = await api.delete(`/docker/${id}/files`, { params: { path } });
  return response.data;
};

export const createDockerFolder = async (id: string, path: string) => {
  const response = await api.post(`/docker/${id}/files/folder`, { path });
  return response.data;
};

export const getClientConfig = async (containerId: string) => {
  const response = await api.get(`/docker/${containerId}/client-config`);
  return response.data;
};

export const updateClientConfig = async (containerId: string, type: string, value: string) => {
  const response = await api.post(`/docker/${containerId}/client-config`, { type, value });
  return response.data;
};

export const uploadClientFile = async (containerId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/docker/${containerId}/client-upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getClientManifest = async (id: string) => {
  const response = await api.get<any[]>(`/docker/${id}/client-manifest`);
  return response.data;
};

export const checkClientConfigStatus = async (id: string): Promise<boolean> => {
  try {
    const response = await api.get<{ hasConfig: boolean }>(`/docker/${id}/client-config-status`);
    return response.data.hasConfig;
  } catch (e) {
    console.error("Failed to check client config status", e);
    return false;
  }
};

export const getClientFileUrl = (id: string, path: string) => {
  return `${API_URL}/docker/${id}/client-files/${path}`;
};

// File content operations for text editor
export const readDockerFileContent = async (id: string, path: string): Promise<{ content: string }> => {
  const response = await api.get(`/docker/${id}/file-content`, { params: { path } });
  return response.data;
};

export const writeDockerFileContent = async (id: string, path: string, content: string): Promise<{ message: string }> => {
  const response = await api.post(`/docker/${id}/file-content`, { path, content });
  return response.data;
};

// Copy and paste operations
export const copyDockerFile = async (id: string, path: string): Promise<{ message: string }> => {
  const response = await api.post(`/docker/${id}/files/copy`, { path });
  return response.data;
};

export const pasteDockerFile = async (id: string, targetPath: string, sourcePath: string): Promise<{ message: string }> => {
  const response = await api.post(`/docker/${id}/files/paste`, { targetPath, sourcePath });
  return response.data;
};

export default api;
