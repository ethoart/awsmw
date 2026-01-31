
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus } from '../types';
import { OrderList } from './OrderList';
import { RotateCcw, Scan, RotateCw, History, CheckCircle, ListFilter, ClipboardCheck } from 'lucide-react';

interface ReturnManagementProps {
  tenantId: string;
  shopName: string;
  onSelectOrder: (id: string) => void;
}

export const ReturnManagement: React.FC<ReturnManagementProps> = ({ tenantId, shopName, onSelectOrder }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [scanInput, setScanInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const fetched = await db.getOrders(tenantId);
    setOrders(fetched.data || []);
  };

  useEffect(() => {
    load();
    const focusTimer = setInterval(() => {
      if (document.activeElement !== scanRef.current) scanRef.current?.focus();
    }, 1500);
    return () => clearInterval(focusTimer);
  }, [tenantId, refreshKey]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await db.processReturn(scanInput, tenantId);
      if (result) {
        alert(`Success: ${result.customerName} Order Restocked and Completed.`);
        setRefreshKey(prev => prev + 1);
        setScanInput('');
      } else {
        alert("Reference Not Found: Ensure the tracking number or ID is correct.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const counts = useMemo(() => {
    const stats = {
      ALL: 0,
      RETURNED: 0,
      RETURN_TRANSFER: 0,
      RETURN_AS_ON_SYSTEM: 0,
      RETURN_HANDOVER: 0,
      RETURN_COMPLETED: 0
    };
    if (Array.isArray(orders)) {
      orders.forEach(o => {
        const s = o.status as keyof typeof stats;
        if (stats[s] !== undefined) {
          stats[s]++;
          stats.ALL++;
        }
      });
    }
    return stats;
  }, [orders]);

  const filters = [
    { label: 'ALL RETURNS', status: 'ALL', icon: <ListFilter size={14}/>, count: counts.ALL },
    { label: 'RETURNED', status: OrderStatus.RETURNED, icon: <RotateCcw size={14}/>, count: counts.RETURNED },
    { label: 'TRANSFER', status: OrderStatus.RETURN_TRANSFER, icon: <RotateCw size={14}/>, count: counts.RETURN_TRANSFER },
    { label: 'AS ON SYSTEM', status: OrderStatus.RETURN_AS_ON_SYSTEM, icon: <History size={14}/>, count: counts.RETURN_AS_ON_SYSTEM },
    { label: 'PENDING (HANDOVER)', status: OrderStatus.RETURN_HANDOVER, icon: <ClipboardCheck size={14}/>, count: counts.RETURN_HANDOVER },
    { label: 'COMPLETED', status: OrderStatus.RETURN_COMPLETED, icon: <CheckCircle size={14}/>, count: counts.RETURN_COMPLETED },
  ];

  return (
    <div className="space-y-8 animate-slide-in max-w-[1400px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-blue-600 text-white rounded-[2rem] shadow-xl rotate-3">
            <RotateCcw size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} Returns Hub</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Logistics Reversal & Restock Controller</p>
          </div>
        </div>

        <form onSubmit={handleScan} className="relative w-full md:w-96">
          <input 
            ref={scanRef}
            className="w-full bg-white border-2 border-slate-100 rounded-[1.5rem] pl-12 pr-4 py-4 text-sm font-black outline-none focus:border-blue-600 shadow-sm transition-all"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            placeholder="Scan ID to Restock & Complete..."
          />
          <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          {isProcessing && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>}
        </form>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-2.5 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.status}
            onClick={() => setActiveFilter(f.status as any)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeFilter === f.status ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-50 hover:text-black'}`}
          >
            {f.icon} {f.label}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] ${activeFilter === f.status ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm min-h-[600px] overflow-hidden">
        <OrderList 
          tenantId={tenantId} 
          onSelectOrder={onSelectOrder} 
          status={activeFilter as any}
          logisticsOnly={true}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
};
