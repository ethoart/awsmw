
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../services/mockBackend';
import { OrderList } from './OrderList';
import { Order, OrderStatus, TenantSettings } from '../types';
import { formatCurrency, getSLDateString, getOrderActivityDate } from '../utils/helpers';
import { Truck, MapPin, RotateCw, Archive, CheckCircle, Calendar, ListFilter, ArrowRightLeft, RefreshCw, Box, ChevronDown } from 'lucide-react';
import { BillPrintView } from '../components/BillPrintView';

interface ShippingPipelineProps {
  tenantId: string;
  shopName: string;
  onSelectOrder: (id: string) => void;
}

export const ShippingPipeline: React.FC<ShippingPipelineProps> = ({ tenantId, shopName, onSelectOrder }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'LOGISTICS_ALL' | 'TODAY_SHIPPED'>('LOGISTICS_ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Date Filters (Default to last 30 days to show recent activity)
  const [startDate, setStartDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return getSLDateString(d);
  });
  const [endDate, setEndDate] = useState(getSLDateString());

  const load = useCallback(async () => {
    setLoading(true);
    try {
        const [fetchedOrders, fetchedTenant] = await Promise.all([
            db.getOrders({ tenantId, limit: 5000, status: 'LOGISTICS_ALL' }), // Fetch active logistics pool
            db.getTenant(tenantId)
        ]);
        setOrders(fetchedOrders.data || []);
        if (fetchedTenant) setTenantSettings(fetchedTenant.settings);
    } catch (e) {
        console.error("Logistics sync failed", e);
    } finally {
        setLoading(false);
    }
  }, [tenantId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const filteredOrders = useMemo(() => {
      let filtered = orders;

      // 1. Filter by Status
      if (activeFilter !== 'LOGISTICS_ALL' && activeFilter !== 'TODAY_SHIPPED') {
          filtered = filtered.filter(o => o.status === activeFilter);
      } else if (activeFilter === 'TODAY_SHIPPED') {
          const today = getSLDateString();
          filtered = filtered.filter(o => {
              const shipped = o.shippedAt ? getSLDateString(new Date(o.shippedAt)) : '';
              return shipped === today;
          });
      }

      // 2. Filter by Date (Activity Based)
      // We only apply date filter if explicit dates are set. 
      // For 'LOGISTICS_ALL', we might want to see everything active, 
      // but for performance and relevance, filtering by activity date is better.
      if (startDate || endDate) {
          filtered = filtered.filter(o => {
              const activityDate = getSLDateString(new Date(getOrderActivityDate(o)));
              if (startDate && activityDate < startDate) return false;
              if (endDate && activityDate > endDate) return false;
              return true;
          });
      }

      // 3. Sort by Activity Date (Newest First)
      return filtered.sort((a, b) => {
          const dateA = new Date(getOrderActivityDate(a)).getTime();
          const dateB = new Date(getOrderActivityDate(b)).getTime();
          return dateB - dateA;
      });
  }, [orders, activeFilter, startDate, endDate]);

  const counts = useMemo(() => {
      const stats: Record<string, number> = {
          LOGISTICS_ALL: 0,
          TODAY_SHIPPED: 0,
          [OrderStatus.SHIPPED]: 0,
          [OrderStatus.TRANSFER]: 0,
          [OrderStatus.RETURN_TRANSFER]: 0,
          [OrderStatus.DELIVERY]: 0,
          [OrderStatus.DELIVERED]: 0,
          [OrderStatus.RESIDUAL]: 0,
          [OrderStatus.RETURNED]: 0,
          [OrderStatus.RETURN_COMPLETED]: 0
      };

      const today = getSLDateString();

      // Count based on the date-filtered set (to match view) or all orders?
      // Usually counts should reflect the current date filter context.
      orders.forEach(o => {
          // Date Filter Check
          const activityDate = getSLDateString(new Date(getOrderActivityDate(o)));
          if (startDate && activityDate < startDate) return;
          if (endDate && activityDate > endDate) return;

          stats.LOGISTICS_ALL++;
          
          if (stats[o.status] !== undefined) {
              stats[o.status]++;
          }

          const shippedDate = o.shippedAt ? getSLDateString(new Date(o.shippedAt)) : '';
          if (shippedDate === today) {
              stats.TODAY_SHIPPED++;
          }
      });

      return stats;
  }, [orders, startDate, endDate]);

  const filters = [
    { label: 'ALL LOGISTICS', status: 'LOGISTICS_ALL', icon: <ListFilter size={14} />, count: counts.LOGISTICS_ALL },
    { label: 'TODAY DISPATCHED', status: 'TODAY_SHIPPED', icon: <Calendar size={14} />, count: counts.TODAY_SHIPPED },
    { label: 'SHIPPED', status: OrderStatus.SHIPPED, icon: <Truck size={14} />, count: counts[OrderStatus.SHIPPED] },
    { label: 'TRANSFER', status: OrderStatus.TRANSFER, icon: <ArrowRightLeft size={14} />, count: counts[OrderStatus.TRANSFER] }, 
    { label: 'RETURN TRANSFER', status: OrderStatus.RETURN_TRANSFER, icon: <ArrowRightLeft size={14} className="rotate-180"/>, count: counts[OrderStatus.RETURN_TRANSFER] },
    { label: 'DELIVERY', status: OrderStatus.DELIVERY, icon: <MapPin size={14} />, count: counts[OrderStatus.DELIVERY] },
    { label: 'DELIVERED', status: OrderStatus.DELIVERED, icon: <CheckCircle size={14} />, count: counts[OrderStatus.DELIVERED] },
    { label: 'RESIDUAL', status: OrderStatus.RESIDUAL, icon: <RotateCw size={14} />, count: counts[OrderStatus.RESIDUAL] },
    { label: 'RETURNED', status: OrderStatus.RETURNED, icon: <Archive size={14} />, count: counts[OrderStatus.RETURNED] },
    { label: 'RETURN COMPLETED', status: OrderStatus.RETURN_COMPLETED, icon: <CheckCircle size={14} />, count: counts[OrderStatus.RETURN_COMPLETED] },
  ];

  const handleBulkPrint = async (ids: string[]) => {
    if (!tenantSettings) return;
    
    const printContainer = document.createElement('div');
    printContainer.className = 'print-only';
    document.body.appendChild(printContainer);
    const root = createRoot(printContainer);
    
    // Find orders from local state first to avoid refetch
    const ordersToPrint = ids.map(id => orders.find(o => o.id === id)).filter(Boolean) as Order[];
    
    root.render(
      <div className="space-y-10">
        {ordersToPrint.map(o => <BillPrintView key={o.id} order={o} settings={tenantSettings} />)}
      </div>
    );
    
    setTimeout(() => {
        window.print();
        root.unmount();
        document.body.removeChild(printContainer);
    }, 800);
  };

  const applyPreset = (preset: 'TODAY' | 'WEEK' | 'MONTH') => {
    const end = new Date();
    const start = new Date();
    if (preset === 'WEEK') start.setDate(end.getDate() - 7);
    if (preset === 'MONTH') start.setMonth(end.getMonth() - 1);
    
    setStartDate(getSLDateString(start));
    setEndDate(getSLDateString(end));
  };

  return (
    <div className="space-y-6 animate-slide-in max-w-[1600px] mx-auto pb-20 px-2">
      <div className="flex flex-col xl:flex-row justify-between items-end gap-6">
        <div className="flex items-center gap-4">
            <div className="p-4 bg-black text-white rounded-[2rem] shadow-xl rotate-3">
                <Truck size={28} />
            </div>
            <div>
                <h2 className="text-3xl font-black text-black tracking-tighter uppercase leading-none">{shopName} Logistics</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Shipment Tracking & Status Control</p>
            </div>
        </div>

        <div className="flex flex-col items-end gap-3 w-full xl:w-auto">
            <div className="flex gap-2 p-1 bg-white border border-slate-100 rounded-xl shadow-sm">
                {(['TODAY', 'WEEK', 'MONTH'] as const).map(p => (
                    <button key={p} onClick={() => applyPreset(p)} className="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        {p}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-[1.5rem] border border-slate-200 shadow-sm grow xl:grow-0 justify-center">
                    <Calendar size={14} className="text-slate-900" />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
                    <span className="text-[10px] font-black text-slate-300 mx-1">TO</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[10px] font-bold outline-none bg-transparent uppercase" />
                </div>

                <button 
                    onClick={() => setRefreshKey(prev => prev + 1)} 
                    className="p-3 bg-white border border-slate-200 rounded-[1.5rem] text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-white p-2.5 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.status}
            onClick={() => setActiveFilter(f.status as any)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeFilter === f.status 
              ? 'bg-black text-white shadow-lg scale-[1.05]' 
              : 'text-slate-400 hover:bg-slate-50 hover:text-black'
            }`}
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
          logisticsOnly={true} 
          onBulkAction={handleBulkPrint}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
};
