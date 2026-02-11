
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus, Product } from '../types';
import { OrderList } from './OrderList';
import { PhoneForwarded, ListFilter, Pause, RefreshCcw, RefreshCw, Box, ChevronDown, Calendar } from 'lucide-react';
import { getSLDateString, getOrderActivityDate } from '../utils/helpers';

interface ResidualManagementProps {
  tenantId: string;
  shopName: string;
  onSelectOrder: (id: string) => void;
}

export const ResidualManagement: React.FC<ResidualManagementProps> = ({ tenantId, shopName, onSelectOrder }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  // Date Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const fetchData = async () => {
        const [fetchedOrders, fetchedProducts] = await Promise.all([
            db.getOrders({ tenantId, limit: 10000 }),
            db.getProducts(tenantId)
        ]);
        setOrders(fetchedOrders.data || []);
        setProducts(fetchedProducts || []);
    };
    fetchData();
  }, [tenantId, refreshKey]);

  const applyPreset = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
    const end = new Date();
    const start = new Date();
    if (preset === 'WEEK') start.setDate(end.getDate() - 7);
    if (preset === 'MONTH') start.setMonth(end.getMonth() - 1);
    if (preset === 'YEAR') start.setFullYear(end.getFullYear() - 1);
    
    setStartDate(getSLDateString(start));
    setEndDate(getSLDateString(end));
  };

  const filteredOrders = useMemo(() => {
      return orders.filter(o => {
          // Status filter logic
          if (activeFilter !== 'ALL' && o.status !== activeFilter) {
              return false;
          } else if (activeFilter === 'ALL') {
              if (![OrderStatus.RESIDUAL, OrderStatus.REARRANGE].includes(o.status)) return false;
          }

          // Product Filter
          if (selectedProductId !== 'ALL' && !o.items.some(i => i.productId === selectedProductId)) return false;

          // Smart Date Filter Logic (Use Activity Date)
          const activityDate = getSLDateString(new Date(getOrderActivityDate(o)));
          if (startDate && activityDate < startDate) return false;
          if (endDate && activityDate > endDate) return false;

          return true;
      });
  }, [orders, activeFilter, startDate, endDate, selectedProductId]);

  const counts = useMemo(() => {
    const stats = {
      ALL: 0,
      RESIDUAL: 0,
      REARRANGE: 0
    };
    
    orders.forEach(o => {
        // Base Filters
        if (selectedProductId !== 'ALL' && !o.items.some(i => i.productId === selectedProductId)) return;
        const activityDate = getSLDateString(new Date(getOrderActivityDate(o)));
        if (startDate && activityDate < startDate) return;
        if (endDate && activityDate > endDate) return;

        if ([OrderStatus.RESIDUAL, OrderStatus.REARRANGE].includes(o.status)) {
            stats.ALL++;
            const s = o.status as keyof typeof stats;
            if (stats[s] !== undefined) stats[s]++;
        }
    });
    return stats;
  }, [orders, startDate, endDate, selectedProductId]);

  const filters = [
    { label: 'ALL RESCHEDULED', status: 'ALL', icon: <ListFilter size={14}/>, count: counts.ALL },
    { label: 'RESCHEDULE', status: OrderStatus.RESIDUAL, icon: <Pause size={14}/>, count: counts.RESIDUAL },
    { label: 'REARRANGE', status: OrderStatus.REARRANGE, icon: <RefreshCcw size={14}/>, count: counts.REARRANGE },
  ];

  return (
    <div className="space-y-8 animate-slide-in max-w-[1400px] mx-auto pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-end gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-slate-900 text-white rounded-[2rem] shadow-xl rotate-3">
            <PhoneForwarded size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} Reschedule</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Recovery Terminal for Rescheduled Leads</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 w-full xl:w-auto">
            {/* Presets */}
            <div className="flex gap-2 p-1 bg-white border border-slate-100 rounded-xl shadow-sm">
                {(['TODAY', 'WEEK', 'MONTH', 'YEAR'] as const).map(p => (
                    <button key={p} onClick={() => applyPreset(p)} className="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        {p}
                    </button>
                ))}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 w-full">
                {/* Product Select */}
                <div className="bg-white px-4 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-3 relative min-w-[200px] w-full md:w-auto">
                    <Box size={14} className="text-slate-900" />
                    <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full text-[10px] font-black text-slate-900 outline-none uppercase bg-transparent cursor-pointer appearance-none">
                        <option value="ALL">ALL PRODUCTS</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-4 text-slate-400 pointer-events-none" />
                </div>

                {/* Date Picker */}
                <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-[1.5rem] border border-slate-200 shadow-sm w-full md:w-auto justify-center">
                    <Calendar size={14} className="text-slate-900" />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
                    <span className="text-[10px] font-black text-slate-300 mx-1">TO</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
                </div>

                <button 
                    onClick={() => setRefreshKey(prev => prev + 1)} 
                    className="p-3 bg-white border border-slate-200 rounded-[1.5rem] text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
                >
                    <RefreshCw size={20} />
                </button>
            </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-2.5 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.status}
            onClick={() => setActiveFilter(f.status as any)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeFilter === f.status ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-50 hover:text-black'}`}
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
          key={refreshKey}
          tenantId={tenantId} 
          onSelectOrder={onSelectOrder} 
          data={filteredOrders}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
};
