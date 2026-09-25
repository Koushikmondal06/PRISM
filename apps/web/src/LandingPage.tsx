import React from "react";
import GlyphPortal from "./GlyphPortal";

interface LandingPageProps {
  children?: React.ReactNode;
}

export default function LandingPage({ children }: LandingPageProps) {
  return (
    <GlyphPortal
      word="PRISM"
      subtitle="Prediction and Real-World Intelligence Settlement Market"
      targetLetter="R"
    >
      {children}
    </GlyphPortal>
  );
}
