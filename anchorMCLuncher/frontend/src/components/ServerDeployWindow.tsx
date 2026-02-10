import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Window } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import * as api from '../api';
import { ChoiceModal } from './ChoiceModal';

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

const MemoryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const RangeInput = styled.input`
  width: 100%;
  appearance: none;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-color) 0%, #e2e8f0 100%);
  outline: none;
  transition: background 0.2s;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    border: 2px solid white;
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent-color);
    cursor: pointer;
    border: 2px solid white;
  }
`;

const MemoryValue = styled.div`
  font-weight: 600;
  color: var(--text-color);
  min-width: 120px;
  text-align: right;
`;

const MemoryHint = styled.div`
  color: #64748b;
  font-size: 0.9rem;
  margin-top: 0.4rem;
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
  const [ramMb, setRamMb] = useState(2048);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = React.useRef(false);
  const [status, setStatus] = useState<{msg: string, error: boolean} | null>(null);
  const [localVersions, setLocalVersions] = useState<string[]>([]);
  const [useLocalVersion, setUseLocalVersion] = useState(false);
  const [deployTaskId, setDeployTaskId] = useState<string | null>(null);
  const [deploySource, setDeploySource] = useState<EventSource | null>(null);
  const [packChoiceOpen, setPackChoiceOpen] = useState(false);
  const packChoiceResolver = React.useRef<((format: 'modrinth' | 'curseforge' | null) => void) | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<{ total_mb: number; available_mb: number } | null>(null);

  useEffect(() => {
    invoke<string[]>('list_installed_versions', { gamePath: null })
      .then(setLocalVersions)
      .catch(console.error);
    api.getDockerHostMemory()
      .then(setMemoryInfo)
      .catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (deploySource) {
        deploySource.close();
      }
    };
  }, [deploySource]);

  const handleDeploy = async () => {
    if (!name) {
      setStatus({ msg: "请输入服务器名称", error: true });
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setStatus(null);
    setProgress(10);

    const taskId = `deploy-${Date.now()}`;
    setDeployTaskId(taskId);
    const source = new EventSource(api.getDeployProgressUrl(taskId));
    setDeploySource(source);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (typeof payload.percent === 'number') {
          setProgress(payload.percent);
        }
        if (payload.message) {
          setStatus({ msg: payload.message, error: Boolean(payload.error) });
        }
      } catch (e) {
        console.error('Invalid deploy progress payload', e);
      }
    };

    source.onerror = () => {
      source.close();
    };

    try {
      let runtime: { mcVersion?: string; loaderType?: string; loaderVersion?: string } | undefined;
      if (useLocalVersion) {
        try {
          const info = await invoke<{ mc_version?: string; loader_type?: string; loader_version?: string }>('get_version_runtime_info', {
            versionId: version,
            gamePath: null
          });
          runtime = {
            mcVersion: info.mc_version,
            loaderType: info.loader_type,
            loaderVersion: info.loader_version
          };
        } catch (e) {
          console.error("Failed to resolve version runtime info", e);
        }
      }
      // 1. Create Server
      const server = await api.createDockerServer(name, version, `${ramMb}M`, taskId, runtime);
      setProgress(40);
      
      // 2. If local version selected, package and upload
      if (useLocalVersion) {
          const packFormat = await new Promise<'modrinth' | 'curseforge' | null>((resolve) => {
            packChoiceResolver.current = resolve;
            setPackChoiceOpen(true);
          });

          if (!packFormat) {
            setStatus({ msg: "已取消打包", error: true });
            setLoading(false);
            return;
          }

          setStatus({ msg: "正在打包并上传本地客户端文件...", error: false });
          setProgress(55);
          
          const token = localStorage.getItem('token');
          // Construct upload URL. Assuming api.defaults.baseURL is set or we construct it manually.
          const containerId = server.container_id || server.containerId;
          const uploadUrl = `${api.getApiBaseUrl()}/docker/${containerId}/client-upload?taskId=${encodeURIComponent(taskId)}`;

          await invoke('package_and_upload_local_version', { 
              versionId: version, 
              gamePath: null,
              uploadUrl: uploadUrl,
              token: token || null,
              packFormat: packFormat,
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
    if (deployTaskId) {
      ask('是否删除已创建的服务器？', { title: '取消部署', kind: 'warning' })
        .then((deleteServer) => api.cancelDeploy(deployTaskId, Boolean(deleteServer)))
        .catch(console.error)
        .finally(() => Window.getCurrent().close());
    } else {
      Window.getCurrent().close();
    }
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
          <MemoryRow>
            <RangeInput
              type="range"
              min={512}
              max={Math.max(1024, memoryInfo?.available_mb || 16384)}
              step={256}
              value={ramMb}
              onChange={e => setRamMb(parseInt(e.target.value, 10) || 1024)}
            />
            <MemoryValue>{ramMb} MB</MemoryValue>
          </MemoryRow>
          <MemoryHint>
            {memoryInfo
              ? `系统可用内存 ${memoryInfo.available_mb} MB`
              : '正在读取系统内存...'}
          </MemoryHint>
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
      <ChoiceModal
        isOpen={packChoiceOpen}
        onClose={() => {
          setPackChoiceOpen(false);
          if (packChoiceResolver.current) {
            packChoiceResolver.current(null);
            packChoiceResolver.current = null;
          }
        }}
        onSelect={(id) => {
          if (packChoiceResolver.current) {
            const value = id === 'modrinth' || id === 'curseforge' ? id : null;
            packChoiceResolver.current(value as 'modrinth' | 'curseforge' | null);
            packChoiceResolver.current = null;
          }
          setPackChoiceOpen(false);
        }}
        options={[
          {
            id: 'modrinth',
            label: 'Modrinth 风格 (.mrpack)',
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L5 7.2v7.6l7 3.9 7-3.9V7.2l-7-2.9z"/>
              </svg>
            )
          },
          {
            id: 'curseforge',
            label: 'CurseForge 风格 (.zip)',
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            )
          }
        ]}
      />
    </Container>
  );
};
