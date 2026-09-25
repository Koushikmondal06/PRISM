import React, { useEffect, useRef, useState, useId } from "react";

interface GlyphPortalProps {
  word?: string;
  subtitle?: string;
  children?: React.ReactNode;
  targetLetter?: string;
  className?: string;
  style?: React.CSSProperties;
}

// Math & Easing Helpers
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function cubicEaseIn(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * clamped;
}

interface LetterBox {
  char: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  interiorX: number;
  interiorY: number;
}

export default function GlyphPortal({
  word = "PRISM",
  subtitle = "Prediction and Real-World Intelligence Settlement Market",
  children,
  targetLetter = "R",
  className = "",
  style = {}
}: GlyphPortalProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Store layout metrics
  const layoutRef = useRef<{
    fontSize: number;
    wordWidth: number;
    wordHeight: number;
    letters: LetterBox[];
    targetLetterBox: LetterBox | null;
  }>({
    fontSize: 120,
    wordWidth: 600,
    wordHeight: 150,
    letters: [],
    targetLetterBox: null
  });

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Measure word geometry and letter interior points
  const measureGeometry = (width: number, height: number) => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext("2d");
    if (!ctx) return;

    // Font size scaling: ensure "PRISM" fits comfortably inside viewport with side margins
    const fontSize = Math.min(width * 0.16, height * 0.22, 150);
    ctx.font = `800 ${fontSize}px "Space Grotesk", "Outfit", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(word);
    const wordWidth = metrics.width;
    const wordHeight = fontSize * 0.85;

    const startX = (width - wordWidth) / 2;
    const centerY = height * 0.46; // Center vertically at ~46% of viewport

    const letters: LetterBox[] = [];
    let currentX = startX;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const charWidth = ctx.measureText(char).width;
      const charX = currentX;
      const charY = centerY - wordHeight / 2;

      let intX = charX + charWidth * 0.5;
      let intY = centerY;

      if (char === "P" || char === "R") {
        intY = centerY - fontSize * 0.12; // Focus on top loop interior
      } else if (char === "I") {
        intY = centerY;
      }

      letters.push({
        char,
        index: i,
        x: charX,
        y: charY,
        width: charWidth,
        height: wordHeight,
        centerX: charX + charWidth / 2,
        centerY,
        interiorX: intX,
        interiorY: intY
      });

      currentX += charWidth;
    }

    let target = letters.find((l) => l.char.toUpperCase() === targetLetter.toUpperCase());
    if (!target) target = letters.find((l) => l.char.toUpperCase() === "P") || letters[1] || letters[0];

    layoutRef.current = {
      fontSize,
      wordWidth,
      wordHeight,
      letters,
      targetLetterBox: target
    };
  };

  // Scroll Progress Calculation
  useEffect(() => {
    let animId: number | null = null;
    let resizeObs: ResizeObserver | null = null;

    const handleScroll = () => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const totalScroll = rect.height - window.innerHeight;
      if (totalScroll <= 0) return;

      const currentScroll = -rect.top;
      const progress = clamp(currentScroll / totalScroll, 0, 1);
      setScrollProgress(progress);
    };

    const handleResize = () => {
      const sticky = stickyRef.current;
      if (sticky) {
        measureGeometry(sticky.clientWidth, sticky.clientHeight);
      }
      handleScroll();
    };

    handleResize();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    if (stickyRef.current) {
      resizeObs = new ResizeObserver(handleResize);
      resizeObs.observe(stickyRef.current);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (resizeObs) resizeObs.disconnect();
      if (animId) cancelAnimationFrame(animId);
    };
  }, [word, targetLetter]);

  // Render Canvas Loop & Camera Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const sticky = stickyRef.current;
    if (!canvas || !sticky) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = sticky.clientWidth;
      const height = sticky.clientHeight;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      const { fontSize, letters, targetLetterBox } = layoutRef.current;
      if (!targetLetterBox || letters.length === 0) return;

      const p = reducedMotion ? (scrollProgress > 0.3 ? 1 : 0) : scrollProgress;
      const easeP = cubicEaseIn(p);

      const startScale = 1.0;
      const maxScale = 32.0; // Deep zoom into letter interior
      const scale = startScale + easeP * (maxScale - startScale);

      const screenCenterX = width / 2;
      const screenCenterY = height * 0.46;

      const targetX = targetLetterBox.interiorX;
      const targetY = targetLetterBox.interiorY;

      // Focus point moves from screen center toward target letter interior as scroll progress increases
      const focusX = screenCenterX + (targetX - screenCenterX) * easeP;
      const focusY = screenCenterY + (targetY - screenCenterY) * easeP;
      const rotation = Math.sin(p * Math.PI) * 0.035;

      ctx.save();
      // 1. Move to viewport screen center
      ctx.translate(screenCenterX, screenCenterY);
      // 2. Apply camera scale & rotation
      ctx.scale(scale, scale);
      ctx.rotate(rotation);
      // 3. Offset by focus point so scale happens around focusX, focusY
      ctx.translate(-focusX, -focusY);

      // Draw Subtitle (fades out early as zoom starts)
      const subtitleOpacity = clamp(1 - p * 3.5, 0, 1);
      if (subtitleOpacity > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(111, 116, 125, ${subtitleOpacity})`;
        ctx.font = `400 ${Math.max(14, fontSize * 0.16)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(subtitle, screenCenterX, screenCenterY + fontSize * 0.65);
        ctx.restore();
      }

      // Draw Word "PRISM" (Centered at screenCenterX, screenCenterY)
      const wordOpacity = clamp(1 - (p - 0.7) * 3.33, 0, 1);
      if (wordOpacity > 0.001) {
        ctx.fillStyle = `rgba(32, 35, 41, ${wordOpacity})`;
        ctx.font = `800 ${fontSize}px "Space Grotesk", "Outfit", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(word, screenCenterX, screenCenterY);
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [scrollProgress, word, subtitle, reducedMotion]);

  return (
    <div
      className={`glyph-portal-wrapper ${className}`}
      style={{
        position: "relative",
        width: "100%",
        boxSizing: "border-box",
        ...style
      }}
    >
      {/* Track Section for 3D Zoom Camera */}
      <div
        ref={trackRef}
        className="glyph-portal-track"
        style={{
          position: "relative",
          width: "100%",
          height: "180vh",
          backgroundColor: "transparent",
          boxSizing: "border-box"
        }}
      >
        {/* Sticky Camera Viewport */}
        <div
          ref={stickyRef}
          className="glyph-portal-sticky"
          style={{
            position: "sticky",
            top: 0,
            width: "100%",
            height: "100vh",
            overflow: "hidden",
            backgroundColor: "transparent",
            zIndex: 10,
            boxSizing: "border-box"
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              pointerEvents: "none"
            }}
          />
        </div>
      </div>

      {/* Content Revealed Below 3D Hero Zoom Track (PRISM Landing Page Content) */}
      {children && (
        <div
          className="glyph-portal-revealed-content"
          style={{
            position: "relative",
            zIndex: 20,
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
