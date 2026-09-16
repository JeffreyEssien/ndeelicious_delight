import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement>;
const p = { fill:"none", stroke:"currentColor", strokeWidth:1.8, strokeLinecap:"round" as const, strokeLinejoin:"round" as const };
export const Icon = ({name,...props}:Props & {name:string}) => {
  const paths:Record<string,React.ReactNode> = {
    bag:<><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></>, menu:<><path d="M4 8h16M4 16h16"/></>, close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    arrow:<><path d="M5 12h14M14 7l5 5-5 5"/></>, chevron:<path d="m9 6 6 6-6 6"/>, check:<path d="m5 12 4 4L19 6"/>, plus:<path d="M12 5v14M5 12h14"/>, minus:<path d="M5 12h14"/>,
    heart:<path d="M20 9c0 5-8 10-8 10S4 14 4 9a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9Z"/>,
    user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3-6 7-6s6.2 2 7 6"/></>,
    truck:<><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, upload:<><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v5h16v-5"/></>,
    grid:<><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    orders:<><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>, box:<><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
    coupon:<><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M12 7v12" strokeDasharray="2 2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
    logout:<><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
    more:<><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...props}>{paths[name] ?? paths.arrow}</svg>;
};
