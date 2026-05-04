// Framer Motion animation constants — "Neon Metropolitan" Motion System

export const SNAPPY = { type: "spring" as const, stiffness: 400, damping: 30 };
export const SMOOTH = { type: "tween" as const, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const };
export const SUBTLE = { type: "tween" as const, duration: 0.2, ease: "easeOut" as const };
export const POP = { type: "tween" as const, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

// Stagger children by 100ms
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...POP } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { ...SMOOTH } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { ...SNAPPY } },
};

export const slideInRight = {
  hidden: { opacity: 0, x: 30 },
  show: { opacity: 1, x: 0, transition: { ...SMOOTH } },
};

// Card hover animation
export const cardHover = {
  y: -4,
  transition: { type: "spring" as const, stiffness: 300, damping: 20 },
};

// Button press animation
export const buttonTap = { scale: 0.97 };

// Modal variants
export const modalBackdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { ...SNAPPY } },
  exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } },
};
