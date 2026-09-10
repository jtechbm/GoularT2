import type { SVGProps } from "react";

/** Ícones de traço, no mesmo peso do material de marca. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.2 12 3l9 7.2" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M9.5 20v-5.5h5V20" />
  </Base>
);

export const IconUser = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c.9-3.7 3.9-5.6 7.5-5.6s6.6 1.9 7.5 5.6" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9.5" cy="8.5" r="3.2" />
    <path d="M3 19.5c.8-3.2 3.4-4.9 6.5-4.9s5.7 1.7 6.5 4.9" />
    <path d="M16.5 6.2a3.2 3.2 0 0 1 0 6" />
    <path d="M18 14.9c2 .6 3.3 2.1 3.8 4.6" />
  </Base>
);

export const IconMegaphone = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7L19 20V4L7 8.5H5.5A1.5 1.5 0 0 0 4 10Z" />
    <path d="M8 16v3.5a1.5 1.5 0 0 0 3 0V17" />
  </Base>
);

export const IconCheckSquare = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </Base>
);

export const IconChat = (p: IconProps) => (
  <Base {...p}>
    <path d="M20.5 11.6c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.6-.35L4.5 20.5l1.3-3.4A7.1 7.1 0 0 1 3.5 11.6c0-4.1 3.8-7.4 8.5-7.4s8.5 3.3 8.5 7.4Z" />
  </Base>
);

export const IconSync = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 0 1-13.7 5.6" />
    <path d="M4 12a8 8 0 0 1 13.7-5.6" />
    <path d="M17.5 3v3.6h-3.6" />
    <path d="M6.5 21v-3.6h3.6" />
  </Base>
);

export const IconBarChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 20v-6" />
    <path d="M12 20V7" />
    <path d="M19 20v-9" />
  </Base>
);

export const IconDollar = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.3c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2c1.9.4 2.9 1 2.9 2.2s-1.2 2-2.9 2c-1.3 0-2.3-.5-2.8-1.5" />
    <path d="M12 6.4v11.2" />
  </Base>
);

export const IconTrendUp = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
    <path d="M15.5 6.5h5v5" />
  </Base>
);

export const IconReceipt = (p: IconProps) => (
  <Base {...p}>
    <path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.1-1.5-2.2 1.5Z" />
    <path d="M9 9h6" />
    <path d="M9 13h6" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
    <path d="M10.2 19a2 2 0 0 0 3.6 0" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.8h17" />
    <path d="M8 3.5v3" />
    <path d="M16 3.5v3" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
);

export const IconPower = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5v8" />
    <path d="M17.5 6.8a7.5 7.5 0 1 1-11 0" />
  </Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Base>
);

export const IconMoon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

/**
 * Marca Elleva — o PNG original da marca.
 * Duas versões do mesmo arquivo: a original e uma com os tons escuros
 * clareados, trocadas por CSS conforme o tema (ver globals.css).
 * Geradas por `npm run gerar-logo`.
 */
export function EllevaMark({ size = 30 }: { size?: number }) {
  const props = {
    width: size,
    height: Math.round((size * 277) / 320),
    alt: "",
    "aria-hidden": true as const,
    draggable: false,
  };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" className="logo-claro" {...props} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.png" className="logo-escuro" {...props} />
    </>
  );
}

export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Base>
);
