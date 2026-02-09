import React from 'react';
import styled from 'styled-components';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authServer: string;
  setAuthServer: (url: string) => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(4px);
`;

const Content = styled.div`
  background-color: rgba(255, 255, 255, 0.95);
  padding: 2rem;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
`;

const Title = styled.h3`
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
`;

const Label = styled.label`
  color: #475569;
  margin-bottom: 0.5rem;
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
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

  &:focus {
    border-color: var(--accent-color);
    outline: none;
    background-color: white;
  }
`;

const CloseButton = styled.button`
  margin-top: 1.5rem;
  width: 100%;
  padding: 0.8rem;
  background-color: #f1f5f9;
  border: 1px solid var(--border-color);
  color: #64748b;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #e2e8f0;
    color: var(--text-color);
  }
`;

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, authServer, setAuthServer }) => {
  if (!isOpen) return null;

  return (
    <Overlay onClick={onClose}>
      <Content onClick={e => e.stopPropagation()}>
        <Title>设置</Title>
        <FormGroup>
          <Label htmlFor="auth-server">Auth Server URL</Label>
          <Input
            id="auth-server"
            type="url"
            value={authServer}
            onChange={(e) => setAuthServer(e.currentTarget.value)}
            placeholder="https://..."
          />
        </FormGroup>
        <CloseButton onClick={onClose}>关闭</CloseButton>
      </Content>
    </Overlay>
  );
};
