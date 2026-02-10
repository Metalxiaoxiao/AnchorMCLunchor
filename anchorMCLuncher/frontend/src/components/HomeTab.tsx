import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { User, Server, DockerServer } from '../types';
import { ServerCard } from './ServerCard';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ServerDeployModal } from './ServerDeployModal';
import { ServerConsoleModal } from './ServerConsoleModal';
import { MessageModal } from './MessageModal';
import { LaunchSettingsModal } from './LaunchSettingsModal';
import { SkinChangeModal } from './SkinChangeModal';
import { SkinViewer } from './SkinViewer';
import * as api from '../api';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import { DownloadProgress } from './DownloadTab';

import { ask } from '@tauri-apps/plugin-dialog';


const DashboardContainer = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
`;

const LeftPanel = styled.div`
  width: 300px;
  background-color: var(--panel-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 2rem;
  box-sizing: border-box;
  justify-content: space-between;
  backdrop-filter: blur(10px);
`;

const RightPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: transparent;
  position: relative;
`;

const AddServerButton = styled.button`
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: var(--accent-hover);
    transform: scale(1.1);
  }
`;

const FloatingAddButton = styled(AddServerButton)`
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 100;
  font-size: 24px;
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;

  /* Custom Scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }
`;

const ProfileSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const ProfileName = styled.h2`
  margin: 0.5rem 0;
  color: var(--text-color);
  font-size: 1.5rem;
`;

const ActionSection = styled.div`
  margin-top: auto;
`;

const LaunchButton = styled.button<{ $loading?: boolean; $running?: boolean }>`
  width: 100%;
  height: 56px;
  padding: 0;
  font-size: 1.2rem;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
  
  /* Minecraft Button Style */
  background-color: ${props => props.$running ? '#666' : 'var(--accent-color)'};
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="); /* Noise texture placeholder */
  
  border: 2px solid #000;
  border-top-color: rgba(255,255,255,0.4);
  border-left-color: rgba(255,255,255,0.4);
  border-bottom-color: rgba(0,0,0,0.6);
  border-right-color: rgba(0,0,0,0.6);
  
  border-radius: 0;
  
  cursor: ${props => (props.$loading || props.$running) ? 'not-allowed' : 'pointer'};
  position: relative;
  
  box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
    
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: none;
  image-rendering: pixelated;

  &:hover {
    filter: ${props => (props.$loading || props.$running) ? 'none' : 'brightness(1.1)'};
    background-color: ${props => props.$running ? '#666' : 'var(--accent-hover)'};
    border-top-color: rgba(255,255,255,0.6);
    border-left-color: rgba(255,255,255,0.6);
  }

  &:active {
    background-color: ${props => (props.$loading || props.$running) ? '#666' : 'var(--accent-color)'};
    border-top-color: rgba(0,0,0,0.6);
    border-left-color: rgba(0,0,0,0.6);
    border-bottom-color: rgba(255,255,255,0.4);
    border-right-color: rgba(255,255,255,0.4);
    transform: translateY(2px);
  }
`;

const LoadingSpinner = styled.div`
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
  margin-right: 10px;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LogoutButton = styled.button`
  width: 100%;
  margin-top: 1rem;
  background: transparent;
  border: 1px solid var(--border-color);
  color: #64748b;
  padding: 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border-color: #ef4444;
  }
`;

const SkinContainer = styled.div`
  position: relative;
  width: 250px;
  height: 250px;
  margin: 0 auto 1rem auto;
`;

const ChangeSkinButton = styled.button`
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);

  &:hover {
    background: var(--accent-color);
    transform: scale(1.1);
  }

  svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 0.5rem;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 1.5rem;
  color: var(--accent-color);
`;

const ServerList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
`;

interface HomeTabProps {
  user: User;
  servers: Server[];
  onLaunch: () => Promise<boolean>;
  onJoinServer: (server: Server) => Promise<void>;
  onDeployClient: (server: Server | DockerServer) => Promise<void>;
  onLogout: () => void;
  selectedVersion: string;
  setSelectedVersion: (version: string) => void;
  gamePath: string;
  showAlert: (msg: string) => void;
  setActiveTab: (tab: string) => void;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  setCustomDownloadName: (name: string | null) => void;
  setInstalling: (id: string | null) => void;
}

const VersionSelect = styled.select`
  width: 100%;
  padding: 0.8rem;
  margin-bottom: 1rem;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 1rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

export const HomeTab: React.FC<HomeTabProps> = ({ 
  user, servers, onLaunch, onJoinServer, onDeployClient, onLogout, 
  selectedVersion, setSelectedVersion, gamePath, showAlert,
  setActiveTab, setDownloadProgress, setCustomDownloadName, setInstalling
}) => {
  const [installedVersions, setInstalledVersions] = React.useState<string[]>([]);
  const [dockerServers, setDockerServers] = useState<DockerServer[]>([]);
  const [remoteServers, setRemoteServers] = useState<Server[]>([]);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleServerId, setConsoleServerId] = useState<string | null>(null);
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSkinModal, setShowSkinModal] = useState(false);
  const [customSkin, setCustomSkin] = useState<string | null>(null);

  const [isLaunching, setIsLaunching] = useState(false);
  const [isGameRunning, setIsGameRunning] = useState(false);

  useEffect(() => {
    setRemoteServers(servers);
  }, [servers]);

  const combinedServers = useMemo(() => {
    const dockerContainerIds = new Set(dockerServers.map(ds => ds.container_id));
    const uniqueRemoteServers = remoteServers.filter(s => !s.container_id || !dockerContainerIds.has(s.container_id));
    return [...dockerServers, ...uniqueRemoteServers];
  }, [dockerServers, remoteServers]);

  useEffect(() => {
    const unlistenStatus = listen<string>('launch-status', (event) => {
      setLaunchStatus(event.payload);
      setIsLaunchModalOpen(true);
    });

    const unlistenExit = listen<string>('game-exit', (event) => {
      setIsGameRunning(false);
      setIsLaunching(false);
      if (event.payload.includes("error")) {
        setLaunchStatus(null);
        setIsLaunchModalOpen(false);
        showAlert(`游戏异常退出: ${event.payload}`);
      } else {
        // Game closed normally
        setLaunchStatus(null);
        setIsLaunchModalOpen(false);
      }
    });

    const unlistenOutput = listen<string>('game-output', (event) => {
        // Optional: Log to console or show in a debug window
        console.log(event.payload);
    });

    const unlistenDeploy = listen('server-deployed', () => {
      fetchDockerServers();
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenExit.then(f => f());
      unlistenOutput.then(f => f());
      unlistenDeploy.then(f => f());
    };
  }, []);

  const fetchDockerServers = async () => {
    try {
      const list = await api.listDockerServers();
      setDockerServers(list);
    } catch (e) {
      console.error("Failed to fetch docker servers", e);
    }
  };

  React.useEffect(() => {
    fetchDockerServers();
    const interval = setInterval(fetchDockerServers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeployWindow = async () => {
    const label = 'server-deploy-window';
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await invoke('focus_window', { label });
    } else {
      new WebviewWindow(label, {
        url: 'index.html?window=server-deploy',
        title: '部署新服务器',
        width: 500,
        height: 600,
        resizable: false,
        focus: true
      });
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.startDockerServer(id);
      fetchDockerServers();
      showAlert("正在启动服务器...");
    } catch (e) {
      showAlert("启动失败");
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.stopDockerServer(id);
      fetchDockerServers();
      showAlert("正在停止服务器...");
    } catch (e) {
      showAlert("停止失败");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const yes = await ask('确定要删除该服务器吗？此操作不可恢复。', {
        title: '删除服务器',
        kind: 'warning'
      });
      if (!yes) return;
      await api.deleteDockerServer(id);
      fetchDockerServers();
      try {
        const list = await api.getServers();
        setRemoteServers(list);
      } catch (error) {
        console.error('Failed to refresh server list', error);
      }
      showAlert("服务器已删除");
    } catch (e) {
      showAlert("删除失败");
    }
  };

  const handleConsole = async (id: string) => {
    const server = dockerServers.find(s => s.container_id === id);
    if (!server) return;

    const label = `server-console-${id}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await invoke('focus_window', { label });
    } else {
      const webview = new WebviewWindow(label, {
        url: `index.html?window=server-console&containerId=${id}&name=${encodeURIComponent(server.name)}&status=${server.status}`,
        title: `${server.name} - 管理面板`,
        width: 800,
        height: 600,
        focus: true
      });
      
      webview.once('tauri://error', function (e) {
        console.error('Error creating window', e);
      });
    }
  };


  React.useEffect(() => {
    async function fetchVersions() {
      try {
        const versions = await invoke<string[]>('list_installed_versions', { gamePath: gamePath || null });
        setInstalledVersions(versions);
        // If current selected version is not in list (and list is not empty), select first one?
        // Or keep it if user typed it manually (if we allowed typing).
        // If nothing selected, select first one.
        if (!selectedVersion && versions.length > 0) {
          setSelectedVersion(versions[0]);
        }
      } catch (error) {
        console.error("Failed to list versions:", error);
      }
    }
    fetchVersions();
  }, [gamePath]); // Re-fetch if gamePath changes

  const handleLaunchClick = async () => {
    if (isLaunching || isGameRunning) return;
    setIsLaunching(true);
    try {
      const success = await onLaunch();
      setIsLaunching(false);
      if (success) {
        setIsGameRunning(true);
      }
    } catch (e) {
      setIsLaunching(false);
      showAlert("启动失败");
    } finally {
      // Close modal whether success or failure (handled by App.tsx)
      // If success: game spawned, modal closes.
      // If failure: alert shown by App.tsx, modal closes.
      setIsLaunchModalOpen(false);
    }
  };

  return (
    <DashboardContainer>
      <LeftPanel>
        <ProfileSection>
          <SkinContainer>
             <SkinViewer 
               width={250} 
               height={250} 
               skinUrl={customSkin || (user.uuid ? `https://minotar.net/skin/${user.uuid}` : `https://minotar.net/skin/MHF_Steve`)} 
             />
             <ChangeSkinButton onClick={() => setShowSkinModal(true)} title="Change Skin">
               <svg viewBox="0 0 24 24">
                 <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
               </svg>
             </ChangeSkinButton>
          </SkinContainer>
          <ProfileName>{user.username}</ProfileName>
        </ProfileSection>
        
        <ActionSection>
          <VersionSelect 
            value={selectedVersion} 
            onChange={(e) => setSelectedVersion(e.target.value)}
          >
            <option value="" disabled>请选择版本</option>
            {installedVersions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
             {/* Allow typing custom version if needed, but for now just select */}
          </VersionSelect>

          <LaunchButton onClick={handleLaunchClick} disabled={isLaunching || isGameRunning} $loading={isLaunching} $running={isGameRunning}>
            {isLaunching ? (
              <>
                <LoadingSpinner />
                <span>启动中...</span>
              </>
            ) : isGameRunning ? (
              "游戏运行中"
            ) : (
              "启动游戏"
            )}
          </LaunchButton>
          <LogoutButton onClick={() => {
            if (selectedVersion) {
              setShowSettingsModal(true);
            } else {
              showAlert("请先选择一个版本");
            }
          }}>
            版本设置
          </LogoutButton>
        </ActionSection>
      </LeftPanel>

      <RightPanel>
        <ContentArea>
          <ServerList>
            {combinedServers.map(server => {
              const isDocker = 'status' in server;
              return (
                <ServerCard 
                  key={isDocker ? `docker-${server.id}` : `remote-${server.id}`} 
                  server={server} 
                  onStart={handleStart}
                  onStop={handleStop}
                  onConsole={handleConsole}
                  onDelete={isDocker ? handleDelete : undefined}
                  onJoin={(s) => onJoinServer(s)}
                  onDeployClient={(s) => onDeployClient(s)}
                />
              );
            })}
            {combinedServers.length === 0 && (
               <div style={{ padding: '1rem', color: '#666', textAlign: 'center', width: '100%', gridColumn: '1 / -1' }}>
                  暂无服务器，请点击右下角按钮部署。
               </div>
            )}
          </ServerList>
        </ContentArea>
        
        <FloatingAddButton onClick={handleDeployWindow} title="部署新服务器">+</FloatingAddButton>
      </RightPanel>

      {/* ServerDeployModal Removed - Now using separate window */}
      
      {/* Console Modal Removed - Now using separate window */}

      <MessageModal
        isOpen={isLaunchModalOpen}
        message={launchStatus || "正在启动..."}
        onClose={() => setIsLaunchModalOpen(false)}
        showCancel={true}
        cancelText="取消"
        type="info"
        zIndex={3000}
      />

      <LaunchSettingsModal 
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        versionId={selectedVersion}
        onSave={() => {}}
      />

      <SkinChangeModal
        isOpen={showSkinModal}
        onClose={() => setShowSkinModal(false)}
        currentSkinUrl={customSkin || (user.uuid ? `https://minotar.net/skin/${user.uuid}` : `https://minotar.net/skin/MHF_Steve`)}
        onSave={(skin) => {
          if (typeof skin === 'string') {
            setCustomSkin(skin);
          } else {
            const url = URL.createObjectURL(skin);
            setCustomSkin(url);
          }
        }}
      />
    </DashboardContainer>
  );
};
