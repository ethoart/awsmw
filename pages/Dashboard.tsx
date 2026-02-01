
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Order, OrderStatus, Product, User } from '../types';
import { db } from '../services/mockBackend';
import { formatCurrency } from '../utils/helpers';
import { 
  RefreshCcw, DollarSign, Truck, RotateCcw, 
  Archive, Users, Calendar, ShoppingBag, Star, Activity, Box,
  Award, ListChecks, ArrowUpRight, LayoutDashboard,
  ShieldCheck, Target, Rocket, ClipboardList, RotateCw, History as HistoryIcon
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

interface DashboardProps {
  tenantId: string;
  shopName: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ tenantId, shopName }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalIsoDate = (date: Date = new Date()) => date.toISOString().split('T')[0];
  const [preset, setPreset] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'YEAR'>('MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(getLocalIsoDate());

  const applyPreset = useCallback((p: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
    setPreset(p);
    const d = new Date();
    if (p === 'TODAY') d.setHours(0,0,0,0);
    else if (p === 'WEEK') d.setDate(d.getDate() - 7);
    else if (p === 'MONTH') d.setMonth(d.getMonth() - 1);
    else if (p === 'YEAR') d.setFullYear(d.getFullYear() - 1);
    setStartDate(getLocalIsoDate(d));
    setEndDate(getLocalIsoDate(new Date()));
  }, []);

  useEffect(() => { applyPreset('MONTH'); }, [applyPreset]);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [orderRes, fetchedProducts, fetchedTeam] = await Promise.all([
          db.getOrders({ tenantId, limit: 5000 }), 
          db.getProducts(tenantId),
          db.getTeamMembers(tenantId)
      ]);
      setOrders(orderRes.data || []);
      setProducts(fetchedProducts || []);
      setTeam(fetchedTeam || []);
    } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dashboardData = useMemo(() => {
    let deliveredCount = 0;
    let returnedCount = 0;
    let confirmedCount = 0;
    let shippedCount = 0;
    let totalRevenue = 0;
    let restockCount = 0;

    const today = getLocalIsoDate();
    let todayOrders = 0;
    let todayRevenue = 0;
    let todayShipped = 0;
    let todayReturns = 0;

    const filteredShippedProducts: { [name: string]: number } = {};
    const filteredReturnedProducts: { [name: string]: { count: number, sku: string } } = {};

    const dailyMap: { [key: string]: any } = {};
    const productStats: { [key: string]: any } = {};
    const teamStats: { [key: string]: { 
      name: string; 
      interactions: number; 
      confirms: number; 
      rejects: number; 
      noAnswers: number; 
      openLeads: number;
    } } = {};

    (products || []).forEach(p => {
      productStats[p.id] = { 
        sku: p.sku, name: p.name, salesCount: 0, confirmed: 0, 
        shipped: 0, delivered: 0, returned: 0, revenue: 0, profit: 0 
      };
    });

    (team || []).forEach(u => teamStats[u.username] = { 
      name: u.username, 
      interactions: 0, 
      confirms: 0, 
      rejects: 0, 
      noAnswers: 0, 
      openLeads: 0 
    });

    const dStart = new Date(startDate || today);
    const dEnd = new Date(endDate || today);
    for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
        dailyMap[getLocalIsoDate(d)] = { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sales: 0, shipped: 0 };
    }

    (orders || []).forEach(o => {
        const createDate = o.createdAt.split('T')[0];
        const shipDate = o.shippedAt?.split('T')[0];
        const isInRange = createDate >= startDate && createDate <= endDate;
        const shipIsInRange = shipDate && shipDate >= startDate && shipDate <= endDate;
        
        if (createDate === today) todayOrders++;
        if (shipDate === today) todayShipped++;
        if (o.status === OrderStatus.DELIVERED && shipDate === today) todayRevenue += o.totalAmount;
        if (o.status.includes('RETURN') && createDate === today) todayReturns++;

        if (shipIsInRange) {
          o.items.forEach(item => {
            filteredShippedProducts[item.name] = (filteredShippedProducts[item.name] || 0) + item.quantity;
          });
        }

        // Logic for "Return Scan Items" Product-wise aggregation
        if (isInRange && o.status.includes('RETURN')) {
          o.items.forEach(item => {
            if (!filteredReturnedProducts[item.name]) {
              filteredReturnedProducts[item.name] = { count: 0, sku: '' };
              const pRef = products.find(p => p.id === item.productId);
              filteredReturnedProducts[item.name].sku = pRef?.sku || 'N/A';
            }
            filteredReturnedProducts[item.name].count += item.quantity;
          });
        }

        if (o.logs) {
            o.logs.forEach(log => {
                const logDate = log.timestamp.split('T')[0];
                if (logDate >= startDate && logDate <= endDate && teamStats[log.user]) {
                    teamStats[log.user].interactions++;
                    if (log.message.includes('CONFIRMED')) teamStats[log.user].confirms++;
                    if (log.message.includes('REJECTED')) teamStats[log.user].rejects++;
                    if (log.message.includes('NO_ANSWER')) teamStats[log.user].noAnswers++;
                    if (log.message.includes('OPEN_LEAD')) teamStats[log.user].openLeads++;
                }
            });
        }

        if (isInRange) {
            if (o.status === OrderStatus.CONFIRMED || o.status === OrderStatus.SHIPPED || o.status === OrderStatus.DELIVERED) {
                confirmedCount++;
                o.items.forEach(item => { if(productStats[item.productId]) productStats[item.productId].salesCount += item.quantity; });
            }
            if (o.status.includes('RETURN')) returnedCount++;
            if (o.status === OrderStatus.RETURN_COMPLETED) restockCount++;
        }

        if (shipIsInRange) {
            shippedCount++;
            if (dailyMap[shipDate]) dailyMap[shipDate].shipped++;
            if (o.status === OrderStatus.DELIVERED) {
                deliveredCount++;
                totalRevenue += o.totalAmount;
                if (dailyMap[shipDate]) dailyMap[shipDate].sales += o.totalAmount;
                o.items.forEach(item => { 
                    if(productStats[item.productId]) {
                        productStats[item.productId].delivered += item.quantity;
                        productStats[item.productId].revenue += (item.price * item.quantity);
                        const prodRef = products.find(pr => pr.id === item.productId);
                        const avgCost = prodRef?.batches?.reduce((acc, b) => acc + b.buyingPrice, 0) / (prodRef?.batches?.length || 1) || 0;
                        productStats[item.productId].profit += ((item.price - avgCost) * item.quantity);
                    }
                });
            }
        }
    });

    return {
        stats: { deliveredCount, returnedCount, confirmedCount, shippedCount, totalRevenue, restockCount },
        today: { todayOrders, todayRevenue, todayShipped, todayReturns },
        manifest: Object.entries(filteredShippedProducts).sort((a,b) => b[1] - a[1]),
        returnedManifest: Object.entries(filteredReturnedProducts).sort((a,b) => b[1].count - a[1].count),
        trends: Object.values(dailyMap),
        products: Object.values(productStats).filter((p:any) => p.salesCount > 0 || p.shipped > 0),
        teamLeaderboard: Object.values(teamStats).sort((a,b) => b.confirms - a.confirms)
    };
  }, [orders, products, team, startDate, endDate]);

  return (
    <div className="space-y-6 animate-slide-in max-w-[1600px] mx-auto pb-20 px-2">
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg"><LayoutDashboard size={20} /></div>
            <div>
                <h2 className="text-xl font-black uppercase text-slate-900 leading-none">{shopName} Analytics</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Efficiency Control Terminal</p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
            <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                {(['TODAY', 'WEEK', 'MONTH', 'YEAR'] as const).map(p => (
                    <button key={p} onClick={() => applyPreset(p)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${preset === p ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-900'}`}>{p}</button>
                ))}
            </div>
            <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                <Calendar size={14} className="text-blue-600" />
                <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreset('MONTH' as any); }} className="text-[10px] font-bold outline-none bg-transparent" />
                <span className="text-[10px] font-black text-slate-300 mx-1">TO</span>
                <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreset('MONTH' as any); }} className="text-[10px] font-bold outline-none bg-transparent" />
            </div>
            <button onClick={fetchData} className="p-3 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg active:scale-95">
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      <div className="bg-slate-950 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[150px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 flex items-center gap-6">
                <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-2xl rotate-3">
                    <Rocket size={32} className="text-white" />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">Daily Pulse</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2">Live Node Status: {getLocalIsoDate()}</p>
                </div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Today's Inbound", val: dashboardData.today.todayOrders, icon: <Target className="text-blue-400" /> },
                    { label: "Today's Dispatch", val: dashboardData.today.todayShipped, icon: <Truck className="text-amber-400" /> },
                    { label: "Today's Revenue", val: formatCurrency(dashboardData.today.todayRevenue), icon: <DollarSign className="text-emerald-400" /> },
                    { label: "Today's Returns", val: dashboardData.today.todayReturns, icon: <RotateCcw className="text-rose-400" /> },
                ].map((stat, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-[2rem] hover:bg-white/10 transition-all group">
                        <div className="flex items-center gap-3 mb-2">
                            {React.cloneElement(stat.icon as any, { size: 14 })}
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                        </div>
                        <p className="text-lg font-black text-white truncate group-hover:text-blue-400 transition-colors">{stat.val}</p>
                    </div>
                ))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-3 mb-6">
                <ClipboardList size={18} className="text-blue-600"/> Shipping Manifest Registry
            </h3>
            <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar max-h-[350px]">
                {dashboardData.manifest.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 text-center">
                    <Box size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Dispatches in Range</p>
                  </div>
                ) : (
                  dashboardData.manifest.map(([name, count], i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-blue-50 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-900 group-hover:border-blue-200">{i+1}</div>
                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[180px]">{name}</span>
                      </div>
                      <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black">×{count}</span>
                    </div>
                  ))
                )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50">
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Data relative to sample range</p>
            </div>
        </div>

        {/* NEW SECTION: Returned Stock Intelligence */}
        <div className="lg:col-span-4 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col border-t-rose-600 border-t-4">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-3 mb-6">
                <RotateCcw size={18} className="text-rose-600"/> Returned Stock Intelligence
            </h3>
            <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar max-h-[350px]">
                {dashboardData.returnedManifest.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 text-center">
                    <RotateCw size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Returns in Registry</p>
                  </div>
                ) : (
                  dashboardData.returnedManifest.map(([name, data]: any, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-rose-50/30 rounded-2xl border border-rose-100 group hover:bg-rose-50 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-rose-200 rounded-lg flex items-center justify-center text-[10px] font-black text-rose-600 group-hover:border-rose-400">{i+1}</div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">{name}</span>
                            <span className="text-[8px] font-mono text-rose-500 font-bold uppercase">{data.sku}</span>
                        </div>
                      </div>
                      <span className="bg-rose-600 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg shadow-rose-200">×{data.count}</span>
                    </div>
                  ))
                )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50">
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">OMS Scan Terminal Data</p>
            </div>
        </div>

        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
            {[
              { label: 'Confirmed', val: dashboardData.stats.confirmedCount, icon: <Star/>, col: 'bg-emerald-50 text-emerald-600' },
              { label: 'Shipped', val: dashboardData.stats.shippedCount, icon: <Truck/>, col: 'bg-blue-50 text-blue-600' },
              { label: 'Delivered', val: dashboardData.stats.deliveredCount, icon: <ShieldCheck/>, col: 'bg-indigo-50 text-indigo-600' },
              { label: 'Returns', val: dashboardData.stats.returnedCount, icon: <RotateCcw/>, col: 'bg-rose-50 text-rose-600' },
              { label: 'Restocked', val: dashboardData.stats.restockCount, icon: <Archive/>, col: 'bg-slate-100 text-slate-500' },
              { label: 'Revenue', val: formatCurrency(dashboardData.stats.totalRevenue), icon: <DollarSign/>, col: 'bg-slate-950 text-white' },
            ].map((s, i) => (
              <div key={i} className="p-6 rounded-[2rem] border border-slate-100 shadow-sm bg-white hover:border-blue-200 transition-all group cursor-default">
                  <div className={`w-10 h-10 ${s.col} rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform`}>{React.cloneElement(s.icon as any, { size: 18 })}</div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                  <p className="text-xl font-black text-slate-900 truncate tracking-tighter">{s.val}</p>
              </div>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-3 mb-8">
                <Activity size={18} className="text-blue-600"/> Revenue & Dispatch Trends
            </h3>
            <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData.trends}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                        <Tooltip />
                        <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={3} fill="#10b981" fillOpacity={0.05} name="Revenue" />
                        <Area type="monotone" dataKey="shipped" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.05} name="Dispatch" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="lg:col-span-4 bg-slate-950 text-white p-8 rounded-[3.5rem] shadow-2xl relative overflow-hidden flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-3 mb-8">
                <Award size={18} className="text-blue-400"/> Staff Performance Matrix
            </h3>
            <div className="space-y-4 overflow-y-auto no-scrollbar flex-1">
                {dashboardData.teamLeaderboard.map((user, i) => (
                    <div key={i} className="p-5 bg-white/5 rounded-[2rem] border border-white/10 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-xs font-black">{user.name.slice(0, 2).toUpperCase()}</div>
                                <div>
                                    <p className="text-xs font-black uppercase leading-none">{user.name}</p>
                                    <p className="text-[8px] font-black text-slate-500 uppercase mt-1">{user.interactions} Interacts</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-emerald-400">+{user.confirms}</p>
                                <p className="text-[8px] font-black text-slate-500 uppercase">Confirmed</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white/5 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black">{user.openLeads}</p>
                                <p className="text-[7px] font-black text-slate-500 uppercase">Open</p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black text-amber-500">{user.noAnswers}</p>
                                <p className="text-[7px] font-black text-slate-500 uppercase">N/A</p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black text-rose-500">{user.rejects}</p>
                                <p className="text-[7px] font-black text-slate-500 uppercase">Reject</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="lg:col-span-12 bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black uppercase tracking-tighter mb-10 flex items-center gap-4">
                <ListChecks size={24} className="text-emerald-500"/> Product Performance Summary
            </h3>
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left compact-table">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="rounded-l-3xl">Product SKU</th>
                            <th className="text-center">Gross Sales</th>
                            <th className="text-center">Delivered</th>
                            <th className="text-center">Returns</th>
                            <th className="text-right rounded-r-3xl pr-10">Net Profit (Est.)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {dashboardData.products.map((p, i) => (
                            <tr key={i} className="hover:bg-slate-50/80 transition-all">
                                <td className="py-6">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{p.name}</span>
                                        <span className="text-[9px] font-mono font-bold text-blue-500 mt-1">ID: {p.sku}</span>
                                    </div>
                                </td>
                                <td className="text-center"><span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg">+{p.salesCount}</span></td>
                                <td className="text-center"><span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">+{p.delivered}</span></td>
                                <td className="text-center"><span className="text-xs font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg">+{p.returned}</span></td>
                                <td className="text-right pr-10">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm font-black text-slate-950">{formatCurrency(p.profit)}</span>
                                        <div className={`flex items-center gap-1 text-[8px] font-black uppercase mt-1 text-emerald-500`}>
                                            <ArrowUpRight size={10}/> Yield Matrix
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};
