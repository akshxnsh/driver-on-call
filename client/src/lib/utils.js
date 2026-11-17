import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets later Tailwind classes win over earlier ones (the helper 21st.dev components expect). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
