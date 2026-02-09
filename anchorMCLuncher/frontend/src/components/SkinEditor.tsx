import React, { useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { Window } from '@tauri-apps/api/window';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
  user-select: none;
`;

const Toolbar = styled.div`
  height: 50px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 1rem;
`;

const ToolButton = styled.button<{ $active?: boolean }>`
  padding: 0.5rem 1rem;
  border: 1px solid ${props => props.$active ? 'var(--accent-color)' : '#cbd5e1'};
  background: ${props => props.$active ? 'var(--accent-color)' : 'white'};
  color: ${props => props.$active ? 'white' : '#475569'};
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$active ? 'var(--accent-color)' : '#f1f5f9'};
  }
`;

const ColorPicker = styled.input`
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
`;

const CanvasContainer = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  padding: 2rem;
`;

const Canvas = styled.canvas`
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  image-rendering: pixelated;
  cursor: crosshair;
  border: 1px solid #cbd5e1;
`;

const VALID_REGIONS = [
  // Head
  { x: 8, y: 0, w: 16, h: 8 },
  { x: 0, y: 8, w: 32, h: 8 },
  // Head Overlay
  { x: 40, y: 0, w: 16, h: 8 },
  { x: 32, y: 8, w: 32, h: 8 },
  // Right Leg
  { x: 4, y: 16, w: 8, h: 4 },
  { x: 0, y: 20, w: 16, h: 12 },
  // Body
  { x: 20, y: 16, w: 16, h: 4 },
  { x: 16, y: 20, w: 24, h: 12 },
  // Right Arm
  { x: 44, y: 16, w: 8, h: 4 },
  { x: 40, y: 20, w: 16, h: 12 },
  // Right Leg Overlay
  { x: 4, y: 32, w: 8, h: 4 },
  { x: 0, y: 36, w: 16, h: 12 },
  // Body Overlay
  { x: 20, y: 32, w: 16, h: 4 },
  { x: 16, y: 36, w: 24, h: 12 },
  // Right Arm Overlay
  { x: 44, y: 32, w: 8, h: 4 },
  { x: 40, y: 36, w: 16, h: 12 },
  // Left Leg
  { x: 20, y: 48, w: 8, h: 4 },
  { x: 16, y: 52, w: 16, h: 12 },
  // Left Arm
  { x: 36, y: 48, w: 8, h: 4 },
  { x: 32, y: 52, w: 16, h: 12 },
  // Left Leg Overlay
  { x: 4, y: 48, w: 8, h: 4 },
  { x: 0, y: 52, w: 16, h: 12 },
  // Left Arm Overlay
  { x: 52, y: 48, w: 8, h: 4 },
  { x: 48, y: 52, w: 16, h: 12 },
];

const isPointInValidRegion = (x: number, y: number) => {
  return VALID_REGIONS.some(region => 
    x >= region.x && x < region.x + region.w &&
    y >= region.y && y < region.y + region.h
  );
};

export const SkinEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize canvas
    ctx.clearRect(0, 0, 64, 64);
    
    // Fill invalid regions with grey
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 64, 64);

    // Clear valid regions
    VALID_REGIONS.forEach(region => {
      ctx.clearRect(region.x, region.y, region.w, region.h);
    });
  }, []);

  const getCoordinates = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY)
    };
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    
    if (!isPointInValidRegion(x, y)) return;

    if (tool === 'pencil') {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    } else {
      ctx.clearRect(x, y, 1, 1);
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Create a link to download the image
    const link = document.createElement('a');
    link.download = 'skin.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Container>
      <Toolbar>
        <ToolButton $active={tool === 'pencil'} onClick={() => setTool('pencil')}>Pencil</ToolButton>
        <ToolButton $active={tool === 'eraser'} onClick={() => setTool('eraser')}>Eraser</ToolButton>
        <ColorPicker type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <div style={{ flex: 1 }} />
        <ToolButton onClick={handleSave} $active>Save to File</ToolButton>
      </Toolbar>
      <CanvasContainer>
        <Canvas 
          ref={canvasRef} 
          width={64} 
          height={64} 
          style={{ width: '512px', height: '512px' }}
          onMouseDown={(e) => { setIsDrawing(true); draw(e); }}
          onMouseMove={draw}
          onMouseUp={() => setIsDrawing(false)}
          onMouseLeave={() => setIsDrawing(false)}
        />
      </CanvasContainer>
    </Container>
  );
};
