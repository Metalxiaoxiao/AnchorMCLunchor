import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { io, Socket } from 'socket.io-client';
import { message, confirm } from '@tauri-apps/plugin-dialog';
import { Window } from '@tauri-apps/api/window';
import * as api from '../api';
import { ServerConfigTab } from './ServerConfigTab';
import { FileEditorModal } from './FileEditorModal';

// Helper function to show Tauri dialogs
const showDialog = async (title: string, content: string, type: 'info' | 'error' | 'warning' = 'info') => {
  try {
    await message(`${content}`, {
      title: title,
      kind: type,
    });
  } catch (e) {
    // Fallback to console if dialog fails
    console.log(`${title}: ${content}`);
  }
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  user-select: none;
`;

const Header = styled.div`
  padding: 0 1rem;
  background: #2d2d2d;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #3e3e3e;
  height: 50px;
  -webkit-app-region: drag;
`;

const Title = styled.h3`
  margin: 0;
  color: #fff;
`;

const TabBar = styled.div`
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3e3e3e;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 0.8rem 1.5rem;
  background: ${props => props.$active ? '#1e1e1e' : 'transparent'};
  color: ${props => props.$active ? '#fff' : '#888'};
  border: none;
  border-top: 2px solid ${props => props.$active ? 'var(--accent-color)' : 'transparent'};
  cursor: pointer;
  font-weight: bold;
  
  &:hover {
    background: #2a2d2e;
    color: #fff;
  }
`;

const ContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Terminal = styled.div`
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  background: #1e1e1e;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.4;
`;

const InputArea = styled.div`
  padding: 1rem;
  background: #2d2d2d;
  display: flex;
  gap: 1rem;
`;

const CommandInput = styled.input`
  flex: 1;
  background: #3e3e3e;
  border: 1px solid #4e4e4e;
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const ActionButton = styled.button<{ $color?: string }>`
  padding: 2px 6px;
  background: ${props => props.$color || '#3e3e3e'};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
    display: block;
  }
  &:hover {
    opacity: 0.9;
  }
`;

// File Browser Styles
const FileBrowserContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  overflow: hidden;
`;

const FileToolbar = styled.div`
  padding: 0.5rem 1rem;
  background: #252526;
  border-bottom: 1px solid #3e3e3e;
  display: flex;
  gap: 1rem;
  align-items: center;
`;

const Breadcrumbs = styled.div`
  flex: 1;
  color: #aaa;
  font-size: 0.9rem;
  
  span {
    cursor: pointer;
    &:hover { color: #fff; text-decoration: underline; }
  }
`;

const FileList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
`;

const FileItem = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  color: #ccc;

  &:hover {
    background: #2a2d2e;
    color: #fff;
  }

  ${props => props.$selected && `
    background: #007acc;
    color: #fff;
  `}
`;

const FileIcon = styled.span`
  margin-right: 0.8rem;
  width: 20px;
  text-align: center;
`;

const FileName = styled.span`
  flex: 1;
`;

const FileSize = styled.span`
  width: 100px;
  text-align: right;
  color: #666;
  font-size: 0.8rem;
`;

const FileDate = styled.span`
  width: 150px;
  text-align: right;
  color: #666;
  font-size: 0.8rem;
  margin-left: 1rem;
`;

// Input Modal Styles
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
`;

const ModalContent = styled.div`
  background: #252526;
  padding: 1.5rem;
  border-radius: 8px;
  width: 300px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  border: 1px solid #3e3e3e;
`;

const ModalTitle = styled.h4`
  margin: 0 0 1rem 0;
  color: #fff;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  background: #3e3e3e;
  border: 1px solid #4e4e4e;
  color: #fff;
  border-radius: 4px;
  margin-bottom: 1rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const ModalButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  updatedAt: string;
}

export const ServerConsoleWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'files' | 'config'>('console');
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState('unknown');
  const [serverName, setServerName] = useState('Server');
  const [containerId, setContainerId] = useState<string | null>(null);
  
  // File Browser State
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Modal State
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // File Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFilePath, setEditingFilePath] = useState('');
  const [editingFileName, setEditingFileName] = useState('');
  
  // Clipboard State for Copy/Paste
  const [copiedFilePath, setCopiedFilePath] = useState<string | null>(null);
  
  // Selected Files State for Batch Operations
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const id = params.get('containerId');
    const name = params.get('name');
    const initialStatus = params.get('status');

    if (id) {
        setContainerId(id);
        if (name) setServerName(name);
        if (initialStatus) setStatus(initialStatus);

        // Connect Socket.IO
        const socket = io('http://localhost:3000');
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to console socket');
            socket.emit('attach-console', id);
        });

        socket.on('console-output', (data: string) => {
            setLogs(prev => [...prev, data]);
            if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
            }
        });

        return () => {
            socket.disconnect();
        };
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'files' && containerId) {
      fetchFiles();
    }
  }, [activeTab, currentPath, containerId]);

  const fetchFiles = async () => {
    if (!containerId) return;
    setLoadingFiles(true);
    try {
      const list = await api.listDockerFiles(containerId, currentPath);
      // Sort: Folders first, then files
      list.sort((a: FileEntry, b: FileEntry) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
      setFiles(list);
    } catch (error) {
      console.error("Failed to list files", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSendCommand = async () => {
    if (!command || !containerId) return;
    try {
      await api.sendDockerCommand(containerId, command);
      setCommand('');
    } catch (error) {
      console.error("Failed to send command", error);
    }
  };

  const handleStart = async () => {
    if (!containerId) return;
    try {
      await api.startDockerServer(containerId);
      setStatus('running');
    } catch (e) { await showDialog("错误", "启动失败", "error"); }
  };

  const handleStop = async () => {
    if (!containerId) return;
    try {
      await api.stopDockerServer(containerId);
      setStatus('stopped');
    } catch (e) { await showDialog("错误", "停止失败", "error"); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && containerId) {
      try {
        await api.uploadDockerFile(containerId, e.target.files[0]);
        await showDialog("成功", "上传成功", "info");
        fetchFiles();
      } catch (error) {
        await showDialog("错误", "上传失败", "error");
      }
    }
  };

  const handleDeleteFile = async (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    if (!await confirm(`确定要删除 ${fileName} 吗?`) || !containerId) return;
    try {
      const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
      await api.deleteDockerFile(containerId, fullPath);
      fetchFiles();
    } catch (error) {
      await showDialog("错误", "删除失败", "error");
    }
  };

  const handleEditFile = (fileName: string) => {
    const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
    setEditingFilePath(fullPath);
    setEditingFileName(fileName);
    setIsEditorOpen(true);
  };

  const handleDownloadFile = async (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    if (!containerId) return;
    try {
      const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
      const result = await api.readDockerFileContent(containerId, fullPath);
      
      // Create and trigger download
      const blob = new Blob([result.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      await showDialog("错误", "下载失败", "error");
    }
  };

  const handleCopyFile = async (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    if (!containerId) return;
    const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
    try {
      await api.copyDockerFile(containerId, fullPath);
      setCopiedFilePath(fullPath);
      await showDialog("成功", `已复制文件: ${fileName}\n点击粘贴或使用 Ctrl+V 粘贴到当前位置`, "info");
    } catch (error) {
      await showDialog("错误", "复制失败", "error");
    }
  };

  const handlePasteFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerId || !copiedFilePath) return;
    
    const fileName = copiedFilePath.split('/').pop() || 'copied_file';
    const newFileName = `${currentPath}/${fileName}`;
    
    try {
      await api.pasteDockerFile(containerId, newFileName, copiedFilePath);
      await showDialog("成功", `已粘贴文件: ${fileName}`, "info");
      fetchFiles();
      setCopiedFilePath(null);
    } catch (error) {
      await showDialog("错误", "粘贴失败", "error");
    }
  };

  const handleCreateFolder = async () => {
    if (!containerId) return;
    if (!newFolderName) return;
    
    try {
      const fullPath = currentPath === '/' ? newFolderName : `${currentPath}/${newFolderName}`;
      await api.createDockerFolder(containerId, fullPath);
      fetchFiles();
      setShowNewFolderModal(false);
      setNewFolderName('');
    } catch (error) {
      await showDialog("错误", "创建文件夹失败", "error");
    }
  };

  const openNewFolderModal = () => {
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : parts.join('/'));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Container>
      <Header>
        <Title>{serverName} - 管理面板 ({status})</Title>
        <div style={{ display: 'flex', gap: '10px' }}>
          <ActionButton $color="#16a34a" onClick={handleStart} title="启动">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </ActionButton>
          <ActionButton $color="#dc2626" onClick={handleStop} title="停止">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          </ActionButton>
        </div>
      </Header>

      <TabBar>
        <Tab $active={activeTab === 'console'} onClick={() => setActiveTab('console')}>控制台</Tab>
        <Tab $active={activeTab === 'files'} onClick={() => setActiveTab('files')}>文件管理</Tab>
        <Tab $active={activeTab === 'config'} onClick={() => setActiveTab('config')}>服务器配置</Tab>
      </TabBar>
      
      <ContentArea>
        {activeTab === 'console' && (
          <>
            <Terminal ref={terminalRef}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </Terminal>
            <InputArea>
              <CommandInput 
                value={command} 
                onChange={e => setCommand(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleSendCommand()}
                placeholder="输入命令..."
              />
              <ActionButton $color="var(--accent-color)" onClick={handleSendCommand}>发送</ActionButton>
            </InputArea>
          </>
        )}
        
        {activeTab === 'files' && (
          <FileBrowserContainer>
            <FileToolbar>
              <ActionButton onClick={navigateUp} disabled={currentPath === '/'}>⬆ 上一级</ActionButton>
              <Breadcrumbs>当前路径: {currentPath}</Breadcrumbs>
              {selectedFiles.length > 0 && (
                <ActionButton 
                  $color="#7c3aed"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!containerId) return;
                    try {
                      for (const fileName of selectedFiles) {
                        const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
                        await api.copyDockerFile(containerId, fullPath);
                      }
                      await showDialog("成功", `已复制 ${selectedFiles.length} 个文件\n点击粘贴或使用 Ctrl+V 粘贴到当前位置`, "info");
                    } catch (error) {
                      await showDialog("错误", "复制失败", "error");
                    }
                  }}
                >
                  📋 批量复制 ({selectedFiles.length})
                </ActionButton>
              )}
              <ActionButton onClick={openNewFolderModal}>+ 新建文件夹</ActionButton>
              <ActionButton onClick={() => fileInputRef.current?.click()}>+ 上传文件</ActionButton>
              <ActionButton 
                onClick={(e) => handlePasteFile(e)} 
                disabled={!copiedFilePath}
                $color="#16a34a"
              >
                📋 粘贴{copiedFilePath ? ' (已复制文件)' : ''}
              </ActionButton>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileUpload} 
              />
            </FileToolbar>
            <FileList>
              {loadingFiles ? <div style={{padding: '1rem'}}>加载中...</div> : (
                files.map((file) => {
                  const isSelected = selectedFiles.includes(file.name);
                  return (
                    <FileItem 
                      key={file.name} 
                      $selected={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (file.isDirectory) {
                          setCurrentPath(currentPath === '/' ? file.name : `${currentPath}/${file.name}`);
                          setSelectedFiles([]);
                        } else {
                          setSelectedFiles(prev => {
                            if (prev.includes(file.name)) {
                              return prev.filter(f => f !== file.name);
                            } else {
                              return [...prev, file.name];
                            }
                          });
                        }
                      }}
                      onDoubleClick={() => {
                        if (!file.isDirectory) {
                          handleEditFile(file.name);
                        }
                      }}
                    >
                      <FileIcon>{file.isDirectory ? '📁' : '📄'}</FileIcon>
                      <FileName>{file.name}</FileName>
                      <FileSize>{formatSize(file.size)}</FileSize>
                      <FileDate>{new Date(file.updatedAt).toLocaleString()}</FileDate>
                      {!isSelected && (
                        <>
                          {!file.isDirectory && (
                            <>
                              <ActionButton 
                                style={{ marginLeft: '0.5rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditFile(file.name);
                                }}
                                title="编辑文件"
                              >
                                <svg viewBox="0 0 24 24"><path d="M4 21v-2a4 4 0 0 1 4-4h12" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L7 20.5 3 21l.5-4L18.5 2.5z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                              </ActionButton>
                              <ActionButton 
                                style={{ marginLeft: '0.5rem' }}
                                $color="#16a34a"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(e, file.name);
                                }}
                                title="下载文件"
                              >
                                <svg viewBox="0 0 24 24"><path d="M12 5v14m0 0l-7-7m7 7l7-7" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                              </ActionButton>
                              <ActionButton 
                                style={{ marginLeft: '0.5rem' }}
                                $color="#7c3aed"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyFile(e, file.name);
                                }}
                                title="复制文件"
                              >
                                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                              </ActionButton>
                            </>
                          )}
                          <ActionButton 
                            style={{ marginLeft: '0.5rem' }}
                            $color="#dc2626"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(e, file.name);
                            }}
                            title="删除文件"
                          >
                            <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M8 10v6M12 10v6M16 10v6" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M5 6V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                          </ActionButton>
                        </>
                      )}
                    </FileItem>
                  );
                })
              )}
              {files.length === 0 && !loadingFiles && <div style={{padding: '1rem', color: '#666'}}>暂无文件</div>}
            </FileList>
          </FileBrowserContainer>
        )}

        {activeTab === 'config' && containerId && (
          <ServerConfigTab containerId={containerId} />
        )}
      </ContentArea>

      {showNewFolderModal && (
        <ModalOverlay onClick={() => setShowNewFolderModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>新建文件夹</ModalTitle>
            <ModalInput 
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="文件夹名称"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            />
            <ModalButtonGroup>
              <ActionButton onClick={() => setShowNewFolderModal(false)}>取消</ActionButton>
              <ActionButton $color="var(--accent-color)" onClick={handleCreateFolder}>确定</ActionButton>
            </ModalButtonGroup>
          </ModalContent>
        </ModalOverlay>
      )}

      {isEditorOpen && containerId && (
        <FileEditorModal
          containerId={containerId}
          filePath={editingFilePath}
          fileName={editingFileName}
          onClose={() => setIsEditorOpen(false)}
          onSaved={() => {
            fetchFiles();
          }}
        />
      )}
    </Container>
  );
};
