import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

interface SpinnerProps {
  size?: number;
  color?: string;
  borderWidth?: number;
}

export const LoadingSpinner = styled.div<SpinnerProps>`
  width: ${props => props.size || 24}px;
  height: ${props => props.size || 24}px;
  border: ${props => props.borderWidth || 3}px solid rgba(255, 255, 255, 0.3);
  border-left-color: ${props => props.color || 'white'};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  display: inline-block;
`;
