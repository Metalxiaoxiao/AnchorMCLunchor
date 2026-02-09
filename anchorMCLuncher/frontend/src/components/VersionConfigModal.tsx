import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';

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
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  padding: 20px;
  border-radius: 8px;
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const Title = styled.h3`
  margin: 0;
  color: var(--text-color);
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const Label = styled.label`
  font-size: 14px;
  color: #64748b;
`;

const Select = styled.select`
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: white;
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  background: ${props => props.$primary ? 'var(--accent-color)' : '#e2e8f0'};
  color: ${props => props.$primary ? 'white' : '#64748b'};
  
  &:hover {
    opacity: 0.9;
  }
`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  gameVersion: string;
  onConfirm: (loaderType: string, loaderVersion: string) => void;
}

export function VersionConfigModal({ isOpen, onClose, gameVersion, onConfirm }: Props) {
  const [loaderType, setLoaderType] = useState('vanilla');
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [selectedLoaderVersion, setSelectedLoaderVersion] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && loaderType !== 'vanilla') {
      fetchLoaders();
    } else {
      setLoaderVersions([]);
      setSelectedLoaderVersion('');
    }
  }, [isOpen, loaderType, gameVersion]);

  async function fetchLoaders() {
    setLoading(true);
    try {
      const versions = await invoke<string[]>('fetch_loaders', { 
        gameVersion, 
        loaderType 
      });
      setLoaderVersions(versions);
      if (versions.length > 0) {
        setSelectedLoaderVersion(versions[0]);
      }
    } catch (e) {
      console.error(e);
      setLoaderVersions([]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <Title>安装配置 - {gameVersion}</Title>
        
        <FormGroup>
          <Label>Mod 加载器</Label>
          <Select 
            value={loaderType} 
            onChange={e => setLoaderType(e.target.value)}
          >
            <option value="vanilla">原版 (Vanilla)</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
          </Select>
        </FormGroup>

        {loaderType !== 'vanilla' && (
          <FormGroup>
            <Label>加载器版本</Label>
            <Select 
              value={selectedLoaderVersion} 
              onChange={e => setSelectedLoaderVersion(e.target.value)}
              disabled={loading || loaderVersions.length === 0}
            >
              {loading ? (
                <option>加载中...</option>
              ) : loaderVersions.length === 0 ? (
                <option>无可用版本</option>
              ) : (
                loaderVersions.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))
              )}
            </Select>
          </FormGroup>
        )}

        <ButtonGroup>
          <Button onClick={onClose}>取消</Button>
          <Button 
            $primary 
            onClick={() => onConfirm(loaderType, selectedLoaderVersion)}
            disabled={loaderType !== 'vanilla' && !selectedLoaderVersion}
          >
            开始下载
          </Button>
        </ButtonGroup>
      </ModalContent>
    </ModalOverlay>
  );
}
