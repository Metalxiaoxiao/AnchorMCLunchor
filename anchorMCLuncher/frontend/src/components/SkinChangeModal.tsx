import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { SkinViewer } from './SkinViewer';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

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

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-color);
  font-weight: 500;
`;

const HiddenInput = styled.input`
  display: none;
`;

const UploadButton = styled.label`
  display: inline-block;
  padding: 0.8rem 1.5rem;
  background-color: #e2e8f0;
  color: #475569;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
  text-align: center;

  &:hover {
    background-color: #cbd5e1;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 2rem;
  margin-top: 2rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  background-color: ${props => props.$primary ? 'var(--accent-color)' : '#e2e8f0'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.$primary ? 'var(--accent-hover)' : '#cbd5e1'};
  }
`;

interface SkinChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSkinUrl: string;
  onSave: (newSkin: string | File) => void;
}

export const SkinChangeModal: React.FC<SkinChangeModalProps> = ({ isOpen, onClose, currentSkinUrl, onSave }) => {
  const [previewSkin, setPreviewSkin] = useState(currentSkinUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    setPreviewSkin(currentSkinUrl);
  }, [currentSkinUrl, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setPreviewSkin(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const openSkinEditor = async () => {
    const webview = new WebviewWindow('skin-editor', {
      url: 'index.html?window=skin-editor',
      title: 'Skin Editor',
      width: 800,
      height: 700
    });
  };

  return (
    <ModalOverlay>
      <Header>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BackButton onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </BackButton>
          <Title>Change Skin</Title>
        </div>
        <ButtonGroup style={{ marginTop: 0 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button $primary onClick={() => {
            if (selectedFile) {
                onSave(selectedFile);
            }
            onClose();
          }}>Save</Button>
        </ButtonGroup>
      </Header>
      <ModalContent>
        <Row>
          <div style={{ width: '300px', height: '400px', background: 'rgba(0,0,0,0.05)', borderRadius: '16px' }}>
            <SkinViewer width={300} height={400} skinUrl={previewSkin} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <Label>Upload Skin File</Label>
              <UploadButton>
                Choose File
                <HiddenInput type="file" accept=".png" onChange={handleFileChange} />
              </UploadButton>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                Supported format: PNG (64x64 or 64x32)
              </p>
            </div>
            
            <div>
              <Label>Draw Skin</Label>
              <Button onClick={openSkinEditor}>
                Edit Skin
              </Button>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                Opens the built-in skin editor in a new window.
              </p>
            </div>
          </div>
        </Row>
      </ModalContent>
    </ModalOverlay>
  );
};
