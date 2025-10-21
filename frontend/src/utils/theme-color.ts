/** Canvas exports need resolved colors, CSS variable strings are not canvas colors. */
export function themeColor(role: string) { return getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim(); }
