import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import * as api from '../api';

const Container = styled.div`
  padding: 20px;
  height: 100vh;
  background-color: var(--bg-color);
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
  user-select: none;
  gap: 20px;
`;

const InfoSection = styled.div<{ $hasLogs: boolean }>`
  flex: ${props => props.$hasLogs ? '0 0 45%' : '1'};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
`;

const LogSection = styled.div`
  flex: 1;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const Title = styled.h3`
  margin-bottom: 20px;
  color: var(--text-color);
  text-align: center;
  max-width: 320px;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 10px;
  background-color: #e2e8f0;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 10px;
`;

const FileBlocks = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10px, 1fr));
  gap: 4px;
  margin-bottom: 10px;
`;

const FileBlock = styled.div<{ $percent: number }>`
  height: 10px;
  border-radius: 3px;
  background: ${props => `linear-gradient(90deg, var(--accent-color) 0% ${props.$percent}%, #e2e8f0 ${props.$percent}% 100%)`};
`;


const ProgressBarFill = styled.div<{ $percent: number }>`
  height: 100%;
  background-color: var(--accent-color);
  width: ${props => props.$percent}%;
  transition: width 0.3s ease;
`;

const StatusText = styled.div`
  font-size: 14px;
  color: #64748b;
  margin-bottom: 5px;
  text-align: center;
  width: 100%;
  max-width: 320px;
  min-width: 320px;
  height: 18px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
`;

const PercentText = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: var(--accent-color);
  margin-bottom: 20px;
`;

const LogContainer = styled.div`
  flex: 1;
  background-color: #1e293b;
  border-radius: 6px;
  padding: 10px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  color: #e2e8f0;
  box-sizing: border-box;
  user-select: text;
  word-break: break-all;
`;

const LogLine = styled.div<{ $level: string }>`
  color: ${props => props.$level === 'error' ? '#ef4444' : props.$level === 'success' ? '#22c55e' : '#e2e8f0'};
  margin-bottom: 2px;
  white-space: pre-wrap;
  word-break: break-all;
`;

interface DownloadProgress {
  task_id?: string;
  version_id: string;
  total_files: number;
  downloaded_files: number;
  current_file: string;
  percent: number;
  current_file_progress?: number | null;
  current_file_downloaded?: number | null;
  current_file_total?: number | null;
}

interface DownloadFileProgress {
  task_id?: string;
  filename: string;
  progress: number;
  status: string;
}

interface DownloadLog {
  task_id?: string;
  message: string;
  level: string;
}

export function DownloadWindow() {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [status, setStatus] = useState("准备中...");
  const [versionId, setVersionId] = useState("");
  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const isCompleteRef = useRef(false);
  const hasStartedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [fileBlocks, setFileBlocks] = useState<Record<string, DownloadFileProgress>>({});

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let unlistenLogFn: (() => void) | undefined;
    let unlistenCloseFn: (() => void) | undefined;
    let unlistenFileFn: (() => void) | undefined;

    const init = async () => {
      const currentLabel = getCurrentWindow().label;

      // Setup listener first
      unlistenFn = await listen<DownloadProgress>('download-progress', (event) => {
        if (event.payload.task_id && event.payload.task_id !== currentLabel) return;

        setProgress(event.payload);
        
        const { current_file, downloaded_files, total_files } = event.payload;
        if (current_file.startsWith("Scanning") || current_file.startsWith("Reading") || current_file.startsWith("Extracting") || current_file.startsWith("Resolving") || current_file === "Import Complete") {
             setStatus(`${current_file} (${downloaded_files}/${total_files})`);
        } else {
             setStatus(`正在下载: ${current_file} (${downloaded_files}/${total_files})`);
        }

        if (downloaded_files >= total_files && total_files > 0) {
          // setStatus("下载完成！");
        }
      });

      unlistenLogFn = await listen<DownloadLog>('download-log', (event) => {
        if (event.payload.task_id && event.payload.task_id !== currentLabel) return;

        setLogs(prev => {
          const newLogs = [...prev, event.payload];
          // Keep only the last 200 logs to prevent performance issues
          if (newLogs.length > 200) {
            return newLogs.slice(newLogs.length - 200);
          }
          return newLogs;
        });
      });

      unlistenFileFn = await listen<DownloadFileProgress>('download-file-progress', (event) => {
        if (event.payload.task_id && event.payload.task_id !== currentLabel) return;

        setFileBlocks(prev => {
          const next = { ...prev };
          const isActive = event.payload.status === 'downloading';
          if (isActive) {
            next[event.payload.filename] = event.payload;
          } else {
            delete next[event.payload.filename];
          }
          return next;
        });
      });

      // Handle close request
      const appWindow = getCurrentWindow();
      unlistenCloseFn = await appWindow.onCloseRequested(async (event) => {
        // Always prevent default close first to handle async logic
        event.preventDefault();
        
        if (isCompleteRef.current) {
          appWindow.destroy();
          return;
        }

        const yes = await ask('下载正在进行中，确定要终止吗？', {
          title: '终止下载',
          kind: 'warning'
        });
        
        if (yes) {
          await invoke('cancel_download', { taskId: currentLabel });
          appWindow.destroy();
        }
      });

      const params = new URLSearchParams(window.location.search);
      const vid = params.get('versionId');
      const loaderType = params.get('loaderType') || 'vanilla';
      const loaderVersion = params.get('loaderVersion') || null;
      const modpackPath = params.get('modpackPath');
      const containerId = params.get('containerId');
      const serverId = params.get('serverId');
      const javaPath = params.get('javaPath') || null;
      
      if (!hasStartedRef.current) {
        if (containerId && vid) {
          hasStartedRef.current = true;
          setVersionId(vid);
          startDeploy(containerId, vid, serverId);
        } else if (vid) {
          hasStartedRef.current = true;
          setVersionId(vid);
          startDownload(vid, loaderType, loaderVersion, javaPath);
        } else if (modpackPath) {
          hasStartedRef.current = true;
          setVersionId("Modpack");
          startImport(modpackPath);
        }
      }
    };

    init();

    return () => {
      if (unlistenFn) unlistenFn();
      if (unlistenLogFn) unlistenLogFn();
      if (unlistenFileFn) unlistenFileFn();
      if (unlistenCloseFn) unlistenCloseFn();
    };
  }, []);

  async function startDeploy(containerId: string, vid: string, serverId: string | null) {
    const currentLabel = getCurrentWindow().label;
    try {
      setStatus("正在获取部署清单...");
      
      // Check client config first
      const config = await api.getClientConfig(containerId);
      if (config && config.client_config_type === 'modpack') {
          // Modpack deployment
          setStatus("检测到整合包部署，正在获取整合包文件...");
          const manifest = await api.getClientManifest(containerId);
          
          // Find the modpack file (should be the one pointed by mainFile in config, or just find the zip/mrpack)
          // The manifest includes client_config.json and the modpack file.
          // We need to download the modpack file to a temp location and then import it.
          
          // Parse client_config.json from manifest? No, we have config from API.
          // But config from API is just type and value.
          // We need the filename.
          // Let's look at manifest.
          
          const modpackFile = manifest.find((f: any) => 
              (f.path.endsWith('.zip') || f.path.endsWith('.mrpack')) && f.path !== 'client_config.json'
          );
          
          if (!modpackFile) {
              throw new Error("未找到整合包文件");
          }
          
          const url = api.getClientFileUrl(containerId, modpackFile.path);
          setStatus(`正在下载整合包: ${modpackFile.path}...`);
          
          // Use import_modpack with URL
          const token = localStorage.getItem('token');
          await invoke('import_modpack', { 
              path: url, 
              token: token || null,
              enableIsolation: null,
              customName: vid,
              taskId: currentLabel
          });
          
          if (serverId) {
               // Try to set server ID if possible. 
               // But import_modpack might create a new version ID based on modpack name.
               // We don't know the version ID easily here unless import_modpack returns it.
               // For now, skip setting server ID or try to guess it.
          }

          setStatus("部署完成！");
          isCompleteRef.current = true;
          setTimeout(() => {
            getCurrentWindow().destroy();
          }, 1000);
          return;
      }

      const manifest = await api.getClientManifest(containerId);
      console.log("Manifest:", manifest);
      
      if (!manifest || manifest.length === 0) {
          setStatus("部署清单为空，请检查服务器端配置。");
          return;
      }

      const token = localStorage.getItem('token');
      const files = manifest.map((f: any) => ({
           url: api.getClientFileUrl(containerId, f.path),
           path: f.path,
           size: f.size,
           hash: f.hash,
           token: token || null
       }));

      setStatus(`正在下载 ${files.length} 个客户端文件...`);
      const gamePath = localStorage.getItem('gamePath');
      console.log("Game Path:", gamePath);
      
      await invoke('download_custom_files', {
           versionId: vid,
           files: files,
           gamePath: gamePath || null,
           taskId: currentLabel
       });

       if (serverId) {
           try {
               await invoke('set_client_server_id', {
                   versionId: vid,
                   serverId: parseInt(serverId),
                   gamePath: gamePath || null
               });
           } catch (e) {
               console.error("Failed to save server ID to client config:", e);
           }
       }

       // Verify version exists
       try {
           await invoke('get_version_details', {
               versionId: vid,
               gamePath: gamePath || null
           });
       } catch (e) {
           console.error("Version verification failed:", e);
           setStatus("错误: 未找到版本配置文件(json)。");
           await ask("部署文件已下载，但未找到版本配置(json)。\n\n请确保上传的客户端包包含完整的版本结构 (versions/" + vid + "/...)\n或者是一个支持的整合包。", {
               title: '版本配置缺失',
               kind: 'error'
           });
           getCurrentWindow().destroy();
           return;
       }

      setStatus("部署完成！正在启动游戏...");
      
      // Launch game automatically
      try {
          await invoke('launch_game', {
              versionId: vid,
              gamePath: gamePath || null,
              javaPath: localStorage.getItem('javaPath') || null,
              maxMemory: 4096, // Default or get from settings
              minMemory: 1024
          });
          
          // If launch is successful, we can close the window
          isCompleteRef.current = true;
          setTimeout(() => {
            getCurrentWindow().destroy();
          }, 1000);
          
      } catch (e) {
          console.error("Auto launch failed:", e);
          setStatus("部署完成，但自动启动失败: " + e);
          // Don't close immediately if launch fails so user can see error
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Still close eventually? Or let user close?
          // Let's let user close or close after delay
          isCompleteRef.current = true;
          setTimeout(() => {
            getCurrentWindow().destroy();
          }, 3000);
      }

    } catch (error) {
        setStatus("部署失败: " + error);
        console.error(error);
    }
  }

  async function startDownload(vid: string, loaderType: string, loaderVersion: string | null, javaPath: string | null) {
    const currentLabel = getCurrentWindow().label;
    try {
      setStatus("正在获取版本信息...");
      await invoke('install_version', { 
        versionId: vid, 
        loaderType,
        loaderVersion,
        gamePath: null,
        javaPath,
        taskId: currentLabel
      });
      setStatus("下载完成！");
      isCompleteRef.current = true;
      setTimeout(() => {
        getCurrentWindow().destroy();
      }, 1000);
    } catch (error) {
      if (typeof error === 'string' && error.includes("Download already in progress")) {
        setStatus("下载已在进行中，正在同步进度...");
        return;
      }
      setStatus(`下载失败: ${error}`);
      // await ask(`下载失败: ${error}`, { title: '错误', kind: 'error' });
      // getCurrentWindow().destroy();
    }
  }

  async function startImport(path: string) {
    const currentLabel = getCurrentWindow().label;
    try {
      const gamePath = localStorage.getItem('gamePath');
      setStatus("正在分析整合包...");
      await invoke('import_modpack', {
        path,
        token: null,
        enableIsolation: null,
        customName: null,
        taskId: currentLabel,
        gamePath: gamePath || null
      });
      setStatus("导入完成！");
      isCompleteRef.current = true;
      setTimeout(() => {
        getCurrentWindow().destroy();
      }, 1000);
    } catch (error) {
      setStatus(`导入失败: ${error}`);
      await ask(`导入失败: ${error}`, { title: '错误', kind: 'error' });
      getCurrentWindow().destroy();
    }
  }

  const hasLogs = logs.length > 0;

  return (
    <Container>
      <InfoSection $hasLogs={hasLogs}>
        <Title>正在安装 Minecraft {versionId}</Title>
        
        {progress && (
          <>
            <PercentText>{progress.percent.toFixed(1)}%</PercentText>
            <ProgressBarContainer>
              <ProgressBarFill $percent={progress.percent} />
            </ProgressBarContainer>
            {Object.keys(fileBlocks).length > 0 && (
              <FileBlocks>
                {Object.values(fileBlocks).map(file => (
                  <FileBlock key={file.filename} $percent={Math.max(0, Math.min(100, file.progress))} />
                ))}
              </FileBlocks>
            )}
            <StatusText>{status}</StatusText>
            <StatusText>{progress.downloaded_files} / {progress.total_files}</StatusText>
          </>
        )}
        
        {!progress && <StatusText>{status}</StatusText>}
      </InfoSection>

      {hasLogs && (
        <LogSection>
          <LogContainer>
            {logs.map((log, i) => (
              <LogLine key={i} $level={log.level}>{log.message}</LogLine>
            ))}
            <div ref={logEndRef} />
          </LogContainer>
        </LogSection>
      )}
    </Container>
  );
}
