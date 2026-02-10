import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Window } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import * as api from '../api';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
  user-select: none;
`;

const TitleBar = styled.div`
  height: 30px;
  background: #e2e8f0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  -webkit-app-region: drag;
`;

const CloseButton = styled.button`
  width: 40px;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
  &:hover { background: #ef4444; color: white; }
`;

const Content = styled.div`
  padding: 2rem;
  flex: 1;
  overflow-y: auto;
`;

const Title = styled.h2`
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: var(--accent-color);
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.8rem;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-sizing: border-box;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.8rem;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-sizing: border-box;
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 0.8rem 1.5rem;
  background-color: ${props => props.$primary ? 'var(--accent-color)' : 'transparent'};
  color: ${props => props.$primary ? 'white' : 'var(--text-color)'};
  border: ${props => props.$primary ? 'none' : '1px solid var(--border-color)'};
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;

  &:hover {
    background-color: ${props => props.$primary ? 'var(--accent-hover)' : 'rgba(0,0,0,0.05)'};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusMessage = styled.div<{ $error?: boolean }>`
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 8px;
  background: ${props => props.$error ? '#fee2e2' : '#dcfce7'};
  color: ${props => props.$error ? '#991b1b' : '#166534'};
  text-align: center;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 8px;
  background-color: #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 1rem;
`;

const ProgressBarFill = styled.div<{ $percent: number }>`
  height: 100%;
  background-color: var(--accent-color);
  width: ${props => props.$percent}%;
  transition: width 0.3s ease;
`;

export const ServerDeployWindow: React.FC = () => {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.20.4');
  const [ram, setRam] = useState('2G');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = React.useRef(false);
  const [status, setStatus] = useState<{msg: string, error: boolean} | null>(null);
  const [localVersions, setLocalVersions] = useState<string[]>([]);
  const [useLocalVersion, setUseLocalVersion] = useState(false);

  useEffect(() => {
    invoke<string[]>('list_installed_versions', { gamePath: null })
      .then(setLocalVersions)
      .catch(console.error);
  }, []);

  const handleDeploy = async () => {
    if (!name) {
      setStatus({ msg: "请输入服务器名称", error: true });
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setStatus(null);
    setProgress(10);

    try {
      // 1. Create Server
      const server = await api.createDockerServer(name, version, ram);
      setProgress(40);
      
      // 2. If local version selected, package and upload
      if (useLocalVersion) {
          setStatus({ msg: "正在打包并上传本地客户端文件...", error: false });
          setProgress(55);
          
          const token = localStorage.getItem('token');
          // Construct upload URL. Assuming api.defaults.baseURL is set or we construct it manually.
          const uploadUrl = `${api.getApiBaseUrl()}/docker/${server.container_id}/client-upload`;

          await invoke('package_and_upload_local_version', { 
              versionId: version, 
              gamePath: null,
              uploadUrl: uploadUrl,
              token: token || null,
              enableIsolation: null // or false
          });
          setProgress(80);
      }

      if (cancelRef.current) {
        setStatus({ msg: "已取消部署", error: true });
        setLoading(false);
        return;
      }

      await emit('server-deployed');
      setProgress(100);
      setStatus({ msg: "服务器创建成功！窗口即将关闭...", error: false });
      setTimeout(() => {
        Window.getCurrent().close();
      }, 1500);
    } catch (error: any) {
      console.error(error);
      setStatus({ msg: `创建失败: ${error.message || '未知错误'}`, error: true });
      setLoading(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    Window.getCurrent().close();
  };

  return (
    <Container>
      {/* No TitleBar needed if we use standard window decorations or if we want a custom one. 
          The user asked for "independent Windows window", usually implies standard OS window or custom one.
          SkinEditor used a custom one. Let's stick to custom one for consistency if frameless, 
          but usually new windows are created with decorations by default unless specified.
          Let's assume we want it to look like the app.
      */}
      <Content>
        <Title>部署新服务器</Title>
        
        <FormGroup>
          <Label>服务器名称</Label>
          <Input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="My Minecraft Server"
          />
        </FormGroup>

        <FormGroup>
          <Label>游戏版本</Label>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ marginRight: '1rem' }}>
                <input 
                    type="radio" 
                    checked={!useLocalVersion} 
                    onChange={() => setUseLocalVersion(false)} 
                /> 官方版本
            </label>
            <label>
                <input 
                    type="radio" 
                    checked={useLocalVersion} 
                    onChange={() => setUseLocalVersion(true)} 
                /> 本地版本
            </label>
          </div>
          
          {useLocalVersion ? (
              <Select value={version} onChange={e => setVersion(e.target.value)}>
                {localVersions.map(v => (
                    <option key={v} value={v}>{v}</option>
                ))}
              </Select>
          ) : (
              <Select value={version} onChange={e => setVersion(e.target.value)}>
                <option value="1.20.4">1.20.4</option>
                <option value="1.20.1">1.20.1</option>
                <option value="1.19.4">1.19.4</option>
                <option value="1.18.2">1.18.2</option>
                <option value="1.16.5">1.16.5</option>
                <option value="1.12.2">1.12.2</option>
                <option value="1.8.9">1.8.9</option>
                <option value="1.7.10">1.7.10</option>
              </Select>
          )}
        </FormGroup>

        <FormGroup>
          <Label>内存分配</Label>
          <Select value={ram} onChange={e => setRam(e.target.value)}>
            <option value="1G">1 GB</option>
            <option value="2G">2 GB</option>
            <option value="4G">4 GB</option>
            <option value="6G">6 GB</option>
            <option value="8G">8 GB</option>
          </Select>
        </FormGroup>

        {loading && (
          <ProgressBarContainer>
            <ProgressBarFill $percent={progress} />
          </ProgressBarContainer>
        )}

        {status && (
          <StatusMessage $error={status.error}>
            {status.msg}
          </StatusMessage>
        )}

        <ButtonGroup>
          <Button onClick={handleCancel}>取消</Button>
          <Button $primary onClick={handleDeploy} disabled={loading}>
            {loading ? '部署中...' : '立即部署'}
          </Button>
        </ButtonGroup>
      </Content>
    </Container>
  );
};
