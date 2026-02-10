import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  :root {
    font-family: 'Microsoft YaHei', 'Segoe UI', Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    font-weight: 400;

    /* Light Blue Theme Colors */
    --bg-color: rgba(240, 249, 255, 0.85);
    --panel-bg: rgba(255, 255, 255, 0.7);
    --text-color: #0f172a;
    --accent-color: #0ea5e9;
    --accent-hover: #0284c7;
    --accent-active: #0369a1;
    --border-color: rgba(186, 230, 253, 0.6);
    --success-color: #22c55e;
    --warning-color: #eab308;
    --error-color: #ef4444;

    color: var(--text-color);
    background-color: transparent;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  html, body, #root {
    background-color: transparent !important;
  }

  body {
    margin: 0;
    padding: 0;
    overflow: hidden; 
    user-select: none;
  }

  body {
    background-color: transparent;
  }

  input, button {
    outline: none;
  }
`;
