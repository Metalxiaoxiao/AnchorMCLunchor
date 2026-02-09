import React from 'react';
import styled from 'styled-components';

const Overlay = styled.div<{ $zIndex?: number }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: ${props => props.$zIndex || 3000};
  backdrop-filter: blur(5px);
`;

const ModalContainer = styled.div`
  background: var(--panel-bg);
  padding: 2rem;
  border-radius: 16px;
  width: 400px;
  max-width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const Message = styled.p`
  font-size: 1.1rem;
  margin-bottom: 2rem;
  line-height: 1.5;
`;

const Button = styled.button`
  padding: 0.8rem 2rem;
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
`;

interface MessageModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  type?: 'info' | 'error' | 'confirm';
  showCancel?: boolean;
  confirmText?: string;
  cancelText?: string;
  zIndex?: number;
}

export const MessageModal: React.FC<MessageModalProps> = ({ 
  isOpen, 
  message, 
  onClose, 
  type = 'info',
  showCancel = false,
  confirmText = '确定',
  cancelText = '取消',
  zIndex
}) => {
  if (!isOpen) return null;

  return (
    <Overlay onClick={type === 'info' ? undefined : onClose} $zIndex={zIndex}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <Message>{message}</Message>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {showCancel && (
            <Button onClick={onClose} style={{ backgroundColor: '#64748b' }}>
              {cancelText}
            </Button>
          )}
          {!showCancel && (
             <Button onClick={onClose}>{confirmText}</Button>
          )}
        </div>
      </ModalContainer>
    </Overlay>
  );
};
