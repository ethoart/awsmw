
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus } from '../types';
import { OrderList } from './OrderList';
import { RotateCcw, Scan, RotateCw, History, CheckCircle, ListFilter, ClipboardCheck, RefreshCw, Calendar, AlertTriangle } from 'lucide-react';
import { getSLDateString, getReturnCompletionDate } from '../utils/helpers';

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
  
  // Date Filters
  const [startDate, setStartDate] = useState(getSLDateString());
  const [endDate, setEndDate] = useState(getSLDateString());

  // Scan Feedback
  const [scanResult, setScanResult] = useState<{ msg: string, type: 'success' | 'warning' | 'error' } | null>(null);

  const load = async () => {
    const fetched = await db.getOrders({ tenantId, limit: 10000 });
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
    setScanResult(null);
    try {
      const result: any = await db.processReturn(scanInput, tenantId);
      if (result) {
        if (result.alreadyProcessed) {
            setScanResult({ msg: `ALREADY SCANNED: ${result.customerName}`, type: 'warning' });
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3').play(); } catch(e){}
        } else {
            setScanResult({ msg: `SUCCESS: Restocked ${result.customerName}`, type: 'success' });
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play(); } catch(e){}
            setRefreshKey(prev => prev + 1);
        }
        setScanInput('');
      } else {
        setScanResult({ msg: "REFERENCE NOT FOUND", type: 'error' });
      }
    } catch(e) {
        setScanResult({ msg: "SYSTEM ERROR", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredOrders = useMemo(() => {
      return orders.filter(o => {
          // Date Filter Logic
          if (o.status === OrderStatus.RETURN_COMPLETED) {
              // Use robust date helper to get the actual return completion date (from timestamp or logs)
              const rawReturnDate = getReturnCompletionDate(o);
              const completedDate = getSLDateString(new Date(rawReturnDate));
              return completedDate >= startDate && completedDate <= endDate;
          } else {
              // For pending/other returns, usually we want to see them all, or filter by created/updated
              // Here we filter by creation date to keep it consistent if user wants history
              const createdDate = getSLDateString(new Date(o.createdAt));
              return createdDate >= startDate && createdDate <= endDate;
          }
      });
  }, [orders, startDate, endDate]);

  const counts = useMemo(() => {
    const stats = {
      ALL: 0,
      RETURNED: 0,
      RETURN_TRANSFER: 0,
      RETURN_AS_ON_SYSTEM: 0,
      RETURN_HANDOVER: 0,
      RETURN_COMPLETED: 0
    };
    
    // Calculate counts based on filtered orders
    filteredOrders.forEach(o => {
        const s = o.status as keyof typeof stats;
        if (stats[s] !== undefined) {
          stats[s]++;
          stats.ALL++;
        }
    });
    return stats;
  }, [filteredOrders]);

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
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-blue-600 text-white rounded-[2rem] shadow-xl rotate-3">
            <RotateCcw size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} Returns Hub</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Logistics Reversal & Restock Controller</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Date Picker */}
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar size={14} className="text-blue-600" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
                <span className="text-[10px] font-black text-slate-300 mx-1">TO</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
            </div>

            <form onSubmit={handleScan} className="relative w-full md:w-80">
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
            <button 
                onClick={() => setRefreshKey(prev => prev + 1)} 
                className="p-4 bg-white border-2 border-slate-100 rounded-[1.5rem] text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
            >
                <RefreshCw size={20} />
            </button>
        </div>
      </div>

      {scanResult && (
          <div className={`mx-2 p-4 rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs shadow-lg animate-bounce ${
              scanResult.type === 'success' ? 'bg-emerald-500 text-white' : 
              scanResult.type === 'warning' ? 'bg-amber-400 text-black' : 'bg-rose-600 text-white'
          }`}>
              {scanResult.type === 'warning' ? <AlertTriangle size={18}/> : scanResult.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
              {scanResult.msg}
          </div>
      )}

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
        {/* Pass filtered list explicitly? OrderList fetches internally. 
            We need to pass filters to OrderList OR use a different approach.
            OrderList accepts startDate and endDate. We can pass those.
        */}
        <OrderList 
          key={refreshKey}
          tenantId={tenantId} 
          onSelectOrder={onSelectOrder} 
          status={activeFilter as any}
          logisticsOnly={true}
          startDate={startDate}
          endDate={endDate}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
};
