import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { User } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { IsolationMode, ISOLATION_MODES } from '../isolation';

const Container = styled.div`
  padding: 2rem;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
`;

const Section = styled.div`
  background: var(--panel-bg);
  padding: 2rem;
  border-radius: 16px;
  margin-bottom: 2rem;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
`;

const SectionTitle = styled.h3`
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: var(--text-color);
  font-size: 1.2rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  color: #475569;
  font-weight: 600;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.8rem;
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 1rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
  max-width: 400px;

  &:focus {
    border-color: var(--accent-color);
    outline: none;
    background-color: white;
  }
`;

const Button = styled.button`
  padding: 0.8rem 1.5rem;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--accent-hover);
  }

  &:disabled {
    background-color: #cbd5e1;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.8rem;
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 1rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
  max-width: 400px;

  &:focus {
    border-color: var(--accent-color);
    outline: none;
    background-color: white;
  }
`;

interface SettingsTabProps {
  user: User;
  onLogout: () => void;
  onUpdateUsername: (newUsername: string) => void;
  gamePath: string;
  setGamePath: (path: string) => void;
  javaPath: string;
  setJavaPath: (path: string) => void;
  showAlert: (msg: string) => void;
}

const LogoutButton = styled.button`
  width: 100%;
  margin-top: 2rem;
  background: transparent;
  border: 1px solid var(--error-color);
  color: var(--error-color);
  padding: 0.8rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
  }
`;

export const SettingsTab: React.FC<SettingsTabProps> = ({ user, onLogout, onUpdateUsername, gamePath, setGamePath, javaPath, setJavaPath, showAlert }) => {
  const [username, setUsername] = useState(user.username);
  const [isolationMode, setIsolationMode] = useState<IsolationMode>(IsolationMode.MODDED);

  useEffect(() => {
    invoke<{ isolation_mode: IsolationMode }>('get_app_config')
      .then(config => setIsolationMode(config.isolation_mode))
      .catch(console.error);
  }, []);

  const handleSetIsolationMode = async (mode: IsolationMode) => {
    setIsolationMode(mode);
    try {
      await invoke('set_isolation_mode', { mode });
    } catch (e) {
      console.error(e);
      showAlert('保存隔离设置失败');
    }
  };

  const handleSavePath = () => {
    // Path is already saved via App.tsx useEffect, but we can add validation or alert here
    showAlert('设置已保存');
  };

  const handleSaveUsername = () => {
    if (username.trim()) {
      onUpdateUsername(username);
      showAlert('用户名已更新');
    }
  };

  return (
    <Container>
      <Section>
        <SectionTitle>游戏设置</SectionTitle>
        <FormGroup>
          <Label>游戏安装路径</Label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input 
              type="text" 
              value={gamePath} 
              onChange={(e) => setGamePath(e.target.value)}
              placeholder="留空则使用默认路径"
            />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
            默认路径: %APPDATA%/.minecraft (Windows)
          </div>
        </FormGroup>

        <FormGroup>
          <Label>Java 路径 (javaw.exe)</Label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input 
              type="text" 
              value={javaPath} 
              onChange={(e) => setJavaPath(e.target.value)}
              placeholder="留空则使用系统默认 Java"
            />
          </div>
        </FormGroup>

        <FormGroup>
          <Label>版本隔离策略</Label>
          <Select 
            value={isolationMode} 
            onChange={(e) => handleSetIsolationMode(e.target.value as IsolationMode)}
          >
            {ISOLATION_MODES.map(mode => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </Select>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
            版本隔离会将 Mods、Config 等文件存放在 versions/版本号/ 目录下，避免不同版本冲突。
          </div>
        </FormGroup>
        
        <Button onClick={handleSavePath}>保存设置</Button>
      </Section>

      <Section>
        <SectionTitle>账户信息</SectionTitle>
        <FormGroup>
          <Label>当前用户</Label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
            />
            <Button onClick={handleSaveUsername}>保存</Button>
          </div>
        </FormGroup>
        <LogoutButton onClick={onLogout}>退出登录</LogoutButton>
      </Section>
    </Container>
  );
};
