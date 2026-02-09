import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { confirm } from '@tauri-apps/plugin-dialog';
import * as api from '../api';

// Styled Components
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 4000;
`;

const ModalContent = styled.div`
  background: #1e1e1e;
  border-radius: 8px;
  width: 90vw;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  border: 1px solid #3e3e3e;
`;

const ModalHeader = styled.div`
  padding: 1rem 1.5rem;
  background: #252526;
  border-bottom: 1px solid #3e3e3e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px 8px 0 0;
`;

const ModalTitle = styled.h3`
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FileIcon = styled.span`
  font-size: 1.2rem;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ModalBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
`;

const EditorToolbar = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: #252526;
  border-radius: 4px;
  border: 1px solid #3e3e3e;
`;

const StatusBar = styled.div`
  padding: 0.5rem 1rem;
  background: #007acc;
  color: white;
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
  border-radius: 0 0 8px 8px;
`;

const TextArea = styled.textarea`
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e3e;
  color: #d4d4d4;
  padding: 1rem;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  border-radius: 4px;

  &:focus {
    border-color: var(--accent-color, #007acc);
  }

  &::placeholder {
    color: #666;
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
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  
  &:hover {
    color: #fff;
  }
`;

const Label = styled.span`
  color: #888;
  font-size: 0.8rem;
`;

interface FileEditorModalProps {
  containerId: string;
  filePath: string;
  fileName: string;
  onClose: () => void;
  onSaved: () => void;
}

export const FileEditorModal: React.FC<FileEditorModalProps> = ({
  containerId,
  filePath,
  fileName,
  onClose,
  onSaved
}) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('加载中...');
  const [lineCount, setLineCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Load file content on mount
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.readDockerFileContent(containerId, filePath);
        setContent(result.content);
        setOriginalContent(result.content);
        setStatus('已加载');
        updateStats(result.content);
      } catch (err: any) {
        setError(err.message || 'Failed to load file');
        setStatus('加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [containerId, filePath]);

  // Update stats when content changes
  const updateStats = (text: string) => {
    setLineCount(text.split('\n').length);
    setCharCount(text.length);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    updateStats(newContent);
    
    // Update status to show unsaved changes
    if (newContent !== originalContent) {
      setStatus('未保存');
    } else {
      setStatus('已保存');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.writeDockerFileContent(containerId, filePath, content);
      setOriginalContent(content);
      setStatus('已保存');
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
      setStatus('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (content !== originalContent) {
      if (!await confirm('您有未保存的更改，确定要关闭吗？')) {
        return;
      }
    }
    onClose();
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setStatus('已复制到剪贴板');
      setTimeout(() => {
        setStatus(content !== originalContent ? '未保存' : '已保存');
      }, 2000);
    } catch (err) {
      setError('复制到剪贴板失败');
    }
  };

  const hasChanges = content !== originalContent;

  return (
    <ModalOverlay onClick={handleClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            <FileIcon>📄</FileIcon>
            {fileName}
          </ModalTitle>
          <ModalActions>
            <ActionButton onClick={handleDownload} $color="#16a34a" title="下载文件">
              ⬇ 下载
            </ActionButton>
            <ActionButton onClick={handleCopyAll} title="复制全部内容">
              📋 复制
            </ActionButton>
            <ActionButton 
              onClick={handleSave} 
              $color="var(--accent-color, #007acc)"
              disabled={!hasChanges || saving}
            >
              {saving ? '保存中...' : '💾 保存'}
            </ActionButton>
            <CloseButton onClick={handleClose}>×</CloseButton>
          </ModalActions>
        </ModalHeader>

        <ModalBody>
          <EditorToolbar>
            <Label>文件路径: {filePath}</Label>
            {error && <Label style={{ color: '#f87171' }}>错误: {error}</Label>}
          </EditorToolbar>
          
          {loading ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              color: '#888' 
            }}>
              正在加载文件内容...
            </div>
          ) : error ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              color: '#f87171' 
            }}>
              {error}
            </div>
          ) : (
            <TextArea
              value={content}
              onChange={handleContentChange}
              placeholder="文件内容将显示在这里..."
              spellCheck={false}
            />
          )}
        </ModalBody>

        <StatusBar>
          <span>状态: {status}</span>
          <span>行数: {lineCount} | 字符数: {charCount}</span>
        </StatusBar>
      </ModalContent>
    </ModalOverlay>
  );
};

export default FileEditorModal;
