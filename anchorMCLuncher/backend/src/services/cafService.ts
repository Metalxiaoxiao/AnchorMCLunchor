import fs from 'fs';
import path from 'path';
import NodeRSA from 'node-rsa';
import axios from 'axios';

const CONFIG_PATH = path.join(__dirname, '../../caf_config.json');

interface CAFConfig {
  clientId: string;
  clientSecret: string;
  /** Which CAF server this config was registered against (e.g. https://auth.apoints.cn) */
  serverUrl?: string;
  publicKey: string;
  privateKey: string;
}

let cafConfig: CAFConfig | null = null;

const normalizeServerUrl = (url: string) => url.replace(/\/$/, '');

const shouldForceRegister = () => {
  const v = (process.env.CAF_FORCE_REGISTER || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
};

const validateExistingClient = async (cafUrl: string, clientId: string) => {
  // Best-effort validation against CAF. If CAF is unreachable, keep the existing config.
  try {
    const resp = await axios.get(`${cafUrl}/api/user/client-info`, {
      params: { client_id: clientId },
      timeout: 8000,
      validateStatus: () => true
    });

    if (resp.status === 200) return true;
    if (resp.status === 400 || resp.status === 401) return false;
    if (resp.status === 404) {
      // Could be either: (1) client not found, or (2) endpoint not available on this CAF server.
      // Avoid re-register loops when the endpoint doesn't exist.
      const data: any = resp.data;
      const looksLikeJsonObject = data && typeof data === 'object' && !Array.isArray(data);
      const hasHint = looksLikeJsonObject && (typeof data.error === 'string' || typeof data.message === 'string');
      return !hasHint;
    }

    // Unknown response; don't break startup.
    return true;
  } catch {
    return true;
  }
};

export const initializeCAF = async () => {
  const cafUrlRaw = process.env.CAF_SERVER_URL;
  if (!cafUrlRaw) {
    throw new Error('CAF_SERVER_URL is not defined in .env');
  }
  const cafUrl = normalizeServerUrl(cafUrlRaw);

  // Try load existing config first.
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const loaded = JSON.parse(configData) as CAFConfig;

      const loadedServerUrl = loaded.serverUrl ? normalizeServerUrl(loaded.serverUrl) : undefined;
      const serverChanged = !loadedServerUrl || loadedServerUrl !== cafUrl;

      const valid = !serverChanged && !shouldForceRegister()
        ? await validateExistingClient(cafUrl, loaded.clientId)
        : false;

      if (!shouldForceRegister() && !serverChanged && valid) {
        cafConfig = loaded;
        console.log('Loaded CAF config from file.');
        return;
      }

      console.warn(
        serverChanged
          ? `CAF_SERVER_URL changed (${loadedServerUrl || 'unknown'} -> ${cafUrl}), re-registering...`
          : 'CAF client validation failed (or CAF_FORCE_REGISTER enabled), re-registering...'
      );
    } catch (e) {
      console.warn('Failed to read/parse caf_config.json, re-registering...', e);
    }
  }

  console.log('Initializing CAF registration...');
  
  // Generate RSA keys
  const key = new NodeRSA({ b: 2048 });
  const publicKey = key.exportKey('pkcs8-public-pem');
  const privateKey = key.exportKey('pkcs8-private-pem');

  try {
    const response = await axios.post(`${cafUrl}/api/subserver/register`, {
      name: 'AnchorMCLuncher Backend',
      public_key: publicKey
    });

    const { id: clientId, secret: clientSecret } = response.data;

    cafConfig = {
      clientId,
      clientSecret,
      serverUrl: cafUrl,
      publicKey,
      privateKey
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cafConfig, null, 2));
    console.log('Registered with CAF and saved config.');

  } catch (error) {
    console.error('Failed to register with CAF:', error);
    // In a real scenario, you might want to exit or retry
  }
};

export const getCAFConfig = () => {
  if (!cafConfig) {
    throw new Error('CAF is not initialized');
  }
  return cafConfig;
};
