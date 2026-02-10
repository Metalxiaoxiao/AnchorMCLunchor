import React, { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Server, DockerServer, ServerStatus } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { PlayIcon, StopIcon, CommandLineIcon, ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/solid';

interface ServerCardProps {
  server: Server | DockerServer;
  onDeployClient?: (server: Server | DockerServer) => void;
  onJoin?: (server: Server) => void;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onConsole?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const pixelFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

const PixelDecorationTopRight = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 60px;
  height: 60px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 0;

  div {
    position: absolute;
    background-color: var(--accent-color);
    opacity: 0.15;
  }

  /* Block 1 */
  div:nth-child(1) { top: 10px; right: 10px; width: 14px; height: 14px; }
  /* Block 2 */
  div:nth-child(2) { top: 4px; right: 28px; width: 8px; height: 8px; }
  /* Block 3 */
  div:nth-child(3) { top: 28px; right: 6px; width: 6px; height: 6px; }
`;

const PixelDecorationBottomLeft = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 40px;
  height: 40px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 0;

  div {
    position: absolute;
    background-color: var(--accent-color);
    opacity: 0.1;
  }

  /* Block 1 */
  div:nth-child(1) { bottom: 8px; left: 8px; width: 10px; height: 10px; }
  /* Block 2 */
  div:nth-child(2) { bottom: 22px; left: 4px; width: 6px; height: 6px; }
`;

const CardContainer = styled.div`
  position: relative;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;

  /* Custom Scrollbar for server list */
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

  &:hover {
    border-color: var(--accent-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

    ${PixelDecorationTopRight}, ${PixelDecorationBottomLeft} {
      opacity: 1;
    }

    ${PixelDecorationTopRight} div:nth-child(1) { animation: ${pixelFloat} 3s ease-in-out infinite; }
    ${PixelDecorationTopRight} div:nth-child(2) { animation: ${pixelFloat} 4s ease-in-out infinite reverse; }
    ${PixelDecorationTopRight} div:nth-child(3) { animation: ${pixelFloat} 2.5s ease-in-out infinite 0.5s; }
    
    ${PixelDecorationBottomLeft} div:nth-child(1) { animation: ${pixelFloat} 3.5s ease-in-out infinite 0.2s; }
    ${PixelDecorationBottomLeft} div:nth-child(2) { animation: ${pixelFloat} 4.5s ease-in-out infinite reverse; }
  }
`;

const IconWrapper = styled.div`
  position: relative;
  width: 56px;
  height: 56px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  z-index: 1;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }
  
  svg {
    width: 32px;
    height: 32px;
    color: var(--text-color);
    opacity: 0.5;
  }
`;

const Info = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  position: relative;
  z-index: 1;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const Name = styled.div`
  font-weight: bold;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color);
`;

const StatusBadge = styled.span<{ $status: string }>`
  font-size: 0.65rem;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: ${props => props.$status === 'running' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)'};
  color: ${props => props.$status === 'running' ? '#22c55e' : '#64748b'};
  border: 1px solid ${props => props.$status === 'running' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)'};
  white-space: nowrap;
`;

const DetailRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #64748b;
  min-height: 1.2em;
  flex-wrap: wrap;
`;

const DetailText = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.4;
  cursor: pointer;
  position: relative;
`;

const MotdTooltip = styled.div<{ $visible: boolean; $x: number; $y: number }>`
  display: ${props => (props.$visible ? 'block' : 'none')};
  position: fixed;
  left: ${props => props.$x}px;
  top: ${props => props.$y}px;
  background: rgba(255,255,255,0.98);
  color: #222;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 0.8rem 1.2rem;
  z-index: 9999;
  min-width: 220px;
  max-width: 400px;
  max-height: 300px;
  overflow: auto;
  font-size: 0.98rem;
  pointer-events: none;
`;

const PlayerChip = styled.div`
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.75rem;
  color: #64748b;
  white-space: nowrap;
`;

const LatencyText = styled.span<{ $latency?: number }>`
  font-size: 0.75rem;
  color: ${props => {
    if (props.$latency === undefined) return '#94a3b8';
    if (props.$latency < 100) return '#22c55e';
    if (props.$latency < 200) return '#eab308';
    return '#ef4444';
  }};
  font-weight: 500;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.4rem;
  align-items: center;
  position: relative;
  z-index: 1;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' | 'secondary' }>`
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
  
  border-color: ${props => {
    if (props.$variant === 'primary') return 'var(--accent-color)';
    if (props.$variant === 'danger') return '#ef4444';
    return 'var(--border-color)';
  }};
  
  color: ${props => {
    if (props.$variant === 'primary') return 'var(--accent-color)';
    if (props.$variant === 'danger') return '#ef4444';
    return '#64748b';
  }};

  &:hover {
    background: ${props => {
      if (props.$variant === 'primary') return 'rgba(var(--accent-color-rgb), 0.1)';
      if (props.$variant === 'danger') return 'rgba(239, 68, 68, 0.1)';
      return 'rgba(0,0,0,0.05)';
    }};
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
`;

// “导入本地整合包”SVG图标
const ImportModpackIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);

function parseMinecraftColors(text: string) {
  if (!text) return null;
  
  const parts = text.split(/(§[0-9a-fk-or])/g);
  let currentColor = 'inherit';
  let currentDecorations: string[] = [];
  
  const colorMap: Record<string, string> = {
    '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
    '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
    '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
    'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
  };

  return parts.map((part, index) => {
    if (part.startsWith('§')) {
      const code = part[1];
      if (colorMap[code]) {
        currentColor = colorMap[code];
        currentDecorations = []; // Color codes reset formatting
      } else if (code === 'l') currentDecorations.push('bold');
      else if (code === 'm') currentDecorations.push('line-through');
      else if (code === 'n') currentDecorations.push('underline');
      else if (code === 'o') currentDecorations.push('italic');
      else if (code === 'r') {
        currentColor = 'inherit';
        currentDecorations = [];
      }
      return null;
    }
    
    if (!part) return null;

    return (
      <span key={index} style={{ 
        color: currentColor,
        fontWeight: currentDecorations.includes('bold') ? 'bold' : 'normal',
        textDecoration: [
          currentDecorations.includes('underline') ? 'underline' : '',
          currentDecorations.includes('line-through') ? 'line-through' : ''
        ].filter(Boolean).join(' '),
        fontStyle: currentDecorations.includes('italic') ? 'italic' : 'normal'
      }}>
        {part}
      </span>
    );
  });
}

function isDockerServer(server: Server | DockerServer): server is DockerServer {
  return (server as DockerServer).status !== undefined;
}

export const ServerCard: React.FC<ServerCardProps> = ({ 
  server, 
  onDeployClient, 
  onJoin, 
  onStart, 
  onStop, 
  onConsole,
  onDelete
}) => {
  const [dockerStatus, setDockerStatus] = useState<ServerStatus | null>(null);
  const isDocker = isDockerServer(server);
  const isRunning = isDocker ? server.status === 'running' : true; // Remote servers are assumed running or we don't control them

  useEffect(() => {
    if (!isDocker) return;

    let interval: any;
    
    const fetchStatus = async () => {
        if (server.status !== 'running') {
            setDockerStatus(null);
            return;
        }
        try {
            const authServerUrl = localStorage.getItem("authServer") || "http://localhost:3000";
            const url = new URL(authServerUrl);
            const host = url.hostname;
            const res = await invoke<ServerStatus>('ping_server', { host, port: server.port });
            setDockerStatus(res);
        } catch (e) {
            // console.error(e);
            setDockerStatus(null);
        }
    };

    fetchStatus();
    if (server.status === 'running') {
        interval = setInterval(fetchStatus, 5000);
    }

    return () => clearInterval(interval);
  }, [isDocker, isDocker ? server.status : null, server.port]);

  const renderIcon = () => {
    if (isDocker && dockerStatus?.favicon) {
      return <img src={dockerStatus.favicon} alt="server icon" />;
    }
    if (!isDocker && (server as Server).favicon) {
      return <img src={(server as Server).favicon} alt="server icon" />;
    }
    return <ImportModpackIcon />;
  };

  const handleJoin = () => {
    if (!onJoin) return;
    
    if (isDocker) {
        // Construct a temporary Server object for joining local docker server
        const s: Server = {
            id: -1, 
            name: server.name,
            ip_address: '127.0.0.1',
            port: server.port,
            description: dockerStatus?.description || '',
            motd: dockerStatus?.description || '',
            // Add other required fields if necessary, casting as any to bypass strict checks for temp object
        } as any;
        onJoin(s);
    } else {
        onJoin(server as Server);
    }
  };

  const renderDetails = () => {
    // const cleanText = (text?: string) => text?.replace(/§[0-9a-fk-or]/g, '') || '';

    const latencyValue = isDocker
      ? (dockerStatus ? dockerStatus.latency : undefined)
      : (server as Server).ping;
    const latencyLabel = latencyValue !== undefined ? `${latencyValue}ms` : '--';

    const playersText = isDocker
      ? dockerStatus
        ? `在线 ${dockerStatus.players.online}/${dockerStatus.players.max}`
        : '在线 --/--'
      : (server as Server).players || '在线 --/--';

    const rawMotd = isDocker
      ? dockerStatus
        ? dockerStatus.description
        : server.version
      : (server as Server).motd || (server as Server).ip_address;

    const [motdHover, setMotdHover] = React.useState(false);
    const [motdPos, setMotdPos] = React.useState({ x: 0, y: 0 });
    const motdRef = React.useRef<HTMLDivElement>(null);

    const handleMotdMouseEnter = (e: React.MouseEvent) => {
      setMotdHover(true);
    };
    const handleMotdMouseLeave = () => {
      setMotdHover(false);
    };
    const handleMotdMouseMove = (e: React.MouseEvent) => {
      setMotdPos({ x: e.clientX + 16, y: e.clientY + 8 });
    };

    return (
      <>
        <DetailRow>
          <PlayerChip>{playersText}</PlayerChip>
          <LatencyText $latency={latencyValue}>{latencyLabel}</LatencyText>
        </DetailRow>
        <DetailRow>
          <DetailText
            ref={motdRef}
            onMouseEnter={handleMotdMouseEnter}
            onMouseLeave={handleMotdMouseLeave}
            onMouseMove={handleMotdMouseMove}
            title=""
          >
            {parseMinecraftColors(rawMotd)}
          </DetailText>
          <MotdTooltip $visible={motdHover} $x={motdPos.x} $y={motdPos.y}>
            {parseMinecraftColors(rawMotd)}
          </MotdTooltip>
        </DetailRow>
      </>
    );
  };

  return (
    <CardContainer>
      <PixelDecorationTopRight>
        <div />
        <div />
        <div />
      </PixelDecorationTopRight>
      <PixelDecorationBottomLeft>
        <div />
        <div />
      </PixelDecorationBottomLeft>
      <IconWrapper>
        {renderIcon()}
      </IconWrapper>

      <Info>
        <NameRow>
          <Name>{server.name}</Name>
          {isDocker && (
            <StatusBadge $status={server.status}>
              {server.status === 'running' ? '运行中' : '已停止'}
            </StatusBadge>
          )}
        </NameRow>
        {renderDetails()}
      </Info>

      <Actions>
        {/* Deploy Client - Consistent for both */}
        {onDeployClient && (
            <ActionButton onClick={() => onDeployClient(server)} title="部署客户端" $variant="secondary">
            <ArrowDownTrayIcon />
            </ActionButton>
        )}

        {isDocker ? (
          // Docker Server Actions
          <>
            {onConsole && (
              <ActionButton onClick={() => onConsole(server.container_id)} title="控制台" $variant="secondary">
                <CommandLineIcon />
              </ActionButton>
            )}
            {server.status === 'running' ? (
              <>
                {onStop && (
                  <ActionButton onClick={() => onStop(server.container_id)} title="停止" $variant="danger">
                    <StopIcon />
                  </ActionButton>
                )}
                {onJoin && (
                    <ActionButton onClick={handleJoin} title="加入游戏" $variant="primary">
                        <PlayIcon />
                    </ActionButton>
                )}
              </>
            ) : (
              <>
                {onStart && (
                  <ActionButton onClick={() => onStart(server.container_id)} title="启动" $variant="primary">
                    <PlayIcon />
                  </ActionButton>
                )}
              </>
            )}
            {onDelete && (
              <ActionButton onClick={() => onDelete(server.container_id)} title="删除" $variant="danger">
                <TrashIcon />
              </ActionButton>
            )}
          </>
        ) : (
          // Remote Server Actions
          <>
            {onJoin && (
              <ActionButton onClick={handleJoin} title="加入游戏" $variant="primary">
                <PlayIcon />
              </ActionButton>
            )}
          </>
        )}
      </Actions>
    </CardContainer>
  );
};
