import React, { useEffect, useRef } from "react";

interface CrowdCanvasProps {
  src: string;
  rows?: number;
  cols?: number;
  peepCount?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface Peep {
  x: number;
  y: number;
  speed: number;
  scale: number;
  frameIndex: number;
  direction: number; // 1: left to right, -1: right to left
  bobOffset: number;
  bobSpeed: number;
}

export default function CrowdCanvas({
  src,
  rows = 15,
  cols = 7,
  peepCount = 45,
  className = "",
  style = {}
}: CrowdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let isMounted = true;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;

    const peeps: Peep[] = [];

    const initPeeps = (width: number, height: number) => {
      peeps.length = 0;
      const totalFrames = rows * cols;
      for (let i = 0; i < peepCount; i++) {
        const scale = 0.28 + Math.random() * 0.38; // Varying scale for depth
        const direction = Math.random() > 0.3 ? 1 : -1;
        peeps.push({
          x: Math.random() * (width + 400) - 200,
          y: height - (Math.random() * (height * 0.55)), // Lower 55% of canvas
          speed: (0.4 + Math.random() * 0.8) * direction,
          scale,
          frameIndex: Math.floor(Math.random() * totalFrames),
          direction,
          bobOffset: Math.random() * Math.PI * 2,
          bobSpeed: 0.05 + Math.random() * 0.05
        });
      }
      // Sort peeps by Y position so peeps further back render behind closer peeps
      peeps.sort((a, b) => a.y - b.y);
    };

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      if (peeps.length === 0) {
        initPeeps(rect.width, rect.height);
      }
    };

    img.onload = () => {
      if (!isMounted) return;
      handleResize();
      window.addEventListener("resize", handleResize);

      const frameW = img.width / cols;
      const frameH = img.height / rows;

      const render = () => {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < peeps.length; i++) {
          const peep = peeps[i];
          peep.x += peep.speed;
          peep.bobOffset += peep.bobSpeed;

          // Wrap horizontally
          if (peep.direction === 1 && peep.x > width + 100) {
            peep.x = -150;
            peep.y = height - (Math.random() * (height * 0.55));
          } else if (peep.direction === -1 && peep.x < -150) {
            peep.x = width + 100;
            peep.y = height - (Math.random() * (height * 0.55));
          }

          const col = peep.frameIndex % cols;
          const row = Math.floor(peep.frameIndex / cols);

          const sx = col * frameW;
          const sy = row * frameH;

          const renderW = frameW * peep.scale;
          const renderH = frameH * peep.scale;

          const bobY = Math.sin(peep.bobOffset) * 2;

          ctx.save();
          ctx.translate(peep.x, peep.y + bobY);
          if (peep.direction === -1) {
            ctx.scale(-1, 1);
            ctx.drawImage(
              img,
              sx, sy, frameW, frameH,
              -renderW, -renderH, renderW, renderH
            );
          } else {
            ctx.drawImage(
              img,
              sx, sy, frameW, frameH,
              0, -renderH, renderW, renderH
            );
          }
          ctx.restore();
        }

        animId = requestAnimationFrame(render);
      };

      animId = requestAnimationFrame(render);
    };

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [src, rows, cols, peepCount]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        ...style
      }}
    />
  );
}
