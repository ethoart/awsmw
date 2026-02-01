
import { CustomerStatus } from '../types';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
  }).format(amount || 0);
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
  const lines = text.split('\n');
  const result = [];
  
  // Find header indices to be format-agnostic
  const header = lines[0].toLowerCase().split(',');
  const nameIdx = header.indexOf('full_name');
  const addrIdx = header.indexOf('street_address');
  const phoneIdx = header.indexOf('phone');

  // If headers don't match, fallback to 0, 1, 2
  const finalNameIdx = nameIdx !== -1 ? nameIdx : 0;
  const finalAddrIdx = addrIdx !== -1 ? addrIdx : 1;
  const finalPhoneIdx = phoneIdx !== -1 ? phoneIdx : 2;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle quoted values (common in addresses with commas)
    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (parts && parts.length >= 2) {
      const clean = (val: string) => val.replace(/^"|"$/g, '').trim();
      result.push({
        name: clean(parts[finalNameIdx] || ''),
        address: clean(parts[finalAddrIdx] || ''),
        phone: clean(parts[finalPhoneIdx] || '').replace('p:', '')
      });
    }
  }
  return result;
};
