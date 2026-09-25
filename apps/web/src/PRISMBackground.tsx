import React, { useEffect, useState } from "react";
import { GradientWave } from "./GradientWave";

interface PRISMBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export default function PRISMBackground({ children, className = "" }: PRISMBackgroundProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return (
    <div
      className={`prism-app-wrapper ${className}`}
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "transparent",
        boxSizing: "border-box"
      }}
    >
      {/* Global Animated Gradient Wave WebGL Layer (Z-Index 0) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden"
        }}
      >
        <GradientWave
          colors={[
            "#F7F7F5",
            "#EEF0F2",
            "#E4E7EB",
            "#D8DCE2",
            "#C8CDD5",
            "#AEB5C0"
          ]}
          isPlaying={!reducedMotion}
          darkenTop={false}
          shadowPower={5}
          noiseSpeed={0.000008}
        />
      </div>

      {/* Main Application Content Shell (Z-Index 10+) */}
      <div style={{ position: "relative", zIndex: 10, minHeight: "100vh" }}>
        {children}
      </div>
    </div>
  );
}
