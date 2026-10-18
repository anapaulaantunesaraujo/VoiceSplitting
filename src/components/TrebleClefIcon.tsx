import React from 'react';

interface TrebleClefIconProps {
  className?: string;
  size?: number | string;
  color?: string;
}

export const TrebleClefIcon: React.FC<TrebleClefIconProps> = ({
  className = "w-6 h-6",
  size,
  color = "#00c2cb"
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ filter: 'drop-shadow(0 2px 8px rgba(0, 194, 203, 0.4))' }}
    >
      {/* Sleek Minimalist Vector Treble Clef (Clave de Sol) */}
      <path
        d="M12 21.5C10.6 21.5 9.5 20.4 9.5 19C9.5 17.6 10.6 16.5 12 16.5C13.4 16.5 14.5 17.6 14.5 19C14.5 20.4 13.4 21.5 12 21.5Z"
        fill={color}
      />
      <path d="M12 16.5V2.5" />
      <path d="M12 2.5C9.5 2.5 7.5 4.5 7.5 7C7.5 10 12 12 12 15C12 17.5 10 19.5 7.5 19.5C5.5 19.5 4 18 4 16C4 13.5 6.5 12 8.5 12" />
    </svg>
  );
};

export default TrebleClefIcon;
