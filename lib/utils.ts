import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the current date in Pakistan Standard Time (PKT) as YYYY-MM-DD.
 * This ensures consistency regardless of server location (e.g. USA).
 */
export function getTodayPKT(): string {
  // Create a date object with the current time
  const now = new Date()

  // Format it to 'en-CA' (YYYY-MM-DD) using 'Asia/Karachi' timezone
  // This uses the built-in Intl API which is standard in Node.js and Browsers
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
}
/**
 * Returns tomorrow's date in Pakistan Standard Time (PKT) as YYYY-MM-DD.
 */
export function getTomorrowPKT(): string {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
}

/**
 * Returns the next day for a given date string (YYYY-MM-DD) in PKT.
 */
export function getNextDate(dateStr: string): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + 1)
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
}
