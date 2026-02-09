import fs from 'fs';
import path from 'path';
import NodeRSA from 'node-rsa';
import axios from 'axios';

const CONFIG_PATH = path.join(__dirname, '../../caf_config.json');

interface CAFConfig {
  clientId: string;
  clientSecret: string;
  publicKey: string;
  privateKey: string;
}

let cafConfig: CAFConfig | null = null;

export const initializeCAF = async () => {
  if (fs.existsSync(CONFIG_PATH)) {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
    cafConfig = JSON.parse(configData);
    console.log('Loaded CAF config from file.');
    return;
  }

  console.log('Initializing CAF registration...');
  
  // Generate RSA keys
  const key = new NodeRSA({ b: 2048 });
  const publicKey = key.exportKey('pkcs8-public-pem');
  const privateKey = key.exportKey('pkcs8-private-pem');

  try {
    const cafUrl = process.env.CAF_SERVER_URL;
    if (!cafUrl) {
      throw new Error('CAF_SERVER_URL is not defined in .env');
    }

    const response = await axios.post(`${cafUrl}/api/subserver/register`, {
      name: 'AnchorMCLuncher Backend',
      public_key: publicKey
    });

    const { id: clientId, secret: clientSecret } = response.data;

    cafConfig = {
      clientId,
      clientSecret,
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
