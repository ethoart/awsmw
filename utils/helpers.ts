
import { CustomerStatus, Order } from '../types';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount || 0);
};

export const formatFullNumber = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(num || 0);
};

/**
 * Returns YYYY-MM-DD in Sri Lanka Time (UTC+5:30)
 */
export const getSLDateString = (date: Date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

/**
 * Robustly determines when a return was processed.
 * 1. Checks `returnCompletedAt` (New Schema)
 * 2. Checks `logs` for "Return Processed" message (Legacy with Logs)
 * 3. Fallback to `createdAt` (Legacy without Logs - unlikely)
 */
export const getReturnCompletionDate = (order: Order): string => {
    if (order.returnCompletedAt) return order.returnCompletedAt;
    
    if (order.logs && order.logs.length > 0) {
        // Search logs for the specific return action
        const returnLog = [...order.logs].reverse().find(l => 
            l.message.includes('Return Processed') || 
            l.message.includes('RETURN_COMPLETED')
        );
        if (returnLog) return returnLog.timestamp;
    }
    
    return order.createdAt;
};

/**
 * Determines the relevant "Activity Date" for an order based on its current status.
 * Used for operational views (Returns, Residuals) where Creation Date is irrelevant.
 */
export const getOrderActivityDate = (order: Order): string => {
    // 1. Explicit Timestamp Fields
    if (order.status === 'RETURN_COMPLETED' && order.returnCompletedAt) return order.returnCompletedAt;
    if (order.status === 'DELIVERED' && order.deliveredAt) return order.deliveredAt;
    if (order.status === 'SHIPPED' && order.shippedAt) return order.shippedAt;
    if (order.status === 'CONFIRMED' && order.confirmedAt) return order.confirmedAt;

    // 2. Log Scanning for Status Entry
    // Finds the most recent log that mentions the current status
    if (order.logs && order.logs.length > 0) {
        const currentStatus = order.status;
        const keywords = [currentStatus, currentStatus.replace('_', ' ')];
        
        const relevantLog = [...order.logs].reverse().find(l => 
            keywords.some(k => l.message.toUpperCase().includes(k))
        );
        if (relevantLog) return relevantLog.timestamp;
    }

    // 3. Fallback to Creation Date
    return order.createdAt;
};

export const getCustomerStatusColor = (status: CustomerStatus) => {
  switch (status) {
    case CustomerStatus.RISK_RED: return 'bg-red-100 text-red-700 border border-red-200';
    case CustomerStatus.RISK_ORANGE: return 'bg-orange-100 text-orange-700 border border-orange-200';
    case CustomerStatus.REGULAR: return 'bg-blue-100 text-blue-700 border border-blue-200';
    default: return 'bg-gray-100 text-gray-600 border border-gray-200';
  }
};

export const parseCSV = (text: string) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Robust CSV splitting (handles quotes with commas)
  const splitCSVLine = (line: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitCSVLine(lines[0].toLowerCase());
  
  // Heuristic header mapping
  const findIndex = (aliases: string[]) => 
    headers.findIndex(h => aliases.some(alias => h.includes(alias)));

  const nameIdx = findIndex(['name', 'customer', 'client', 'full_name', 'consignee']);
  const addrIdx = findIndex(['address', 'street', 'location', 'town', 'full_address']);
  const phoneIdx = findIndex(['phone', 'mobile', 'contact', 'tel', 'number']);

  // Fallback to columns 0, 1, 2 if detection fails
  const finalNameIdx = nameIdx !== -1 ? nameIdx : 0;
  const finalAddrIdx = addrIdx !== -1 ? addrIdx : 1;
  const finalPhoneIdx = phoneIdx !== -1 ? phoneIdx : 2;

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    const clean = (val: string) => (val || '').replace(/^"|"$/g, '').trim();

    const name = clean(parts[finalNameIdx]);
    const address = clean(parts[finalAddrIdx]);
    const phone = clean(parts[finalPhoneIdx]).replace('p:', '').replace(/\s/g, '');

    if (name && address && phone) {
      results.push({ name, address, phone });
    }
  }
  return results;
};
