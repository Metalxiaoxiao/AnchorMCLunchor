import React, { useEffect, useRef } from 'react';
import * as skinview3d from 'skinview3d';

interface SkinViewerProps {
  width: number;
  height: number;
  skinUrl: string;
}

export const SkinViewer: React.FC<SkinViewerProps> = ({ width, height, skinUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      viewerRef.current = new skinview3d.SkinViewer({
        canvas: canvasRef.current,
        width: width,
        height: height,
        skin: skinUrl,
      });

      // Set initial rotation or animation
      viewerRef.current.autoRotate = true;
      viewerRef.current.autoRotateSpeed = 0.5;
      
      // Adjust camera to fit the character nicely
      viewerRef.current.camera.position.z = 70;
      viewerRef.current.zoom = 0.9;
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
      }
    };
  }, [width, height]);

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.loadSkin(skinUrl);
    }
  }, [skinUrl]);

  return <canvas ref={canvasRef} />;
};
