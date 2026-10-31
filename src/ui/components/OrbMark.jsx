import React from 'react';

/** ORB brand mark: a glossy sphere. */
export function OrbMark({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="orb-gradient" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="45%" stopColor="#17deb3" />
          <stop offset="100%" stopColor="#064e3b" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="url(#orb-gradient)" />
      <ellipse
        cx="11.5"
        cy="10.5"
        rx="4.5"
        ry="3"
        fill="#ffffff"
        opacity="0.35"
        transform="rotate(-25 11.5 10.5)"
      />
    </svg>
  );
}

export default OrbMark;
