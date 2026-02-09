import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { DockerServer, ServerStatus } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { PlayIcon, StopIcon, CommandLineIcon, ArrowDownTrayIcon } from '@heroicons/react/24/solid';

interface DockerServerCardProps {
  server: DockerServer;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onConsole: (id: string) => void;
  onDeployClient: (server: any) => void;
}

const Card = styled.div`
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.2s;
  
  &:hover {
    border-color: var(--accent-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
`;

const MainInfo = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 120px;
  justify-content: center;
`;

const Name = styled.div`
  font-weight: bold;
  font-size: 0.95rem;
  color: var(--text-color);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusBadge = styled.span<{ $status: string }>`
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: ${props => props.$status === 'running' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)'};
  color: ${props => props.$status === 'running' ? '#22c55e' : '#64748b'};
  border: 1px solid ${props => props.$status === 'running' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)'};
  width: fit-content;
`;

const DetailInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 0.85rem;
  justify-content: center;
`;

const Motd = styled.div`
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
`;

const PlayerCount = styled.div`
  color: #64748b;
  font-size: 0.8rem;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' | 'secondary' }>`
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid;
  border-radius: 6px;
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

export const DockerServerCard: React.FC<DockerServerCardProps> = ({ server, onStart, onStop, onConsole, onDeployClient }) => {
  const isRunning = server.status === 'running';
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    let interval: any;
    
    const fetchStatus = async () => {
        if (!isRunning) {
            setStatus(null);
            return;
        }
        try {
            const authServerUrl = localStorage.getItem("authServer") || "http://localhost:3000";
            const url = new URL(authServerUrl);
            const host = url.hostname;
            const res = await invoke<ServerStatus>('ping_server', { host, port: server.port });
            setStatus(res);
        } catch (e) {
            console.error(e);
            setStatus(null);
        }
    };

    fetchStatus();
    if (isRunning) {
        interval = setInterval(fetchStatus, 5000);
    }

    return () => clearInterval(interval);
  }, [isRunning, server.port]);

  return (
    <Card>
      <MainInfo>
        <Name>{server.name}</Name>
        <StatusBadge $status={server.status}>
          {server.status === 'running' ? '运行中' : '已停止'}
        </StatusBadge>
      </MainInfo>
      
      <DetailInfo>
        {status ? (
            <>
                <Motd title={status.description.replace(/§[0-9a-fk-or]/g, '')}>
                    {status.description.replace(/§[0-9a-fk-or]/g, '')}
                </Motd>
                <PlayerCount>
                    在线: {status.players.online}/{status.players.max}
                </PlayerCount>
            </>
        ) : (
            <Motd>{server.version}</Motd>
        )}
      </DetailInfo>

      <Actions>
        {isRunning ? (
          <>
            <ActionButton onClick={() => onDeployClient(server)} title="部署客户端" $variant="primary">
              <ArrowDownTrayIcon />
            </ActionButton>
            <ActionButton onClick={() => onConsole(server.container_id)} title="控制台" $variant="secondary">
              <CommandLineIcon />
            </ActionButton>
            <ActionButton onClick={() => onStop(server.container_id)} title="停止" $variant="danger">
              <StopIcon />
            </ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => onStart(server.container_id)} title="启动" $variant="primary">
            <PlayIcon />
          </ActionButton>
        )}
      </Actions>
    </Card>
  );
};
