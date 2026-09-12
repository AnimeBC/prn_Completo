'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import MantenimientoModal from '@/_Pages/main/layouts/Mantenimiento';

const SidebarContext = createContext();

export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);

  const toggle = () => setIsOpen(prev => !prev);
  const close = () => setIsOpen(false);
  const openMaint = () => {
    setIsOpen(false);
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
    <SidebarContext.Provider value={{ isOpen, toggle, close, maintOpen, openMaint, closeMaint }}>
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
