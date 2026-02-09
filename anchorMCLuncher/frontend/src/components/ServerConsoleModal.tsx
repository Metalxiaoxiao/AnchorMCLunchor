import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { io, Socket } from 'socket.io-client';
import * as api from '../api';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(5px);
`;

const ConsoleContainer = styled.div`
  background: #1e1e1e;
  width: 90%;
  height: 90%;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
`;

const Header = styled.div`
  padding: 0 1rem;
  background: #2d2d2d;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #3e3e3e;
  height: 50px;
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
  padding: 0.5rem 1rem;
  background: ${props => props.$color || '#3e3e3e'};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;

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

interface ServerConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: any;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  updatedAt: string;
}

export const ServerConsoleModal: React.FC<ServerConsoleModalProps> = ({ isOpen, onClose, server }) => {
  const [activeTab, setActiveTab] = useState<'console' | 'files'>('console');
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState(server.status || 'unknown');
  
  // File Browser State
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Selected Files State for Batch Operations
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && server) {
      // Connect Socket.IO
      const socket = io('http://localhost:3000');
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Connected to console socket');
        socket.emit('attach-console', server.container_id);
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
  }, [isOpen, server]);

  useEffect(() => {
    if (activeTab === 'files' && isOpen) {
      fetchFiles();
    }
  }, [activeTab, currentPath, isOpen]);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const list = await api.listDockerFiles(server.container_id, currentPath);
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
    if (!command) return;
    try {
      await api.sendDockerCommand(server.container_id, command);
      setCommand('');
    } catch (error) {
      console.error("Failed to send command", error);
    }
  };

  const handleStart = async () => {
    try {
      await api.startDockerServer(server.container_id);
      setStatus('running');
    } catch (e) { alert("Start failed"); }
  };

  const handleStop = async () => {
    try {
      await api.stopDockerServer(server.container_id);
      setStatus('stopped');
    } catch (e) { alert("Stop failed"); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        // Note: Current API uploads to root. Need to update API to support path if needed.
        // For now, let's assume upload to current path is desired but API might need tweak.
        // Actually, my backend uploadFile implementation uses `server.volume_path` + `file.originalname`.
        // It doesn't support subdirectories yet.
        // Let's stick to root upload or update backend later.
        // Wait, I can't easily pass path in multipart/form-data with current simple implementation without changing backend more.
        // Let's just upload and refresh.
        await api.uploadDockerFile(server.container_id, e.target.files[0]);
        alert("Upload successful");
        fetchFiles();
      } catch (error) {
        alert("Upload failed");
      }
    }
  };

  const handleDeleteFile = async (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    if (!confirm(`确定要删除 ${fileName} 吗?`)) return;
    try {
      const fullPath = currentPath === '/' ? fileName : `${currentPath}/${fileName}`;
      await api.deleteDockerFile(server.container_id, fullPath);
      fetchFiles();
    } catch (error) {
      alert("Delete failed");
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("请输入文件夹名称:");
    if (!name) return;
    try {
      const fullPath = currentPath === '/' ? name : `${currentPath}/${name}`;
      await api.createDockerFolder(server.container_id, fullPath);
      fetchFiles();
    } catch (error) {
      alert("Create folder failed");
    }
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

  if (!isOpen) return null;

  return (
    <Overlay onClick={onClose}>
      <ConsoleContainer onClick={e => e.stopPropagation()}>
        <Header>
          <Title>{server.name} - 管理面板 ({status})</Title>
          <div style={{ display: 'flex', gap: '10px' }}>
            <ActionButton $color="#16a34a" onClick={handleStart}>启动</ActionButton>
            <ActionButton $color="#dc2626" onClick={handleStop}>停止</ActionButton>
            <ActionButton onClick={onClose}>关闭</ActionButton>
          </div>
        </Header>

        <TabBar>
          <Tab $active={activeTab === 'console'} onClick={() => setActiveTab('console')}>控制台</Tab>
          <Tab $active={activeTab === 'files'} onClick={() => setActiveTab('files')}>文件管理</Tab>
        </TabBar>
        
        <ContentArea>
          {activeTab === 'console' ? (
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
          ) : (
            <FileBrowserContainer>
              <FileToolbar>
                <ActionButton onClick={navigateUp} disabled={currentPath === '/'}>⬆ 上一级</ActionButton>
                <Breadcrumbs>当前路径: {currentPath}</Breadcrumbs>
                <ActionButton onClick={handleCreateFolder}>+ 新建文件夹</ActionButton>
                <ActionButton onClick={() => fileInputRef.current?.click()}>+ 上传文件</ActionButton>
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
                    >
                      <FileIcon>{file.isDirectory ? '📁' : '📄'}</FileIcon>
                      <FileName>{file.name}</FileName>
                      <FileSize>{formatSize(file.size)}</FileSize>
                      <FileDate>{new Date(file.updatedAt).toLocaleString()}</FileDate>
                      {!isSelected && (
                        <ActionButton 
                          style={{ marginLeft: '1rem', padding: '2px 8px', fontSize: '0.8rem' }}
                          $color="#dc2626"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(e, file.name);
                          }}
                        >
                          删除
                        </ActionButton>
                      )}
                    </FileItem>
                  );
                })
                )}
                {files.length === 0 && !loadingFiles && <div style={{padding: '1rem', color: '#666'}}>暂无文件</div>}
              </FileList>
            </FileBrowserContainer>
          )}
        </ContentArea>
      </ConsoleContainer>
    </Overlay>
  );
};
