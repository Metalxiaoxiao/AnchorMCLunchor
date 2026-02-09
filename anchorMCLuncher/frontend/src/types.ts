export interface User {
  id: number;
  username: string;
  uuid?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface BackendServer {
  id: number;
  name: string;
  ip_address: string;
  port: number;
  description?: string;
  container_id?: string; // Optional, from join
}

export interface Server extends BackendServer {
  // Frontend specific fields (derived or fetched live)
  motd?: string;
  players?: string;
  ping?: number;
  favicon?: string;
}

export interface DockerServer {
  id: string;
  container_id: string;
  name: string;
  status: string; // 'running', 'exited', etc.
  port: number;
  version: string;
}

export interface ServerStatus {
    description: string;
    players: {
        max: number;
        online: number;
    };
    version: {
        name: string;
        protocol: number;
    };
    favicon?: string;
    latency: number;
}
