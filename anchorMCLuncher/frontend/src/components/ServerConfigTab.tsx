import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import * as api from '../api';
import { MessageModal } from './MessageModal';

const Container = styled.div`
  padding: 2rem;
  color: #d4d4d4;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Section = styled.div`
  background: #252526;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #3e3e3e;
`;

const Title = styled.h3`
  margin: 0 0 1rem 0;
  color: #fff;
  font-size: 1.1rem;
`;

const RadioGroup = styled.div`
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: #ccc;
  
  input {
    cursor: pointer;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.8rem;
  background: #3e3e3e;
  border: 1px solid #4e4e4e;
  color: #fff;
  border-radius: 4px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.8rem;
  background: #3e3e3e;
  border: 1px solid #4e4e4e;
  color: #fff;
  border-radius: 4px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 0.8rem 1.5rem;
  background: ${props => props.$primary ? 'var(--accent-color)' : '#3e3e3e'};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$primary ? 'var(--accent-hover)' : '#4e4e4e'};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FileUploadArea = styled.div`
  border: 2px dashed #4e4e4e;
  padding: 2rem;
  text-align: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--accent-color);
    background: rgba(255, 255, 255, 0.05);
  }
`;

interface ServerConfigTabProps {
  containerId: string;
}

export const ServerConfigTab: React.FC<ServerConfigTabProps> = ({ containerId }) => {
  const [configType, setConfigType] = useState<'upload' | 'link' | 'local' | 'webdav'>('local');
  const [configValue, setConfigValue] = useState('');
  const [localVersions, setLocalVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; message: string; type: 'info' | 'error' | 'confirm' }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  useEffect(() => {
    fetchConfig();
    fetchVersions();
  }, [containerId]);

  const showModal = (message: string, type: 'info' | 'error' | 'confirm' = 'info') => {
    setModalState({ isOpen: true, message, type });
  };

  const fetchConfig = async () => {
    try {
      const config = await api.getClientConfig(containerId);
      if (config) {
        if (config.client_config_type) setConfigType(config.client_config_type as any);
        if (config.client_config_value) setConfigValue(config.client_config_value);
      }
    } catch (e) {
      console.error("Failed to fetch config", e);
    }
  };

  const fetchVersions = async () => {
    try {
      const versions = await invoke<string[]>('list_installed_versions', { gamePath: null });
      setLocalVersions(versions);
    } catch (e) {
      console.error("Failed to fetch versions", e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (configType === 'local') {
        if (!configValue) {
          showModal("请选择一个本地版本", 'error');
          setLoading(false);
          return;
        }

        // Use Rust to package and upload directly to avoid freezing UI
        const token = localStorage.getItem('token');
        const uploadUrl = `${api.getApiBaseUrl()}/docker/${containerId}/client-upload`;
        
        const filename = await invoke<string>('package_and_upload_local_version', { 
            versionId: configValue, 
            gamePath: null,
            uploadUrl: uploadUrl,
            token: token
        });

        // Update config to point to the uploaded file with type 'modpack'
        await api.updateClientConfig(containerId, 'modpack', filename);
        
        // Update local state to reflect the change
        setConfigValue(filename);
        
        showModal("已打包并上传整合包", 'info');
        
      } else {
        await api.updateClientConfig(containerId, configType, configValue);
        showModal("配置已保存", 'info');
      }
    } catch (e: any) {
      console.error(e);
      showModal("保存失败: " + (e.message || e), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      try {
        const file = e.target.files[0];
        const result = await api.uploadClientFile(containerId, file);
        setConfigValue(result.filename);
        showModal("上传成功", 'info');
      } catch (e) {
        console.error(e);
        showModal("上传失败", 'error');
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <Container>
      <Section>
        <Title>客户端分发配置</Title>
        <p style={{ color: '#888', marginBottom: '1.5rem' }}>
          配置玩家加入服务器时需要下载的客户端。
        </p>

        <RadioGroup>
          <RadioLabel>
            <input 
              type="radio" 
              checked={configType === 'local'} 
              onChange={() => setConfigType('local')} 
            />
            本地版本
          </RadioLabel>
          <RadioLabel>
            <input 
              type="radio" 
              checked={configType === 'upload'} 
              onChange={() => setConfigType('upload')} 
            />
            上传客户端
          </RadioLabel>
          <RadioLabel>
            <input 
              type="radio" 
              checked={configType === 'link'} 
              onChange={() => setConfigType('link')} 
            />
            外部链接
          </RadioLabel>
          <RadioLabel>
            <input 
              type="radio" 
              checked={configType === 'webdav'} 
              onChange={() => setConfigType('webdav')} 
            />
            WebDAV (即将推出)
          </RadioLabel>
        </RadioGroup>

        {configType === 'local' && (
          <div>
            <p style={{ marginBottom: '0.5rem' }}>选择启动器中已安装的版本作为客户端：</p>
            <Select 
              value={configValue} 
              onChange={(e) => setConfigValue(e.target.value)}
            >
              <option value="">请选择版本...</option>
              {localVersions.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
        )}

        {configType === 'upload' && (
          <div>
            <p style={{ marginBottom: '0.5rem' }}>上传客户端文件：</p>
            <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1rem' }}>
              - <b>ZIP 压缩包</b>：将自动解压到服务器客户端目录（适用于完整客户端）。<br/>
              - <b>标准整合包 (.mrpack)</b>：将直接保存，不进行解压。<br/>
              - <b>其他文件</b>：直接保存。
            </p>
            <FileUploadArea onClick={() => document.getElementById('client-upload')?.click()}>
              {uploading ? '上传中...' : '点击选择文件或拖拽到此处'}
              <input 
                id="client-upload" 
                type="file" 
                style={{ display: 'none' }} 
                onChange={handleFileUpload}
                accept=".zip,.7z,.rar,.mrpack"
              />
            </FileUploadArea>
            {configValue && <p style={{ marginTop: '0.5rem', color: 'var(--accent-color)' }}>当前文件: {configValue}</p>}
          </div>
        )}

        {configType === 'link' && (
          <div>
            <p style={{ marginBottom: '0.5rem' }}>输入客户端下载链接：</p>
            <Input 
              type="text" 
              placeholder="https://example.com/client.zip" 
              value={configValue} 
              onChange={(e) => setConfigValue(e.target.value)} 
            />
          </div>
        )}

        {configType === 'webdav' && (
          <div>
            <p style={{ marginBottom: '0.5rem' }}>从 WebDAV 网盘选择文件：</p>
            <Button disabled>选择网盘文件</Button>
          </div>
        )}

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
          <Button $primary onClick={handleSave} disabled={loading || uploading}>
            {loading ? (configType === 'local' ? '正在打包上传...' : '保存中...') : '保存配置'}
          </Button>
        </div>
      </Section>

      <MessageModal
        isOpen={modalState.isOpen}
        message={modalState.message}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        type={modalState.type}
        zIndex={4000}
      />
    </Container>
  );
};
