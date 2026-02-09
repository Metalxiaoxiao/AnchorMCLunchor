import React, { useEffect, useState, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';

const popIn = keyframes`
  0% { opacity: 0; transform: scale(0.9) translateY(-8px); }
  60% { opacity: 1; transform: scale(1.02) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;

const popOut = keyframes`
  0% { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(0.95) translateY(-5px); }
`;

const PopupContainer = styled.div<{ $isOpen: boolean; $align: 'left' | 'right' | 'center' }>`
  position: absolute;
  top: calc(100% + 8px);
  ${props => {
    switch(props.$align) {
      case 'right': return 'right: 0;';
      case 'center': return 'left: 50%; transform: translateX(-50%);';
      default: return 'left: 0;';
    }
  }}
  
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.05);
  z-index: 100;
  min-width: 220px;
  
  /* Animation origin based on alignment */
  transform-origin: top ${props => {
    switch(props.$align) {
      case 'right': return 'right';
      case 'center': return 'center';
      default: return 'left';
    }
  }};

  animation: ${props => props.$isOpen 
    ? css`${popIn} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards` 
    : css`${popOut} 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards`
  };
  
  /* Ensure clicks work when open */
  pointer-events: ${props => props.$isOpen ? 'auto' : 'none'};
`;

interface AnimatedPopupProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export const AnimatedPopup: React.FC<AnimatedPopupProps> = ({ isOpen, onClose, children, align = 'left', className }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const onAnimationEnd = () => {
    if (!isOpen) setShouldRender(false);
  };

  if (!shouldRender) return null;

  return (
    <PopupContainer 
      ref={containerRef}
      $isOpen={isOpen} 
      $align={align} 
      className={className}
      onAnimationEnd={onAnimationEnd}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </PopupContainer>
  );
};
