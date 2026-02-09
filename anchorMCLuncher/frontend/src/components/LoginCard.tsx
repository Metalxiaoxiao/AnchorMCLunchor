import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Logo } from './Logo';

const pixelFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

interface LoginCardProps {
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  isLoading: boolean;
  onLogin: (e: React.FormEvent) => void;
  onRegister: () => void;
  onCAFLogin: () => void;
}

const LoginContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
  padding: 1.5rem;
  background-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
`;

const TabContainer = styled.div`
  display: flex;
  width: 100%;
  margin-bottom: 1.5rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 2px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 0.7rem 1rem;
  background: ${props => props.$active ? 'rgba(255, 255, 255, 0.2)' : 'transparent'};
  color: ${props => props.$active ? 'white' : 'rgba(255, 255, 255, 0.7)'};
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

  &:hover {
    background: ${props => props.$active ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'};
    color: ${props => props.$active ? 'white' : 'rgba(255, 255, 255, 0.9)'};
  }
`;

const LoginForm = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  position: relative;
  z-index: 1;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
`;

const Label = styled.label`
  color: #64748b;
  margin-bottom: 0.5rem;
  display: block;
  font-weight: 500;
  font-size: 0.85rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.8rem 1rem;
  background-color: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  font-size: 0.9rem;
  transition: all 0.2s;
  box-sizing: border-box;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

  &:focus {
    border-color: var(--accent-color);
    background-color: rgba(255, 255, 255, 0.1);
    outline: none;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.7);
  }
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  width: 100%;
  padding: 0.8rem 1.2rem;
  background-color: ${props => props.$primary ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$primary ? 'white' : 'white'};
  border: ${props => props.$primary ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.3)'};
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
  position: relative;
  z-index: 1;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  box-shadow: ${props => props.$primary ? '0 1px 3px rgba(0, 0, 0, 0.2)' : 'none'};

  &:hover {
    background-color: ${props => props.$primary ? 'var(--accent-hover)' : 'rgba(255, 255, 255, 0.2)'};
    box-shadow: ${props => props.$primary ? '0 2px 4px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.1)'};
  }

  &:active {
    transform: translateY(1px);
    box-shadow: ${props => props.$primary ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none'};
  }

  &:disabled {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.5);
    cursor: not-allowed;
    box-shadow: none;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  width: 100%;
  margin-top: 0.5rem;
`;

export const LoginCard: React.FC<LoginCardProps> = ({
  username,
  setUsername,
  password,
  setPassword,
  isLoading,
  onLogin,
  onRegister,
  onCAFLogin
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'caf'>('caf');

  return (
    <LoginContainer>
      {activeTab === 'caf' && <Logo />}
      
      <TabContainer>
        <TabButton 
          $active={activeTab === 'login'} 
          onClick={() => setActiveTab('login')}
          disabled={isLoading}
        >
          登录/注册
        </TabButton>
        <TabButton 
          $active={activeTab === 'caf'} 
          onClick={() => setActiveTab('caf')}
          disabled={isLoading}
        >
          CAF 登录
        </TabButton>
      </TabContainer>
      
      {activeTab === 'login' ? (
        <LoginForm onSubmit={onLogin}>
          <FormGroup>
            <Label htmlFor="username">邮箱 / 用户名</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              placeholder="请输入用户名"
              required
              disabled={isLoading}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="请输入密码"
              required
              disabled={isLoading}
            />
          </FormGroup>

          <ButtonGroup>
            <ActionButton 
              type="submit" 
              $primary 
              disabled={isLoading}
            >
              {isLoading ? "正在登录..." : "登录"}
            </ActionButton>
            <ActionButton 
              type="button" 
              onClick={onRegister} 
              disabled={isLoading}
            >
              注册
            </ActionButton>
          </ButtonGroup>
        </LoginForm>
      ) : (
        <div style={{ width: '100%', position: 'relative', zIndex: 1, marginBottom: '0.5rem' }}>
          <ActionButton 
            onClick={onCAFLogin} 
            $primary 
            disabled={isLoading}
          >
            {isLoading ? "正在登录..." : "使用 CAF 登录"}
          </ActionButton>
        </div>
      )}
    </LoginContainer>
  );
};
