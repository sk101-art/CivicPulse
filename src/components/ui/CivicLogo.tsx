import React from 'react';

interface CivicLogoProps {
  className?: string;
  size?: number;
  showSubtitle?: boolean;
}

export function CivicEmblem({ size = 46, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <mask id="emblemDonut">
          <rect width="100" height="100" fill="white" />
          <circle cx="50" cy="50" r="21" fill="black" />
        </mask>
      </defs>
      <g mask="url(#emblemDonut)">
        {/* 6 balanced segments with subtle organic gaps */}
        {/* 1. North-East: desaturated teal */}
        <path d="M50 50 L89 27.5 A45 45 0 0 0 50 5 Z" fill="#527B7A" />
        {/* 2. East-South: deep teal */}
        <path d="M50 50 L89 72.5 A45 45 0 0 0 89 27.5 Z" fill="#355858" />
        {/* 3. South: sage */}
        <path d="M50 50 L50 95 A45 45 0 0 0 89 72.5 Z" fill="#66766D" />
        {/* 4. South-West: soft olive */}
        <path d="M50 50 L11 72.5 A45 45 0 0 0 50 95 Z" fill="#87917B" />
        {/* 5. West-North: pale teal/sage */}
        <path d="M50 50 L11 27.5 A45 45 0 0 0 11 72.5 Z" fill="#A4BEB7" />
        {/* 6. North-West: teal */}
        <path d="M50 50 L50 5 A45 45 0 0 0 11 27.5 Z" fill="#527B7A" />

        {/* Separator lines */}
        <line x1="50" y1="50" x2="50" y2="2" stroke="#F3F2EB" strokeWidth="2.5" />
        <line x1="50" y1="50" x2="91" y2="26" stroke="#F3F2EB" strokeWidth="2.5" />
        <line x1="50" y1="50" x2="91" y2="74" stroke="#F3F2EB" strokeWidth="2.5" />
        <line x1="50" y1="50" x2="50" y2="98" stroke="#F3F2EB" strokeWidth="2.5" />
        <line x1="50" y1="50" x2="9" y2="74" stroke="#F3F2EB" strokeWidth="2.5" />
        <line x1="50" y1="50" x2="9" y2="26" stroke="#F3F2EB" strokeWidth="2.5" />
      </g>
      <circle cx="50" cy="50" r="21" stroke="#DDDCD3" strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="45" stroke="#DDDCD3" strokeWidth="1" fill="none" />
    </svg>
  );
}

export function CivicLogo({
  className = "",
  size = 44,
  showSubtitle = true,
}: CivicLogoProps) {
  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      <CivicEmblem size={size} />
      <div className="flex flex-col justify-center">
        <span className="font-body font-bold text-[#293732] tracking-tight text-[22px] leading-tight">
          CivicPulse
        </span>
        {showSubtitle && (
          <span className="text-[10px] font-mono font-medium tracking-[0.26em] text-[#65736B] uppercase leading-none mt-1">
            CIVIC ATLAS
          </span>
        )}
      </div>
    </div>
  );
}
