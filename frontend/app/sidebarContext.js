'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import MantenimientoModal from '@/_Pages/main/layouts/Mantenimiento';

const SidebarContext = createContext();

export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  // Mensaje opcional del modal (ej: "habilitado mañana miércoles 23").
  const [maintMsg, setMaintMsg] = useState('');

  const toggle = () => setIsOpen(prev => !prev);
  const close = () => setIsOpen(false);
  const openMaint = (msg = '') => {
    setIsOpen(false);
    setMaintMsg(typeof msg === 'string' ? msg : '');
    setMaintOpen(true);
  };
  const closeMaint = () => setMaintOpen(false);

  // Lock background scroll while the mobile drawer is open so the page
  // doesn't slide behind it.
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, maintOpen, maintMsg, openMaint, closeMaint }}>
      {children}
      <MantenimientoModal />
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}
