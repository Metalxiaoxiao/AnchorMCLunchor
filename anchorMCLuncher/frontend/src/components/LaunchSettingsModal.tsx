import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { invoke } from '@tauri-apps/api/core';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { LoadingSpinner } from './LoadingSpinner';

const ModalOverlay = styled.div`
  position: fixed;
  top: 40px;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.95);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(20px);

  @keyframes slideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background: transparent;
`;

const BackButton = styled.button`
  background: rgba(0, 0, 0, 0.05);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  margin-right: 1rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: var(--accent-color);
    color: white;
    transform: scale(1.1);
  }

  svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
`;

const ModalContent = styled.div`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
`;

const Title = styled.h2`
  margin: 0;
  color: var(--text-color);
  font-size: 1.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-color);
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
`;

const RangeInput = styled.input`
  width: 100%;
  appearance: none;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-color) 0%, #e2e8f0 100%);
  outline: none;
  transition: background 0.2s;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    border: 2px solid white;
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent-color);
    cursor: pointer;
    border: 2px solid white;
  }
`;

const MemoryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const MemoryValue = styled.div`
  font-weight: 600;
  color: var(--text-color);
  min-width: 120px;
  text-align: right;
`;

const MemoryHint = styled.div`
  color: #64748b;
  font-size: 0.9rem;
  margin-top: 0.4rem;
`;

const Row = styled.div`
  display: flex;
  gap: 1rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
`;

const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  background-color: ${props => props.$primary ? 'var(--accent-color)' : props.$danger ? '#ef4444' : '#e2e8f0'};
  color: ${props => (props.$primary || props.$danger) ? 'white' : '#475569'};
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.$primary ? 'var(--accent-hover)' : props.$danger ? '#dc2626' : '#cbd5e1'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #e2e8f0;
    color: #94a3b8;
  }
`;

const AdvancedActionButton = styled.button`
  padding: 0.8rem 1.2rem;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  flex: 1;
  min-width: fit-content;

  &:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
    background: #f8fafc;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #f1f5f9;
    color: #94a3b8;
    border-color: var(--border-color);
  }
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  gap: 10px;
  padding: 0.5rem 0;
`;

const HiddenCheckbox = styled.input.attrs({ type: 'checkbox' })`
  border: 0;
  clip: rect(0 0 0 0);
  clippath: inset(50%);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
`;

const StyledCheckbox = styled.div<{ checked: boolean }>`
  display: inline-block;
  width: 20px;
  height: 20px;
  background: ${props => props.checked ? 'var(--accent-color)' : 'transparent'};
  border: 2px solid ${props => props.checked ? 'var(--accent-color)' : '#cbd5e1'};
  border-radius: 6px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  ${HiddenCheckbox}:focus + & {
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
  }

  &::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 2px;
    width: 4px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: ${props => props.checked ? 'rotate(45deg) scale(1)' : 'rotate(45deg) scale(0)'};
    opacity: ${props => props.checked ? 1 : 0};
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

const CheckboxLabel = styled.span`
  color: var(--text-color);
  font-weight: 500;
`;

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label }) => (
  <CheckboxContainer onClick={() => onChange(!checked)}>
    <HiddenCheckbox checked={checked} onChange={() => {}} />
    <StyledCheckbox checked={checked} />
    <CheckboxLabel>{label}</CheckboxLabel>
  </CheckboxContainer>
);

export interface VersionConfig {
  minMemory: number;
  maxMemory: number;
  width: number;
  height: number;
  jvmArgs: string;
  enableIsolation: boolean;
}

interface LaunchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionId: string;
  onSave: (config: VersionConfig) => void;
}

interface VersionDetails {
  is_modded: boolean;
  version_type: string;
  version_path: string;
  mc_path: string;
}

interface MemoryInfo {
  total_mb: number;
  available_mb: number;
}

export const LaunchSettingsModal: React.FC<LaunchSettingsModalProps> = ({ isOpen, onClose, versionId, onSave }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [versionDetails, setVersionDetails] = useState<VersionDetails | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [config, setConfig] = useState<VersionConfig>({
    minMemory: 1024,
    maxMemory: 4096,
    width: 854,
    height: 480,
    jvmArgs: '',
    enableIsolation: true
  });

  useEffect(() => {
    if (isOpen && versionId) {
      invoke<VersionDetails>('get_version_details', { versionId, gamePath: localStorage.getItem('gamePath') || null })
        .then(setVersionDetails)
        .catch(console.error);
    }
  }, [isOpen, versionId]);

  const handleOpenVersionFolder = async () => {
    if (!versionDetails) return;
    try {
      await invoke('open_folder', { path: versionDetails.version_path });
    } catch (e) {
      console.error(e);
      alert("打开文件夹失败");
    }
  };

  const handleOpenModsFolder = async () => {
    if (!versionDetails) return;
    try {
      await invoke('open_mods_folder', { 
        versionId: versionId, 
        gamePath: localStorage.getItem('gamePath') || null 
      });
    } catch (e) {
      console.error(e);
      alert("打开文件夹失败 (可能文件夹不存在)");
    }
  };

  useEffect(() => {
    if (isOpen && versionId) {
      invoke<MemoryInfo>('get_memory_info')
        .then(setMemoryInfo)
        .catch(console.error);

      const savedConfig = localStorage.getItem(`version_config_${versionId}`);
      if (savedConfig) {
        setHasSavedConfig(true);
        setConfig(JSON.parse(savedConfig));
      } else {
        setHasSavedConfig(false);
        // Default values
        setConfig({
          minMemory: 1024,
          maxMemory: 4096,
          width: 854,
          height: 480,
          jvmArgs: '',
          enableIsolation: true
        });
      }
    }
  }, [isOpen, versionId]);

  useEffect(() => {
    if (!isOpen || hasSavedConfig || !memoryInfo) return;
    const available = Math.max(memoryInfo.available_mb, 512);
    const suggested = Math.max(512, Math.floor(available * 0.8));
    setConfig(prev => ({
      ...prev,
      maxMemory: suggested,
      minMemory: Math.min(prev.minMemory, suggested)
    }));
  }, [isOpen, hasSavedConfig, memoryInfo]);

  const handleChange = (field: keyof VersionConfig, value: string | number | boolean) => {
    setConfig(prev => {
      const next = { ...prev, [field]: value } as VersionConfig;
      if (field === 'minMemory' && typeof value === 'number' && value > next.maxMemory) {
        next.maxMemory = value;
      }
      if (field === 'maxMemory' && typeof value === 'number' && value < next.minMemory) {
        next.minMemory = value;
      }
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem(`version_config_${versionId}`, JSON.stringify(config));
    onSave(config);
    onClose();
  };

  const handleDeleteVersion = async () => {
    const yes = await ask(`确定要删除版本 ${versionId} 吗？此操作不可恢复。`, {
      title: '删除版本',
      kind: 'warning'
    });

    if (!yes) return;

    try {
      await invoke('delete_version', { versionId, gamePath: localStorage.getItem('gamePath') || null });
      localStorage.removeItem(`version_config_${versionId}`);
      alert('版本已删除');
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(`删除失败: ${e.message || e}`);
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    
    try {
      const filePath = await save({
        filters: [{
          name: 'Modpack',
          extensions: ['zip']
        }],
        defaultPath: `${versionId}-modpack.zip`
      });

      if (!filePath) return;

      setIsExporting(true);
      
      await invoke('export_modpack', { 
        versionId: versionId, 
        gamePath: null, 
        destPath: filePath,
        enableIsolation: null
      });
      
      alert("导出成功！");
    } catch (e: any) {
      console.error(e);
      alert(`导出失败: ${e.message || e}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay>
      <Header>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BackButton onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </BackButton>
          <Title>版本设置: {versionId}</Title>
        </div>
        <ButtonGroup>
          <Button onClick={onClose}>取消</Button>
          <Button $primary onClick={handleSave}>保存</Button>
        </ButtonGroup>
      </Header>
      <ModalContent>
        
        <Row>
          <FormGroup style={{ flex: 1 }}>
            <Label>最小内存 (MB)</Label>
            <Input 
              type="number" 
              value={config.minMemory} 
              onChange={e => handleChange('minMemory', parseInt(e.target.value) || 0)}
            />
          </FormGroup>
          <FormGroup style={{ flex: 1 }}>
            <Label>最大内存 (MB)</Label>
            <MemoryRow>
              <RangeInput
                type="range"
                min={512}
                max={Math.max(512, memoryInfo?.available_mb || 16384)}
                step={256}
                value={config.maxMemory}
                onChange={e => handleChange('maxMemory', parseInt(e.target.value) || 0)}
              />
              <MemoryValue>{config.maxMemory} MB</MemoryValue>
            </MemoryRow>
            <MemoryHint>
              {memoryInfo
                ? `系统可用内存 ${memoryInfo.available_mb} MB，默认使用 80% 空闲内存`
                : '正在读取系统内存...'}
            </MemoryHint>
          </FormGroup>
        </Row>

        <Row>
          <FormGroup style={{ flex: 1 }}>
            <Label>窗口宽度</Label>
            <Input 
              type="number" 
              value={config.width} 
              onChange={e => handleChange('width', parseInt(e.target.value) || 0)}
            />
          </FormGroup>
          <FormGroup style={{ flex: 1 }}>
            <Label>窗口高度</Label>
            <Input 
              type="number" 
              value={config.height} 
              onChange={e => handleChange('height', parseInt(e.target.value) || 0)}
            />
          </FormGroup>
        </Row>

        <FormGroup>
          <Label>JVM 参数 (空格分隔)</Label>
          <Input 
            type="text" 
            value={config.jvmArgs} 
            onChange={e => handleChange('jvmArgs', e.target.value)}
            placeholder="-XX:+UseG1GC -Dexample.prop=value"
          />
        </FormGroup>



        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1rem' }}>
            <Title style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>高级操作</Title>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <AdvancedActionButton onClick={handleExport} disabled={isExporting}>
                  {isExporting ? (
                    <>
                      <LoadingSpinner size={20} borderWidth={2} />
                      正在导出...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                      </svg>
                      导出为整合包
                    </>
                  )}
              </AdvancedActionButton>
              <AdvancedActionButton onClick={handleOpenVersionFolder}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                打开版本文件夹
              </AdvancedActionButton>
              <AdvancedActionButton onClick={handleOpenModsFolder} disabled={!versionDetails?.is_modded}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                </svg>
                打开 Mods 文件夹
              </AdvancedActionButton>
              <AdvancedActionButton onClick={handleDeleteVersion}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path d="M6 7h12v2H6V7zm2 3h8l-1 9H9l-1-9zm3-6h2l1 2h-4l1-2z"/>
                </svg>
                删除版本
              </AdvancedActionButton>
            </div>
        </div>

      </ModalContent>
    </ModalOverlay>
  );
};
