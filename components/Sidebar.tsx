
import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Truck, 
  Settings, 
  Users, 
  LogOut, 
  UserPlus, 
  Wallet,
  CalendarCheck,
  ChevronRight,
  Globe,
  Scan,
  RotateCcw,
  PhoneForwarded
} from 'lucide-react';
import { User, UserRole } from '../types';

interface SidebarProps {
  user: User;
  shopName?: string;
  logoUrl?: string;
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, shopName, logoUrl, activePage, onNavigate, onLogout, isOpen, onClose }) => {
  
  const hasAccess = (pageId: string) => {
    if (user.role === UserRole.DEV_ADMIN) return true;
    if (user.role === UserRole.SUPER_ADMIN) return true;
    // Admins get access to pipeline, scan terminals and operational tools
    if (user.role === UserRole.ADMIN) {
        const adminPages = ['dashboard', 'leads', 'selling', 'shipping', 'today_shipped', 'return_mgmt', 'residual_mgmt', 'inventory', 'returns'];
        if (adminPages.includes(pageId)) return true;
    }
    return user.permissions?.includes(pageId);
  };

  const navItem = (id: string, icon: React.ReactNode, label: string) => {
    if (!hasAccess(id)) return null;

    const isActive = activePage === id;
    return (
      <button
        key={id}
        onClick={() => {
          onNavigate(id);
          onClose();
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group mb-1 ${
          isActive 
          ? 'sidebar-item-active' 
          : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 18 })}
          </span>
          <span className="text-[13px] font-semibold tracking-tight">{label}</span>
        </div>
        {isActive && <ChevronRight size={12} className="text-white/60" />}
      </button>
    );
  };

  const SectionHeader = (label: string, idCheck?: string[]) => {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.DEV_ADMIN && idCheck) {
        const hasSome = idCheck.some(id => hasAccess(id));
        if (!hasSome) return null;
    }

    return (
      <div className="px-3 mt-6 mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      </div>
    );
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-40 md:hidden" onClick={onClose} />
      )}

      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        w-64 bg-white h-screen flex flex-col border-r border-slate-200 transition-all duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-5 py-6 flex items-center gap-3 mb-2 border-b border-slate-50">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-xl object-cover bg-slate-100 shadow-sm" />
          ) : (
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
               <Globe className="text-white" size={18} />
            </div>
          )}
          <div className="flex flex-col">
            <h1 className="text-[15px] font-black text-slate-900 tracking-tight uppercase leading-none truncate max-w-[140px]">
              Milky Way OMS
            </h1>
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">Enterprise Hub</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 no-scrollbar pb-10">
          {user.role === UserRole.DEV_ADMIN ? (
             <>
              {SectionHeader('Infrastructure')}
              {navItem('dev_dashboard', <LayoutDashboard />, 'Master Console')}
              {navItem('dev_tenants', <Globe />, 'Active Clusters')}
             </>
          ) : (
            <>
              {navItem('dashboard', <LayoutDashboard />, 'Dashboard')}

              {SectionHeader('Terminal', ['leads', 'selling', 'shipping', 'today_shipped'])}
              {navItem('leads', <UserPlus />, 'Inbound')}
              {navItem('selling', <ShoppingCart />, 'Selling')}
              {navItem('shipping', <Truck />, 'Logistics')}
              {navItem('today_shipped', <CalendarCheck />, 'Daily Logs')}
              
              {SectionHeader('Operations', ['return_mgmt', 'residual_mgmt'])}
              {navItem('return_mgmt', <RotateCcw />, 'Returns Hub')}
              {navItem('residual_mgmt', <PhoneForwarded />, 'Residual Hub')}

              {SectionHeader('Assets', ['financials', 'inventory', 'returns'])}
              {navItem('financials', <Wallet />, 'Financials')}
              {navItem('inventory', <Package />, 'Inventory')}
              {navItem('returns', <Scan size={18}/>, 'Milky Way OMS')}
              
              {user.role === UserRole.SUPER_ADMIN && (
                  <>
                    {SectionHeader('Configuration')}
                    {navItem('settings', <Settings />, 'Cluster Settings')}
                    {navItem('team', <Users />, 'Team Management')}
                  </>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-white">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
                <span className="text-[11px] font-black text-slate-900 truncate">{user.username}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{user.role.replace('_', ' ')}</span>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all font-bold text-[11px] uppercase tracking-widest">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};
