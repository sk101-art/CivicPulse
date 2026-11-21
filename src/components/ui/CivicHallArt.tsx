import React from 'react';

export function TreeBranchArt({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute top-0 left-0 pointer-events-none select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 380 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[280px] sm:w-[360px] h-auto opacity-85 drop-shadow-sm"
      >
        <defs>
          <linearGradient id="leafGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8DA37B" />
            <stop offset="60%" stopColor="#5D7A68" />
            <stop offset="100%" stopColor="#435C4D" />
          </linearGradient>
          <linearGradient id="leafGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A8BD8F" />
            <stop offset="60%" stopColor="#739174" />
            <stop offset="100%" stopColor="#4F6D55" />
          </linearGradient>
        </defs>

        {/* Main curved branch */}
        <path
          d="M-20 -10 Q60 50 140 70 T260 130 T340 220"
          stroke="#5A4A38"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M90 60 Q150 100 200 170"
          stroke="#685640"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M170 85 Q220 70 280 80"
          stroke="#685640"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M130 120 Q160 180 175 240"
          stroke="#685640"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Leaf clusters along the branches */}
        {/* Cluster 1: Top-Left */}
        <g>
          <ellipse cx="60" cy="30" rx="18" ry="10" transform="rotate(-25 60 30)" fill="url(#leafGrad1)" />
          <ellipse cx="80" cy="20" rx="16" ry="9" transform="rotate(15 80 20)" fill="url(#leafGrad2)" />
          <ellipse cx="40" cy="45" rx="19" ry="11" transform="rotate(-40 40 45)" fill="url(#leafGrad2)" />
          <ellipse cx="95" cy="45" rx="17" ry="10" transform="rotate(35 95 45)" fill="url(#leafGrad1)" />
        </g>

        {/* Cluster 2: Mid-branch */}
        <g>
          <ellipse cx="150" cy="65" rx="20" ry="12" transform="rotate(20 150 65)" fill="url(#leafGrad1)" />
          <ellipse cx="175" cy="55" rx="18" ry="10" transform="rotate(-15 175 55)" fill="url(#leafGrad2)" />
          <ellipse cx="195" cy="75" rx="21" ry="11" transform="rotate(45 195 75)" fill="url(#leafGrad1)" />
          <ellipse cx="140" cy="90" rx="18" ry="10" transform="rotate(60 140 90)" fill="url(#leafGrad2)" />
          <ellipse cx="165" cy="105" rx="20" ry="11" transform="rotate(10 165 105)" fill="url(#leafGrad1)" />
        </g>

        {/* Cluster 3: Upper shoot */}
        <g>
          <ellipse cx="230" cy="65" rx="19" ry="10" transform="rotate(-30 230 65)" fill="url(#leafGrad2)" />
          <ellipse cx="260" cy="75" rx="18" ry="9" transform="rotate(10 260 75)" fill="url(#leafGrad1)" />
          <ellipse cx="290" cy="85" rx="17" ry="9" transform="rotate(35 290 85)" fill="url(#leafGrad2)" />
          <ellipse cx="240" cy="95" rx="16" ry="9" transform="rotate(-10 240 95)" fill="url(#leafGrad1)" />
        </g>

        {/* Cluster 4: Lower shoot */}
        <g>
          <ellipse cx="180" cy="150" rx="20" ry="11" transform="rotate(50 180 150)" fill="url(#leafGrad1)" />
          <ellipse cx="195" cy="180" rx="19" ry="10" transform="rotate(25 195 180)" fill="url(#leafGrad2)" />
          <ellipse cx="160" cy="195" rx="18" ry="10" transform="rotate(-40 160 195)" fill="url(#leafGrad1)" />
          <ellipse cx="180" cy="225" rx="16" ry="9" transform="rotate(30 180 225)" fill="url(#leafGrad2)" />
        </g>

        {/* Cluster 5: End of branch */}
        <g>
          <ellipse cx="260" cy="140" rx="20" ry="11" transform="rotate(30 260 140)" fill="url(#leafGrad2)" />
          <ellipse cx="290" cy="165" rx="21" ry="11" transform="rotate(60 290 165)" fill="url(#leafGrad1)" />
          <ellipse cx="320" cy="190" rx="19" ry="10" transform="rotate(40 320 190)" fill="url(#leafGrad2)" />
          <ellipse cx="345" cy="225" rx="16" ry="9" transform="rotate(70 345 225)" fill="url(#leafGrad1)" />
        </g>
      </svg>
    </div>
  );
}

export function CivicHallArt({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden pointer-events-none select-none ${className}`}>
      <svg
        viewBox="0 0 600 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-sm"
      >
        <defs>
          <linearGradient id="domeGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#87A29B" />
            <stop offset="60%" stopColor="#5E7D75" />
            <stop offset="100%" stopColor="#435C55" />
          </linearGradient>
          <linearGradient id="facadeGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E9ECE6" />
          </linearGradient>
          <radialGradient id="treeWash1" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#8A9977" />
            <stop offset="70%" stopColor="#5B7868" />
            <stop offset="100%" stopColor="#3F584C" />
          </radialGradient>
          <radialGradient id="treeWash2" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#9FB388" />
            <stop offset="65%" stopColor="#6C856E" />
            <stop offset="100%" stopColor="#4A6652" />
          </radialGradient>
          <linearGradient id="groundGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E5E9E3" stopOpacity="0" />
            <stop offset="20%" stopColor="#DDDCD3" />
            <stop offset="80%" stopColor="#DDDCD3" />
            <stop offset="100%" stopColor="#E5E9E3" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ground and Plaza */}
        <rect x="40" y="295" width="520" height="4" fill="url(#groundGrad)" rx="2" />
        <rect x="90" y="287" width="420" height="8" fill="#E5E9E3" rx="1.5" />
        <rect x="130" y="279" width="340" height="8" fill="#DDDCD3" rx="1.5" />
        <rect x="170" y="271" width="260" height="8" fill="#E9ECE6" rx="1.5" />

        {/* Distant Trees behind building */}
        <g opacity="0.45">
          <circle cx="150" cy="220" r="42" fill="url(#treeWash1)" />
          <circle cx="450" cy="220" r="42" fill="url(#treeWash2)" />
        </g>

        {/* Building Wings */}
        <rect x="165" y="180" width="270" height="92" fill="url(#facadeGrad2)" stroke="#C8CEC6" strokeWidth="1.2" />
        <line x1="165" y1="180" x2="435" y2="180" stroke="#B0B8AE" strokeWidth="2" />
        <line x1="165" y1="192" x2="435" y2="192" stroke="#DDDCD3" strokeWidth="1" />

        {/* Left Wing Windows */}
        <rect x="180" y="202" width="16" height="28" rx="8" fill="#527B7A" fillOpacity="0.2" stroke="#B0B8AE" strokeWidth="1" />
        <rect x="208" y="202" width="16" height="28" rx="8" fill="#527B7A" fillOpacity="0.2" stroke="#B0B8AE" strokeWidth="1" />
        <rect x="180" y="242" width="16" height="22" fill="#527B7A" fillOpacity="0.15" stroke="#C8CEC6" strokeWidth="1" />
        <rect x="208" y="242" width="16" height="22" fill="#527B7A" fillOpacity="0.15" stroke="#C8CEC6" strokeWidth="1" />

        {/* Right Wing Windows */}
        <rect x="376" y="202" width="16" height="28" rx="8" fill="#527B7A" fillOpacity="0.2" stroke="#B0B8AE" strokeWidth="1" />
        <rect x="404" y="202" width="16" height="28" rx="8" fill="#527B7A" fillOpacity="0.2" stroke="#B0B8AE" strokeWidth="1" />
        <rect x="376" y="242" width="16" height="22" fill="#527B7A" fillOpacity="0.15" stroke="#C8CEC6" strokeWidth="1" />
        <rect x="404" y="242" width="16" height="22" fill="#527B7A" fillOpacity="0.15" stroke="#C8CEC6" strokeWidth="1" />

        {/* Central Portico Structure */}
        <rect x="240" y="165" width="120" height="106" fill="#FFFFFF" stroke="#C8CEC6" strokeWidth="1.2" />

        {/* Classical Pediment (Triangle) */}
        <polygon points="236,165 300,112 364,165" fill="url(#facadeGrad2)" stroke="#B0B8AE" strokeWidth="1.5" />
        <polygon points="246,163 300,120 354,163" fill="#E9ECE6" fillOpacity="0.5" stroke="#DDDCD3" strokeWidth="0.8" />
        <circle cx="300" cy="146" r="7" fill="#527B7A" fillOpacity="0.4" stroke="#527B7A" strokeWidth="1" />

        {/* Classical Fluted Columns */}
        {[252, 271, 290, 309, 328, 347].map((x, i) => (
          <g key={i}>
            <rect x={x - 4} y="165" width="8" height="5" fill="#DDDCD3" />
            <rect x={x - 2.5} y="170" width="5" height="96" fill="#FAFBF9" stroke="#C8CEC6" strokeWidth="0.8" />
            <rect x={x - 4} y="266" width="8" height="5" fill="#DDDCD3" />
          </g>
        ))}

        {/* Main Central Portal Arch */}
        <path d="M288 271 L288 220 A12 12 0 0 1 312 220 L312 271 Z" fill="#355858" fillOpacity="0.35" stroke="#355858" strokeWidth="1.2" />

        {/* Dome Drum */}
        <rect x="268" y="78" width="64" height="34" fill="url(#facadeGrad2)" stroke="#B0B8AE" strokeWidth="1.2" />
        <line x1="266" y1="112" x2="334" y2="112" stroke="#B0B8AE" strokeWidth="1.5" />
        {[274, 285, 296, 307, 318].map((x, i) => (
          <rect key={i} x={x} y="84" width="7" height="18" rx="3.5" fill="#527B7A" fillOpacity="0.3" stroke="#B0B8AE" strokeWidth="0.8" />
        ))}

        {/* Grand Dome */}
        <path d="M262 78 C262 26 338 26 338 78 Z" fill="url(#domeGrad2)" stroke="#355858" strokeWidth="1.6" />
        <path d="M300 26 L300 78" stroke="#A4BEB7" strokeWidth="1.2" strokeOpacity="0.7" />
        <path d="M300 26 C285 36 276 54 274 78" stroke="#A4BEB7" strokeWidth="1" strokeOpacity="0.4" />
        <path d="M300 26 C315 36 324 54 326 78" stroke="#233A3A" strokeWidth="1" strokeOpacity="0.45" />

        {/* Lantern / Cupola */}
        <rect x="294" y="14" width="12" height="12" fill="#FFFFFF" stroke="#B0B8AE" strokeWidth="1" />
        <path d="M292 14 L300 6 L308 14 Z" fill="#5E7D75" stroke="#355858" strokeWidth="1" />
        <line x1="300" y1="6" x2="300" y2="1" stroke="#355858" strokeWidth="1.5" strokeLinecap="round" />

        {/* Foreground Trees */}
        <g>
          <ellipse cx="90" cy="245" rx="48" ry="42" fill="url(#treeWash1)" opacity="0.9" />
          <ellipse cx="130" cy="235" rx="36" ry="34" fill="url(#treeWash2)" opacity="0.85" />
          <ellipse cx="65" cy="225" rx="32" ry="30" fill="url(#treeWash2)" opacity="0.8" />
          <ellipse cx="105" cy="205" rx="28" ry="26" fill="url(#treeWash1)" opacity="0.75" />
          <path d="M90 295 C88 275 92 260 90 245 M130 295 C128 275 132 255 130 240 M65 295 C63 280 67 265 65 250" stroke="#4C5749" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        </g>

        <g>
          <ellipse cx="510" cy="245" rx="48" ry="42" fill="url(#treeWash2)" opacity="0.9" />
          <ellipse cx="470" cy="235" rx="36" ry="34" fill="url(#treeWash1)" opacity="0.85" />
          <ellipse cx="535" cy="225" rx="32" ry="30" fill="url(#treeWash1)" opacity="0.8" />
          <ellipse cx="495" cy="205" rx="28" ry="26" fill="url(#treeWash2)" opacity="0.75" />
          <path d="M510 295 C512 275 508 260 510 245 M470 295 C472 275 468 255 470 240 M535 295 C537 280 533 265 535 250" stroke="#4C5749" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
}

export function CartographicBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${className}`}>
      {/* Topographic Contours (Organic subtle lines) */}
      <svg
        className="absolute inset-0 w-full h-full opacity-35"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 800"
        preserveAspectRatio="none"
      >
        <path
          d="M-50,150 C200,80 350,220 600,120 C850,20 950,180 1050,100"
          fill="none"
          stroke="#DDDCD3"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path
          d="M-50,280 C180,210 320,380 580,260 C840,140 920,310 1050,240"
          fill="none"
          stroke="#E5E9E3"
          strokeWidth="1.2"
        />
        <path
          d="M-50,420 C150,340 300,520 560,400 C820,280 900,450 1050,380"
          fill="none"
          stroke="#DDDCD3"
          strokeWidth="1"
        />
        <path
          d="M-50,560 C120,470 280,660 540,540 C800,420 880,590 1050,520"
          fill="none"
          stroke="#E5E9E3"
          strokeWidth="1.2"
          strokeDasharray="6 3"
        />
        <path
          d="M-50,700 C90,600 260,800 520,680 C780,560 860,730 1050,660"
          fill="none"
          stroke="#DDDCD3"
          strokeWidth="1"
        />
      </svg>

      {/* Urban Street Grid on the right side */}
      <svg
        className="absolute top-0 right-0 w-1/2 h-full opacity-20"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 500 800"
      >
        <line x1="120" y1="0" x2="380" y2="800" stroke="#527B7A" strokeWidth="1.2" />
        <line x1="220" y1="0" x2="480" y2="800" stroke="#527B7A" strokeWidth="0.8" />
        <line x1="0" y1="200" x2="500" y2="120" stroke="#87917B" strokeWidth="1" />
        <line x1="0" y1="420" x2="500" y2="340" stroke="#87917B" strokeWidth="1.2" />
        <line x1="0" y1="640" x2="500" y2="560" stroke="#87917B" strokeWidth="0.8" />
        <path d="M180,180 L280,160 L310,320 L210,340 Z" fill="#D4E3DF" fillOpacity="0.3" stroke="#DDDCD3" strokeWidth="0.8" />
        <path d="M295,155 L420,130 L450,290 L325,315 Z" fill="#E5E9E3" fillOpacity="0.3" stroke="#DDDCD3" strokeWidth="0.8" />
        <path d="M225,360 L325,340 L355,500 L255,520 Z" fill="#E9ECE6" fillOpacity="0.4" stroke="#DDDCD3" strokeWidth="0.8" />
      </svg>
    </div>
  );
}
