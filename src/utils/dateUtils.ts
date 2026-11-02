/**
 * Standard date formatting utility across the POS system.
 * Formats any date into dd/mm/yyyy (e.g., 08/10/2026).
 */
export const formatDateDDMMYYYY = (dateInput: string | number | Date | null | undefined): string => {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Formats time into 12-hour AM/PM format (e.g., 12:15 PM, 04:30 AM).
 */
export const formatTimeAMPM = (dateInput: string | number | Date | null | undefined): string => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes} ${ampm}`;
};

/**
 * Formats date with time into dd/mm/yyyy hh:mm AM/PM (or dd/mm/yyyy)
 */
export const formatDateTimeDDMMYYYY = (dateInput: string | number | Date | null | undefined, includeTime = false): string => {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  if (!includeTime) {
    return `${day}/${month}/${year}`;
  }

  const timeStr = formatTimeAMPM(d);
  return `${day}/${month}/${year} ${timeStr}`;
};

/**
 * Formats amount without trailing zeros (e.g. 6600.00 -> "6600", 6600.50 -> "6600.5", 0.00 -> "0")
 */
export const formatAmount = (val: number | string | null | undefined): string => {
  const num = Number(val || 0);
  return Number(num.toFixed(2)).toString();
};
