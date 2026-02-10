import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import { VersionConfigModal } from './VersionConfigModal';
import { ModrinthBrowser } from './ModrinthBrowser';

const Layout = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 140px;
  background-color: var(--panel-bg);
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  border-right: 1px solid var(--border-color);
`;

const SidebarItem = styled.div<{ $active: boolean }>`
  padding: 0.8rem 1.5rem;
  cursor: pointer;
  background: ${props => props.$active ? 'rgba(255, 255, 255, 0.05)' : 'transparent'};
  color: ${props => props.$active ? 'var(--text-color)' : '#64748b'};
  transition: all 0.2s;
  font-weight: ${props => props.$active ? 'bold' : 'normal'};
  position: relative;
  display: flex;
  align-items: center;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-color);
  }

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    height: 60%;
    width: 4px;
    background-color: var(--accent-color);
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
    transform: translateY(-50%) scaleY(${props => props.$active ? 1 : 0});
    transition: transform 0.2s ease;
  }
`;

const Content = styled.div`
  flex: 1;
  height: 100%;
  overflow-y: auto;
  padding: 2rem;
  box-sizing: border-box;
  
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

const VersionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const VersionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.9);
    transform: translateX(5px);
  }
`;

const VersionName = styled.div`
  font-weight: bold;
  font-size: 1.1rem;
  color: var(--text-color);
`;

const VersionType = styled.span<{ $type: string }>`
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 0.5rem;
  background: ${props => props.$type === 'release' ? '#dcfce7' : '#f1f5f9'};
  color: ${props => props.$type === 'release' ? '#166534' : '#64748b'};
`;

const InstallButton = styled.button`
  padding: 0.5rem 1rem;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s;

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 4px;
  background-color: #e2e8f0;
  border-radius: 2px;
  margin-top: 0.5rem;
  overflow: hidden;
`;


const ProgressBarFill = styled.div<{ $progress: number }>`
  height: 100%;
  width: ${props => props.$progress}%;
  background-color: var(--accent-color);
  transition: width 0.3s ease;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  flex-direction: column;
  gap: 1rem;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-left-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  color: #64748b;
  font-size: 1rem;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }
`;

const StatusText = styled.div`
  font-size: 0.8rem;
  color: #64748b;
  margin-top: 0.2rem;
`;

const ImportArea = styled.div`
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);

  &:hover {
    background: rgba(255, 255, 255, 0.9);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    border-color: var(--accent-color);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
`;

const ImportTitle = styled.div`
  font-weight: bold;
  color: var(--text-color);
  font-size: 1rem;
`;

const ImportDesc = styled.div`
  color: #666;
  font-size: 0.8rem;
`;

interface Version {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: Version[];
}

export interface DownloadProgress {
  version_id: string;
  total_files: number;
  downloaded_files: number;
  current_file: string;
  percent: number;
  current_file_progress?: number | null;
  current_file_downloaded?: number | null;
  current_file_total?: number | null;
}

interface DownloadTabProps {
  installing: string | null;
  setInstalling: (id: string | null) => void;
  progress: DownloadProgress | null;
  setProgress: (progress: DownloadProgress | null) => void;
  showAlert: (msg: string) => void;
  customDownloadName?: string | null;
  currentVersion?: string;
  gamePath?: string;
  javaPath?: string;
}

export const DownloadTab: React.FC<DownloadTabProps> = ({ installing, setInstalling, progress, setProgress, showAlert, customDownloadName, currentVersion, gamePath, javaPath }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedVersionForConfig, setSelectedVersionForConfig] = useState('');
  const [activeTab, setActiveTab] = useState<'game' | 'import' | 'mod'>('game');
  // const [enableIsolation, setEnableIsolation] = useState(true); // Removed in favor of global setting


  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      const versions = await invoke<Version[]>('fetch_manifest');
      setVersions(versions);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      showAlert('获取版本列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openConfigModal = (versionId: string) => {
    setSelectedVersionForConfig(versionId);
    setConfigModalOpen(true);
  };

  const handleInstall = async (loaderType: string, loaderVersion: string) => {
    setConfigModalOpen(false);
    const versionId = selectedVersionForConfig;
    
    // Open independent download window
    const webview = new WebviewWindow('download-' + Date.now(), {
      url: `index.html?window=download&versionId=${versionId}&loaderType=${loaderType}&loaderVersion=${loaderVersion}&javaPath=${encodeURIComponent(javaPath || '')}`,
      title: '下载进度',
      width: 500,
      height: 300,
      resizable: false,
      alwaysOnTop: true,
      center: true
    });

    webview.once('tauri://created', function () {
      // webview window successfully created
    });
    
    webview.once('tauri://error', function (e) {
      // an error happened creating the webview window
      console.error('Webview creation error:', e);
      showAlert(`无法打开下载窗口: ${JSON.stringify(e)}`);
    });
  };

  const handleImportModpack = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Modpacks',
          extensions: ['zip', 'mrpack']
        }]
      });

      if (selected) {
        const webview = new WebviewWindow('download-' + Date.now(), {
          url: `index.html?window=download&modpackPath=${encodeURIComponent(selected as string)}`,
          title: '导入整合包',
          width: 500,
          height: 300,
          resizable: false,
          alwaysOnTop: true,
          center: true
        });
      }
    } catch (e) {
      console.error(e);
      showAlert("选择文件失败");
    }
  };

  const handleInstallModpackFromUrl = (version: any, project: any) => {
    const file = version.files.find((f: any) => f.primary) || version.files[0];
    if (!file) {
      showAlert("未找到可下载的文件");
      return;
    }

    const webview = new WebviewWindow('download-' + Date.now(), {
      url: `index.html?window=download&modpackPath=${encodeURIComponent(file.url)}`,
      title: `安装整合包: ${project.title}`,
      width: 500,
      height: 300,
      resizable: false,
      alwaysOnTop: true,
      center: true
    });
  };

  const handleInstallMod = async (version: any, project: any) => {
    const file = version.files.find((f: any) => f.primary) || version.files[0];
    if (!file) {
      showAlert("未找到可下载的文件");
      return;
    }

    try {
      const path = await save({
        defaultPath: file.filename,
        filters: [{
          name: 'Mod Jar',
          extensions: ['jar']
        }]
      });

      if (path) {
        await invoke('download_single_file', { url: file.url, path });
        showAlert("下载完成！");
      }
    } catch (e) {
      console.error(e);
      showAlert(`下载失败: ${e}`);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Sidebar>
          <SidebarItem $active={activeTab === 'game'} onClick={() => setActiveTab('game')}>
            游戏下载
          </SidebarItem>
          <SidebarItem $active={activeTab === 'import'} onClick={() => setActiveTab('import')}>
            整合包
          </SidebarItem>
          <SidebarItem $active={activeTab === 'mod'} onClick={() => setActiveTab('mod')}>
            Mod下载
          </SidebarItem>
        </Sidebar>
        <Content>
          <LoadingContainer>
            <Spinner />
            <LoadingText>正在获取版本列表...</LoadingText>
          </LoadingContainer>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout>
      <Sidebar>
        <SidebarItem $active={activeTab === 'game'} onClick={() => setActiveTab('game')}>
          游戏下载
        </SidebarItem>
        <SidebarItem $active={activeTab === 'import'} onClick={() => setActiveTab('import')}>
          整合包
        </SidebarItem>
        <SidebarItem $active={activeTab === 'mod'} onClick={() => setActiveTab('mod')}>
          Mod下载
        </SidebarItem>
      </Sidebar>
      
      <Content>
        {activeTab === 'game' && (
          <>
            {customDownloadName && installing === customDownloadName && (
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--accent-color)' }}>
                  <h3 style={{ margin: '0 0 1rem 0' }}>正在部署客户端: {customDownloadName}</h3>
                  <ProgressBarContainer>
                    <ProgressBarFill $progress={progress?.percent || 0} />
                  </ProgressBarContainer>
                  <div style={{ textAlign: 'center', marginTop: '0.5rem', color: '#64748b' }}>
                    {progress?.current_file} ({Math.round(progress?.percent || 0)}%)
                  </div>
              </div>
            )}
            <VersionConfigModal 
              isOpen={configModalOpen}
              onClose={() => setConfigModalOpen(false)}
              gameVersion={selectedVersionForConfig}
              onConfirm={handleInstall}
            />
            <VersionList>
              {versions.map((version) => (
                <VersionItem key={version.id}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <VersionName>{version.id}</VersionName>
                      <VersionType $type={version.type}>{version.type}</VersionType>
                    </div>
                    {installing === version.id && progress && (
                      <>
                        <ProgressBarContainer>
                          <ProgressBarFill $progress={progress.percent} />
                        </ProgressBarContainer>
                        <StatusText>
                          {progress.downloaded_files} / {progress.total_files} - {progress.current_file}
                        </StatusText>
                      </>
                    )}
                  </div>
                  <InstallButton 
                    onClick={() => openConfigModal(version.id)}
                  >
                    安装
                  </InstallButton>
                </VersionItem>
              ))}
            </VersionList>
          </>
        )}

        {activeTab === 'import' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <ImportArea onClick={handleImportModpack}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <div>
                <ImportTitle>导入本地整合包</ImportTitle>
                <ImportDesc>支持 .zip 和 .mrpack 格式</ImportDesc>
              </div>
            </ImportArea>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ModrinthBrowser type="modpack" onInstall={handleInstallModpackFromUrl} />
            </div>
          </div>
        )}

        {activeTab === 'mod' && (
          <ModrinthBrowser 
            type="mod" 
            onInstall={handleInstallMod} 
            currentVersion={currentVersion} 
            gamePath={gamePath} 
            showAlert={showAlert} 
            onSwitchToGameDownload={() => setActiveTab('game')}
          />
        )}
      </Content>
    </Layout>
  );
};
