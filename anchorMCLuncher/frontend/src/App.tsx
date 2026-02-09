import { useState, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import styled from "styled-components";
import { User, Server, DockerServer, ServerStatus } from "./types";
import { SettingsModal } from "./components/SettingsModal";
import { MessageModal } from "./components/MessageModal";
import { LoginCard } from "./components/LoginCard";
import { HomeTab } from "./components/HomeTab";
import { SettingsTab } from "./components/SettingsTab";
import { DownloadTab, DownloadProgress } from "./components/DownloadTab";
import { DownloadWindow } from "./components/DownloadWindow";
import { SkinEditor } from "./components/SkinEditor";
import { ServerDeployWindow } from "./components/ServerDeployWindow";
import { ServerConsoleWindow } from "./components/ServerConsoleWindow";
import { GlobalStyles } from "./styles/GlobalStyles";
import * as api from "./api";
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';


// Styled Components
const TitleBarContainer = styled.div`
  height: 40px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  border-bottom: 1px solid var(--border-color);
  border-radius: 12px 12px 0 0;
`;

const TabContainer = styled.div`
  display: flex;
  height: 100%;
  margin-left: 20px;
  gap: 5px;
`;

const TabButton = styled.div<{ $active?: boolean }>`
  padding: 0 20px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: ${props => props.$active ? '600' : '400'};
  color: ${props => props.$active ? 'var(--accent-color)' : '#64748b'};
  position: relative;
  transition: all 0.2s;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background-color: var(--accent-color);
    transform: scaleX(${props => props.$active ? 1 : 0});
    transition: transform 0.2s ease;
    border-radius: 3px 3px 0 0;
  }

  &:hover {
    color: var(--accent-color);
    background: rgba(255, 255, 255, 0.3);
  }
`;

const TitleBarTitle = styled.div`
  margin-left: 20px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
`;

const TitleBarControls = styled.div`
  display: flex;
  height: 100%;
`;

const TitleBarButton = styled.div<{ $isClose?: boolean }>`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 46px;
  height: 100%;
  cursor: default;
  color: #64748b;
  transition: background-color 0.2s;
  border-top-right-radius: ${props => props.$isClose ? '12px' : '0'};

  &:hover {
    background-color: ${props => props.$isClose ? '#ef4444' : 'rgba(0, 0, 0, 0.05)'};
    color: ${props => props.$isClose ? 'white' : 'inherit'};
  }
`;

const MainContent = styled.div`
  height: 100vh;
  width: 100vw;
  padding-top: 40px;
  box-sizing: border-box;
  background-color: var(--bg-color);
  border-radius: 12px;
  overflow: hidden;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  padding-top: 40px;
  box-sizing: border-box;
`;

const LoginContainer = styled(Container)`
  justify-content: center;
  align-items: center;
  background: transparent;
`;



const SettingsIcon = styled.div`
  position: absolute;
  top: 40px;
  right: 20px;
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  z-index: 10;
  color: #64748b;

  &:hover {
    opacity: 1;
    color: var(--accent-color);
  }
`;

const StatusArea = styled.div`
  margin-top: 1rem;
  color: var(--accent-color);
  min-height: 24px;
  text-align: center;
`;

const MainTitle = styled.h1`
  color: var(--text-color);
  margin-bottom: 1.0rem;
`;

const SubTitle = styled.h2`
  color: #64748b;
  margin-top: 0;
  margin-bottom: 2rem;
`;

function TitleBar({ activeTab, onTabChange, showTabs }: { activeTab: string, onTabChange: (tab: string) => void, showTabs: boolean }) {
  const appWindow = new Window("main");

  return (
    <TitleBarContainer data-tauri-drag-region>
      <TitleBarTitle data-tauri-drag-region>AnchorMC Launcher</TitleBarTitle>
      {showTabs && (
        <TabContainer>
          <TabButton $active={activeTab === 'home'} onClick={() => onTabChange('home')}>主页</TabButton>
          <TabButton $active={activeTab === 'download'} onClick={() => onTabChange('download')}>下载</TabButton>
          <TabButton $active={activeTab === 'settings'} onClick={() => onTabChange('settings')}>设置</TabButton>
        </TabContainer>
      )}
      <TitleBarControls>
        <TitleBarButton onClick={() => appWindow.minimize()}>
          <svg width="10" height="1" viewBox="0 0 10 1"><path d="M0 0h10v1H0z" fill="currentColor"/></svg>
        </TitleBarButton>
        <TitleBarButton onClick={() => appWindow.toggleMaximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1h8v8H1z" fill="none" stroke="currentColor"/></svg>
        </TitleBarButton>
        <TitleBarButton $isClose onClick={() => appWindow.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.5"/></svg>
        </TitleBarButton>
      </TitleBarControls>
    </TitleBarContainer>
  );
}

function App() {
  const [isDownloadWindow, setIsDownloadWindow] = useState(() => window.location.search.includes('window=download'));
  const [isSkinEditorWindow, setIsSkinEditorWindow] = useState(() => window.location.search.includes('window=skin-editor'));
  const [isServerDeployWindow, setIsServerDeployWindow] = useState(() => window.location.search.includes('window=server-deploy'));
  const [isServerConsoleWindow, setIsServerConsoleWindow] = useState(() => window.location.search.includes('window=server-console'));

  useEffect(() => {
    if (window.location.search.includes('window=download')) {
      setIsDownloadWindow(true);
    }
    if (window.location.search.includes('window=skin-editor')) {
      setIsSkinEditorWindow(true);
    }
    if (window.location.search.includes('window=server-deploy')) {
      setIsServerDeployWindow(true);
    }
    if (window.location.search.includes('window=server-console')) {
      setIsServerConsoleWindow(true);
    }
  }, []);

  if (isDownloadWindow) {
    return (
      <>
        <GlobalStyles />
        <DownloadWindow />
      </>
    );
  }

  if (isSkinEditorWindow) {
    return (
      <>
        <GlobalStyles />
        <SkinEditor />
      </>
    );
  }

  if (isServerDeployWindow) {
    return (
      <>
        <GlobalStyles />
        <ServerDeployWindow />
      </>
    );
  }

  if (isServerConsoleWindow) {
    return (
      <>
        <GlobalStyles />
        <ServerConsoleWindow />
      </>
    );
  }

  const [authServer, setAuthServer] = useState(localStorage.getItem("authServer") || "http://localhost:3000");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [activeTab, setActiveTab] = useState('home');
  const [installing, setInstalling] = useState<string | null>(null);
  const [customDownloadName, setCustomDownloadName] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [gamePath, setGamePath] = useState<string>(localStorage.getItem('gamePath') || '');
  const [javaPath, setJavaPath] = useState<string>(localStorage.getItem('javaPath') || '');
  const [alertMsg, setAlertMsg] = useState("");
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const showAlert = (msg: string) => {
    setAlertMsg(msg);
    setIsAlertOpen(true);
  };

  useEffect(() => {
    const handleAuthError = () => {
      handleLogout();
      showAlert("登录已过期，请重新登录");
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => {
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('gamePath', gamePath);
  }, [gamePath]);

  useEffect(() => {
    localStorage.setItem('javaPath', javaPath);
  }, [javaPath]);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      setDownloadProgress(event.payload);
    });

    const unlistenDeploy = listen('server-deployed', () => {
      console.log("Server deployed, refreshing list...");
      fetchServers();
      // Broadcast to HomeTab to refresh docker servers
      window.dispatchEvent(new Event('refresh-docker-servers'));
    });

    return () => {
      unlisten.then(f => f());
      unlistenDeploy.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchServers();
    }
  }, [user]);

  async function fetchServers() {
    try {
      const backendServers = await api.getServers();
      if (!Array.isArray(backendServers)) {
        console.error("Backend returned non-array for servers:", backendServers);
        return false;
      }
      // Map backend servers to frontend Server type
      const mappedServers: Server[] = backendServers.map(s => ({
        ...s,
        motd: 'Pinging...',
        players: '-/-', 
        ping: undefined
      }));
      setServers(mappedServers);

      // Ping servers
      mappedServers.forEach(server => pingServer(server));
    } catch (error: any) {
      console.error("Failed to fetch servers:", error);
      if (error.response && error.response.status === 401) {
        handleLogout();
      }
    }
  }

  async function pingServer(server: Server) {
    try {
      const status = await invoke<ServerStatus>('ping_server', { host: server.ip_address, port: server.port });
      setServers(prev => prev.map(s => {
        if (s.id === server.id) {
          const description = status.description;
          // Remove color codes if present (simple regex)
          const cleanDescription = description.replace(/§[0-9a-fk-or]/g, '');
          return {
            ...s,
            motd: cleanDescription,
            players: `${status.players.online}/${status.players.max}`,
            ping: status.latency,
            favicon: status.favicon
          };
        }
        return s;
      }));
    } catch (e) {
      console.error(`Failed to ping ${server.name}:`, e);
      setServers(prev => prev.map(s => {
        if (s.id === server.id) {
          return { ...s, ping: undefined, motd: "Offline" };
        }
        return s;
      }));
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setStatus("");
    setActiveTab('home');
  }

  function handleUpdateUsername(newUsername: string) {
    if (user) {
      const updatedUser = { ...user, username: newUsername };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  }

  async function handleDeployClient(server: Server | DockerServer): Promise<void> {
    // Check if it has container_id (DockerServer) or if we can derive it
    let containerId = (server as any).container_id;
    
    if (!containerId) {
        // Try to find container_id from server list if it's a Server object
        // But wait, we updated fetchServers to include container_id in Server object via BackendServer type
        // So if it's missing here, it's really missing.
        
        showAlert("该服务器不支持自动部署客户端 (Missing Container ID)");
        return;
    }

    try {
       const serverId = ('id' in server && typeof server.id === 'number') ? server.id : '';
       const url = `/index.html?window=download&versionId=${encodeURIComponent(server.name)}&containerId=${containerId}&serverId=${serverId}`;
       
       // Open new window for download
       new WebviewWindow('download-' + Date.now(), {
         url: url,
         title: '下载客户端',
         width: 600,
         height: 400,
         resizable: false,
         decorations: false,
         center: true
       } as any);
       
    } catch (e) {
        console.error(e);
        showAlert("启动部署窗口失败: " + e);
    }
  }

  async function handleLaunch(server?: Server): Promise<boolean> {
    let versionToLaunch = selectedVersion;

    if (server) {
        try {
            const foundVersion = await invoke<string | null>('find_client_for_server', { 
                serverId: server.id, 
                serverName: server.name,
                gamePath: gamePath || null 
            });
            
            if (foundVersion) {
                versionToLaunch = foundVersion;
                // Optional: Notify user that we switched version
                // showAlert(`Found dedicated client: ${versionToLaunch}`);
            } else {
                // Not found, try to deploy
                let containerId = (server as any).container_id;
                let canDeploy = false;

                if (containerId) {
                    // Check if server actually has client config
                    canDeploy = await api.checkClientConfigStatus(containerId);
                }

                if (canDeploy) {
                    // Server supports deployment. Directly deploy.
                    handleDeployClient(server);
                    return false; // Deployment window will handle launch after download
                } else {
                    // Server does not support deployment
                    const shouldJoin = await ask(`未找到该服务器的专用客户端，且该服务器不支持自动部署。\n是否使用当前选择的版本 (${selectedVersion || '未选择'}) 加入？`, {
                        title: '加入服务器',
                        kind: 'warning'
                    });
                    if (!shouldJoin) {
                        return false;
                    }
                }
            }
        } catch (e) {
            console.error("Error finding client for server:", e);
        }
    }

    if (!versionToLaunch) {
      showAlert("请先选择一个版本");
      return false;
    }
    
    try {
      // Read version config
      const savedConfig = localStorage.getItem(`version_config_${versionToLaunch}`);
      let config = {
        minMemory: 1024,
        maxMemory: 4096,
        width: 854,
        height: 480,
        jvmArgs: '',
        enableIsolation: false // Legacy, will be overridden
      };
      
      if (savedConfig) {
        config = JSON.parse(savedConfig);
      }

      // Determine isolation based on global setting
      // We need version details to know if it's modded or snapshot
      // For now, we can fetch details or assume defaults.
      // Parse jvmArgs string to array
      const jvmArgsArray = config.jvmArgs ? config.jvmArgs.split(' ').filter((arg: string) => arg.trim().length > 0) : [];

      const token = localStorage.getItem('token') || "";
      const account = user ? {
          username: user.username,
          uuid: user.uuid || "00000000-0000-0000-0000-000000000000",
          access_token: token,
          user_type: "mojang"
      } : null;

      await invoke('launch_game', { 
        versionId: versionToLaunch, 
        gamePath: gamePath || null,
        javaPath: javaPath || null,
        account: account,
        authServer: authServer || null,
        minMemory: config.minMemory,
        maxMemory: config.maxMemory,
        width: config.width,
        height: config.height,
        jvmArgs: jvmArgsArray,
        enableIsolation: null, // Backend handles this now
        serverIp: server?.ip_address || null,
        serverPort: server?.port || null
      });
      return true;
    } catch (error) {
      console.error("Launch failed:", error);
      showAlert(`启动失败: ${error}`);
      return false;
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Logging in...");
    setIsLoading(true);
    setUser(null);

    try {
      console.log("Attempting login to:", authServer);
      const response = await api.login(username, password);
      
      setStatus("Login Successful!");
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      console.log("Auth Response:", response);
    } catch (error: any) {
      setStatus(`Login Failed: ${error.response?.data?.message || error.message}`);
      console.error("Login Error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCAFLogin() {
    setStatus("正在获取 CAF 登录链接...");
    setIsLoading(true);
    try {
      const { url, state } = await api.getCAFLoginUrl();
      console.log("Opening CAF Login URL:", url);
      await openUrl(url);
      
      setStatus("请在浏览器中完成登录...");
      
      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const result = await api.checkCAFStatus(state);
          if (result.status === 'success' && result.token && result.user) {
            clearInterval(pollInterval);
            setStatus("CAF 登录成功!");
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            setUser(result.user);
            setIsLoading(false);
          } else if (result.status === 'timeout' || result.status === 'failed') {
             clearInterval(pollInterval);
             setStatus("CAF 登录失败或超时");
             setIsLoading(false);
          }
          // 'pending' - continue polling
        } catch (err) {
          console.error("Polling error", err);
        }
      }, 2000);

      // Safety timeout to stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        // Check if we are still loading (meaning not logged in yet)
        // We can't easily check the interval status, but we can check isLoading state if we use a ref, 
        // but here we are in a closure. 
        // However, if the user logged in, isLoading would be false.
        // But the closure captures the initial state? No, setTimeout callback runs later.
        // But we can't access the current state value inside the closure reliably without refs.
        // But we can just clear the interval.
      }, 300000);

    } catch (error: any) {
      setStatus(`CAF 登录失败: ${error.message}`);
      setIsLoading(false);
    }
  }

  async function handleRegister() {
    try {
      // Use backend register API
      await api.register(username, password);
      setStatus("Registration Successful! Please login.");
    } catch (error: any) {
      setStatus(`Registration Failed: ${error.response?.data?.message || error.message}`);
    }
  }

  if (user) {
    return (
      <>
        <GlobalStyles />
        <TitleBar activeTab={activeTab} onTabChange={setActiveTab} showTabs={true} />
        <MessageModal 
          isOpen={isAlertOpen} 
          message={alertMsg} 
          onClose={() => setIsAlertOpen(false)} 
          zIndex={4000}
        />
        <MainContent>
          {activeTab === 'home' && (
            <HomeTab 
              user={user} 
              servers={servers} 
              onLaunch={() => handleLaunch()} 
              onJoinServer={async (server) => { await handleLaunch(server); }}
              onDeployClient={handleDeployClient}
              onLogout={handleLogout} 
              selectedVersion={selectedVersion}
              setSelectedVersion={setSelectedVersion}
              gamePath={gamePath}
              showAlert={showAlert}
              setActiveTab={setActiveTab}
              setDownloadProgress={setDownloadProgress}
              setCustomDownloadName={setCustomDownloadName}
              setInstalling={setInstalling}
            />
          )}
          {activeTab === 'download' && (
            <DownloadTab 
              installing={installing}
              setInstalling={setInstalling}
              progress={downloadProgress}
              setProgress={setDownloadProgress}
              showAlert={showAlert}
              customDownloadName={customDownloadName}
              currentVersion={selectedVersion}
              gamePath={gamePath}
              javaPath={javaPath}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab 
              user={user} 
              onLogout={handleLogout} 
              onUpdateUsername={handleUpdateUsername}
              gamePath={gamePath}
              setGamePath={setGamePath}
              javaPath={javaPath}
              setJavaPath={setJavaPath}
              showAlert={showAlert}
            />
          )}
        </MainContent>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <TitleBar activeTab={activeTab} onTabChange={setActiveTab} showTabs={false} />
      <MessageModal 
        isOpen={isAlertOpen} 
        message={alertMsg} 
        onClose={() => setIsAlertOpen(false)} 
        zIndex={4000}
      />
      <LoginContainer>
        <SettingsIcon onClick={() => setShowSettings(true)}>
          ⚙️
        </SettingsIcon>

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        authServer={authServer} 
        setAuthServer={(url) => {
          localStorage.setItem("authServer", url);
          setAuthServer(url);
        }} 
      />

      <MainTitle>西浦MC大厅</MainTitle>
      <SubTitle>AnchorMC 账号登录</SubTitle>

      <LoginCard
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        isLoading={isLoading}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onCAFLogin={handleCAFLogin}
      />

      <StatusArea>
        {status && <p>{status}</p>}
      </StatusArea>
    </LoginContainer>
    </>
  );
}

export default App;
