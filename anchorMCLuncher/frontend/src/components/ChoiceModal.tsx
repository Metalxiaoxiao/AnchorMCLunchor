import React from 'react';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ChoiceModalOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(5px);
  animation: ${fadeIn} 0.2s ease-out;
`;

const ChoiceContainer = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 16px;
  display: flex;
  gap: 2rem;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
`;

const ChoiceButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;
  width: 180px;

  &:hover {
    background: #e2e8f0;
    transform: translateY(-5px);
    border-color: var(--accent-color);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
  }

  svg {
    width: 48px;
    height: 48px;
    fill: var(--accent-color);
  }

  span {
    font-weight: bold;
    color: var(--text-color);
    font-size: 1rem;
    text-align: center;
  }
`;

export type ChoiceOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

interface ChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: ChoiceOption[];
  onSelect: (id: string) => void;
}

export const ChoiceModal: React.FC<ChoiceModalProps> = ({ isOpen, onClose, options, onSelect }) => {
  if (!isOpen) return null;

  return (
    <ChoiceModalOverlay onClick={onClose}>
      <ChoiceContainer onClick={e => e.stopPropagation()}>
        {options.map(option => (
          <ChoiceButton key={option.id} onClick={() => onSelect(option.id)}>
            {option.icon}
            <span>{option.label}</span>
          </ChoiceButton>
        ))}
      </ChoiceContainer>
    </ChoiceModalOverlay>
  );
};
