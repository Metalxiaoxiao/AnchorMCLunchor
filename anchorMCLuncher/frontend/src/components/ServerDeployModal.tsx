import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import * as api from '../api';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(5px);
`;

const ModalContainer = styled.div`
  background: var(--panel-bg);
  padding: 2rem;
  border-radius: 16px;
  width: 500px;
  max-width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
  color: var(--text-color);
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

interface ServerDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (config: { name: string; version: string; ram: string; useLocalVersion: boolean }) => void;
}

export const ServerDeployModal: React.FC<ServerDeployModalProps> = ({ isOpen, onClose, onDeploy }) => {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.20.4');
  const [ram, setRam] = useState('2G');
  const [loading, setLoading] = useState(false);
  const [localVersions, setLocalVersions] = useState<string[]>([]);
  const [useLocalVersion, setUseLocalVersion] = useState(false);

  useEffect(() => {
    if (isOpen) {
        invoke<string[]>('list_installed_versions', { gamePath: null })
          .then(setLocalVersions)
          .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!name) return alert("请输入服务器名称");
    onDeploy({ name, version, ram, useLocalVersion });
  };

  return (
    <Overlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <Title>部署新服务器</Title>
        <FormGroup>
          <Label>服务器名称</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Minecraft Server" />
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
          <Select value={ram} onChange={e => setRam(e.target.value)}>
            <option value="1G">1 GB</option>
            <option value="2G">2 GB</option>
            <option value="4G">4 GB</option>
            <option value="8G">8 GB</option>
          </Select>
        </FormGroup>
        <ButtonGroup>
          <Button onClick={onClose} disabled={loading}>取消</Button>
          <Button $primary onClick={handleSubmit} disabled={loading}>
            {loading ? '部署中...' : '确认部署'}
          </Button>
        </ButtonGroup>
      </ModalContainer>
    </Overlay>
  );
};
