
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../services/mockBackend';
import { Product, StockBatch, Order, OrderStatus } from '../types';
import { 
  Plus, 
  Trash2, 
  Save, 
  Package, 
  Layers, 
  TrendingDown, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Info,
  ArrowRight,
  History,
  Edit3,
  Check,
  TrendingUp,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  BarChart3,
  LayoutDashboard
} from 'lucide-react';
import { formatCurrency, formatFullNumber } from '../utils/helpers';

interface StockProps {
  tenantId: string;
  shopName: string;
}

export const Stock: React.FC<StockProps> = ({ tenantId, shopName }) => {
  const [view, setView] = useState<'LIVE' | 'HISTORY'>('LIVE');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [newProd, setNewProd] = useState({ name: '', sku: '', price: 0 });
  const [batchForms, setBatchForms] = useState<{[key: string]: { quantity: number, buyingPrice: number }}>({});
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prodData = await db.getProducts(tenantId);
      setProducts(prodData);
      
      if (view === 'HISTORY') {
          // Fetch larger sample for accurate history aggregation
          const orderData = await db.getOrders({ tenantId, limit: 10000 });
          setOrders(orderData.data || []);
      }
    } catch (e) {
      console.error("Failed to load inventory data", e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, view]);

  useEffect(() => { load(); }, [load]);

  const aggregatedHistory = useMemo(() => {
      if (view !== 'HISTORY') return [];
      
      const stats: Record<string, { 
          id: string, 
          name: string, 
          sku: string, 
          totalAdded: number, 
          remaining: number, 
          sold: number 
      }> = {};

      // Initialize with products and batches
      products.forEach(p => {
          const totalAdded = (p.batches || []).reduce((sum, b) => sum + (b.originalQuantity ?? b.quantity), 0);
          const currentRemaining = (p.batches || []).reduce((sum, b) => sum + b.quantity, 0);
          
          stats[p.id] = {
              id: p.id,
              name: p.name,
              sku: p.sku,
              totalAdded,
              remaining: currentRemaining,
              sold: totalAdded - currentRemaining // Calculated derived sold count based on batch depletion
          };
      });

      return Object.values(stats).sort((a,b) => b.totalAdded - a.totalAdded);
  }, [products, view]);

  const handleAddProduct = async () => {
    if (!newProd.name || !newProd.sku) return alert("System Error: SKU and Identity Name required.");
    const p: Product = {
      id: `p-${Date.now()}`,
      tenantId,
      name: newProd.name,
      sku: newProd.sku,
      price: newProd.price,
      batches: []
    };
    await db.updateProduct(p);
    setNewProd({ name: '', sku: '', price: 0 });
    load();
  };

  const handleAddBatch = async (productId: string) => {
    const form = batchForms[productId];
    if (!form || form.quantity <= 0) return alert("Quantity must be greater than zero.");
    
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newBatch: StockBatch = {
      id: `b-${Date.now()}`,
      quantity: form.quantity,
      originalQuantity: form.quantity, // Track initial added amount
      buyingPrice: form.buyingPrice,
      createdAt: new Date().toISOString()
    };

    const updatedProduct: Product = {
      ...product,
      batches: [...(product.batches || []), newBatch]
    };

    await db.updateProduct(updatedProduct);
    setBatchForms(prev => ({ ...prev, [productId]: { quantity: 0, buyingPrice: 0 } }));
    load();
  };

  const handleUpdateBatchPrice = async (productId: string, batchId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const updatedBatches = product.batches.map(b => 
        b.id === batchId ? { ...b, buyingPrice: tempPrice } : b
    );

    await db.updateProduct({ ...product, batches: updatedBatches });
    setEditingBatchId(null);
    load();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("CRITICAL PROTOCOL: Destroy this master product and all associated batches permanently?")) return;
    setLoading(true);
    try {
      await db.deleteProduct(id, tenantId);
      await load();
      alert("Product successfully purged from registry.");
    } catch (e: any) {
      alert("Registry access failure: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductStock = (p: Product) => (p.batches || []).reduce((sum, b) => sum + b.quantity, 0);
  const getProductCostValue = (p: Product) => (p.batches || []).reduce((sum, b) => sum + (b.quantity * b.buyingPrice), 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-black text-white rounded-2xl shadow-xl rotate-2">
                  <Package size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{shopName} Inventory</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Multi-Batch FIFO Control Engine</p>
              </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button 
                    onClick={() => setView('LIVE')} 
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIVE' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Live Stock
                </button>
                <button 
                    onClick={() => setView('HISTORY')} 
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'HISTORY' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    History Summary
                </button>
            </div>
            <button 
                onClick={load} 
                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-95"
            >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
      </div>

      {view === 'LIVE' ? (
        <>
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Plus size={16} className="text-blue-600" /> Register Master SKU
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity SKU</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                        value={newProd.sku} onChange={e => setNewProd({...newProd, sku: e.target.value})} placeholder="Ex. MW-101" />
            </div>
            <div className="md:col-span-2 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                        value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} placeholder="Master Identity Name" />
            </div>
            <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fixed Selling Price</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                        <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                            value={newProd.price} onChange={e => setNewProd({...newProd, price: parseFloat(e.target.value)})} />
                    </div>
            </div>
            </div>
            <button onClick={handleAddProduct} className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
            <Save size={16} /> Inject Master Registry
            </button>
          </div>

          <div className="space-y-4">
            {loading ? (
                <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.5em] text-slate-300">Syncing Inventory Nodes...</div>
            ) : products.map(p => {
                const totalStock = getProductStock(p);
                const isExpanded = expandedId === p.id;
                
                return (
                    <div key={p.id} className={`bg-white rounded-[2.5rem] border transition-all duration-300 ${isExpanded ? 'border-blue-200 shadow-xl ring-4 ring-blue-50' : 'border-slate-100 shadow-sm'}`}>
                        <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
                                <Layers size={24} />
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h4 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{p.name}</h4>
                                <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-1">
                                    <span className="text-[10px] font-mono font-bold text-blue-600 uppercase">SKU: {p.sku}</span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><History size={10}/> {p.batches.length} active batches</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full md:w-auto">
                                <div className="text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Selling Price</p>
                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(p.price)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Stock</p>
                                    <p className={`text-sm font-black ${totalStock < 10 ? 'text-rose-600 animate-pulse' : 'text-slate-900'}`}>{totalStock} units</p>
                                </div>
                                <div className="text-center hidden md:block">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Cost Value</p>
                                    <p className="text-sm font-black text-slate-400">{formatCurrency(getProductCostValue(p))}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id); }} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                                    <Trash2 size={18} />
                                </button>
                                {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-8 pb-8 border-t border-slate-50 animate-slide-in">
                                <div className="pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                                    <div className="lg:col-span-7 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <TrendingDown size={14} className="text-blue-500"/> Batch Registry (FIFO Order)
                                            </h5>
                                            <span className="text-[9px] font-bold text-slate-300 uppercase italic">Oldest units used first</span>
                                        </div>
                                        <div className="space-y-2">
                                            {p.batches.map((batch, idx) => (
                                                <div key={batch.id} className={`flex items-center justify-between p-4 rounded-2xl border ${batch.id.startsWith('rb-') ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-black text-slate-900">
                                                                    Added: {batch.originalQuantity ?? batch.quantity} <span className="text-slate-300 mx-1">|</span> Remaining: <span className={batch.quantity < 5 ? 'text-rose-600' : 'text-emerald-600'}>{batch.quantity}</span>
                                                                </p>
                                                                {batch.id.startsWith('rb-') && <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[7px] font-black uppercase">Returned Stock</span>}
                                                            </div>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(batch.createdAt).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            {editingBatchId === batch.id ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input 
                                                                        type="number" 
                                                                        className="w-24 bg-white border border-blue-500 rounded-lg px-2 py-1 text-xs font-black outline-none"
                                                                        value={tempPrice}
                                                                        onChange={e => setTempPrice(parseFloat(e.target.value) || 0)}
                                                                        autoFocus
                                                                    />
                                                                    <button onClick={() => handleUpdateBatchPrice(p.id, batch.id)} className="p-1.5 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-all">
                                                                        <Check size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-end">
                                                                    <div className="flex items-center gap-2 group/price">
                                                                        <p className="text-xs font-black text-slate-900 uppercase">Cost: {formatCurrency(batch.buyingPrice)}</p>
                                                                        <button 
                                                                            onClick={() => { setEditingBatchId(batch.id); setTempPrice(batch.buyingPrice); }} 
                                                                            className="p-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover/price:opacity-100 transition-all"
                                                                        >
                                                                            <Edit3 size={12}/>
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-tighter">ID: {batch.id.slice(-6)}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="lg:col-span-5 space-y-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                                        <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Plus size={14} className="text-blue-600" /> Inject New Batch
                                        </h5>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">Arrival Quantity</label>
                                                <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                                                    value={batchForms[p.id]?.quantity || ''} 
                                                    onChange={e => setBatchForms({...batchForms, [p.id]: { ...(batchForms[p.id] || { buyingPrice: 0 }), quantity: parseInt(e.target.value) || 0 }})} 
                                                    placeholder="Units" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">Batch Buying Price (Unit Cost)</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                                                    <input type="number" className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all" 
                                                        value={batchForms[p.id]?.buyingPrice || ''} 
                                                        onChange={e => setBatchForms({...batchForms, [p.id]: { ...(batchForms[p.id] || { quantity: 0 }), buyingPrice: parseFloat(e.target.value) || 0 }})} 
                                                        placeholder="Cost" />
                                                </div>
                                            </div>
                                            <button onClick={() => handleAddBatch(p.id)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all">
                                                Commit Stock Batch
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-in">
            {aggregatedHistory.length === 0 && (
                <div className="col-span-full py-20 text-center flex flex-col items-center opacity-30">
                    <LayoutDashboard size={64} className="mb-4 text-slate-300"/>
                    <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.4em]">No Movement Data</p>
                </div>
            )}
            {aggregatedHistory.map((stat) => (
                <div key={stat.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all group">
                    <div>
                        <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{stat.name}</h4>
                        <p className="text-[10px] font-mono font-bold text-blue-500 mt-1">SKU: {stat.sku}</p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mt-8">
                        <div className="bg-slate-50 p-4 rounded-2xl text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Added</p>
                            <p className="text-xl font-black text-slate-900">{formatFullNumber(stat.totalAdded, 0)}</p>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-2xl text-center">
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1">Sold/Sent</p>
                            <p className="text-xl font-black text-emerald-600">{formatFullNumber(stat.sold, 0)}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-2xl text-center border-2 border-blue-100">
                            <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1">In Stock</p>
                            <p className="text-xl font-black text-blue-600">{formatFullNumber(stat.remaining, 0)}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};
