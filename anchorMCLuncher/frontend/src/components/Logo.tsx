import React from 'react';
import styled from 'styled-components';

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
`;

const LogoText = styled.div`
  font-size: 1.4rem;
  font-weight: bold;
  color: #333333;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
`;

const LogoIcon = styled.div`
  margin-right: 0.5rem;
`;

// 导入本地整合包SVG图标 - 与服务器卡片相同
const ImportModpackIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);

export const Logo: React.FC = () => {
  return (
    <LogoContainer>
      <LogoIcon>
        <ImportModpackIcon />
      </LogoIcon>
      <LogoText>西浦沙盒社</LogoText>
    </LogoContainer>
  );
};
