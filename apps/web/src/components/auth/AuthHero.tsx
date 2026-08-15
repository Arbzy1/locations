import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const ARCS = [
  { d: 'M 268 248 C 340 180, 470 170, 538 232', color: 'var(--accent)', delay: 0 },
  { d: 'M 538 232 C 620 280, 640 390, 568 428', color: 'var(--visit)', delay: 0.7 },
  { d: 'M 268 248 C 200 340, 230 470, 332 548', color: 'var(--walk)', delay: 1.4 },
  { d: 'M 332 548 C 430 600, 530 520, 568 428', color: 'var(--accent)', delay: 2.1 },
];

const DOTS = [
  { cx: 268, cy: 248 },
  { cx: 538, cy: 232 },
  { cx: 568, cy: 428 },
  { cx: 332, cy: 548 },
  { cx: 400, cy: 360 },
];

export default function AuthHero() {
  const reduce = useReducedMotion();
  const rawId = useId();
  const id = rawId.replace(/:/g, '');
  const clip = `${id}-globe`;
  const fill = `${id}-fill`;
  const glow = `${id}-glow`;

  return (
    <div className="relative h-full min-h-full w-full overflow-hidden bg-bg">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)',
        }}
      />
      <svg
        viewBox="0 0 800 800"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={fill} cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="55%" stopColor="var(--surface)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--bg)" stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id={glow} cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.35" />
          </radialGradient>
          <clipPath id={clip}>
            <circle cx="400" cy="390" r="220" />
          </clipPath>
        </defs>

        <circle cx="400" cy="390" r="236" fill={`url(#${glow})`} />
        <circle cx="400" cy="390" r="220" fill={`url(#${fill})`} stroke="var(--border)" strokeWidth="1.5" />

        <g clipPath={`url(#${clip})`} fill="none" stroke="var(--border)" strokeOpacity="0.7">
          {[80, 140, 180, 210].map((rx) => (
            <ellipse key={rx} cx="400" cy="390" rx={rx} ry="220" strokeWidth="1" />
          ))}
          {[-70, -35, 0, 35, 70].map((dx) => (
            <ellipse key={dx} cx={400 + dx} cy="390" rx={Math.max(28, 90 - Math.abs(dx) * 0.4)} ry="220" strokeWidth="1" />
          ))}
          {[-120, -60, 0, 60, 120].map((dy) => (
            <ellipse key={dy} cx="400" cy={390 + dy} rx="220" ry={Math.max(18, 70 - Math.abs(dy) * 0.25)} strokeWidth="1" />
          ))}
          <path
            d="M 250 300 C 310 250, 370 255, 430 280 C 490 305, 530 300, 570 270 L 580 340 C 520 390, 470 420, 400 430 C 330 440, 280 400, 240 360 Z"
            fill="var(--accent)"
            fillOpacity="0.12"
            stroke="none"
          />
          <path
            d="M 290 470 C 340 450, 400 455, 460 480 C 500 500, 520 540, 490 560 C 430 580, 360 570, 310 540 Z"
            fill="var(--visit)"
            fillOpacity="0.1"
            stroke="none"
          />
        </g>

        {ARCS.map((arc) => (
          <motion.path
            key={arc.d}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth="2"
            strokeLinecap="round"
            initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
            animate={reduce ? { opacity: 0.7 } : { pathLength: 1, opacity: 0.85 }}
            transition={
              reduce
                ? { duration: 0.08 }
                : {
                    pathLength: {
                      duration: 3.6,
                      delay: arc.delay,
                      repeat: Infinity,
                      repeatType: 'reverse',
                      ease: 'easeInOut',
                    },
                    opacity: { duration: 0.5, delay: arc.delay },
                  }
            }
          />
        ))}

        {DOTS.map((dot) => (
          <motion.circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r="5"
            fill="var(--accent)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0.08 } : { duration: 0.45, delay: 0.2 }}
          />
        ))}
      </svg>
    </div>
  );
}
