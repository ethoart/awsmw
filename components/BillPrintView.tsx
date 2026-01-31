
import React from 'react';
import Barcode from 'react-barcode';
import { Order, TenantSettings } from '../types';

interface BillPrintViewProps {
  order: Order;
  settings: TenantSettings;
}

export const BillPrintView: React.FC<BillPrintViewProps> = ({ order, settings }) => {
  const displayId = order.trackingNumber || order.id;
  const productName = order.items[0]?.name || 'Product';
  
  // Base font size for customer details
  const detailSize = "text-[20px]";

  return (
    <div className="print-only w-[105mm] min-h-[148mm] p-10 bg-white text-black font-sans mx-auto border border-gray-200 mb-10 box-border">
      <div className="space-y-1">
        <p className="text-[14px] font-medium">To:</p>
        <div className={`${detailSize} leading-tight uppercase`}>
          <span className="font-black">{order.customerName}</span>
          <span className="font-black ml-2">({productName})</span>
        </div>
        <p className={`${detailSize} font-normal leading-relaxed whitespace-pre-wrap mt-2`}>
          {order.customerAddress} {order.customerCity ? `[${order.customerCity.toUpperCase()}]` : ''}
        </p>
        <div className="mt-4">
            <p className="text-[26px] font-black tracking-tighter leading-none">
              {order.customerPhone}{order.customerPhone2 ? ` / ${order.customerPhone2}` : ''}
            </p>
        </div>
      </div>

      <div className="mt-12 mb-6">
        <h1 className="text-[58px] font-black tracking-tighter leading-none">
          COD: Rs.{order.totalAmount.toLocaleString()}
        </h1>
      </div>

      <div className="border-t-[2pt] border-black border-dashed my-8"></div>

      <div className="space-y-1">
        <p className="text-[14px] font-medium">From:</p>
        <p className="text-[16px] font-black uppercase">{settings.shopName}</p>
        <p className="text-[12px] font-bold text-gray-600 max-w-[250px]">{settings.shopAddress}</p>
        <p className="text-[14px] font-black">{settings.shopPhone}</p>
        <div className="flex justify-between items-end mt-4">
            <p className="text-[10px] font-bold text-gray-400">OMS Ref: {order.id}</p>
            {order.trackingNumber && <p className="text-[10px] font-black text-blue-600 uppercase">Waybill Locked</p>}
        </div>
      </div>

      <div className="mt-16 flex flex-col items-center justify-center">
        <Barcode 
          value={displayId} 
          width={2.2} 
          height={75} 
          fontSize={14} 
          font="monospace" 
          background="transparent"
          format="CODE128"
        />
        <p className="text-[12px] font-black uppercase tracking-[0.4em] mt-3">
          {displayId}
        </p>
      </div>
      
      <div className="mt-12 text-center opacity-20">
        <p className="text-[10px] font-black uppercase tracking-widest">Milky Way OMS Enterprise Registry</p>
      </div>
    </div>
  );
};
