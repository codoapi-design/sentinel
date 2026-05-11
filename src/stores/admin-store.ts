import { create } from 'zustand';

export interface AdminInfo {
  userId: string;
  email: string;
  role: 'super_admin' | 'admin' | 'viewer';
}

interface AdminState {
  admin: AdminInfo | null;
  sidebarCollapsed: boolean;
  activeSection: string;
  setAdmin: (admin: AdminInfo | null) => void;
  toggleSidebar: () => void;
  setActiveSection: (section: string) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  admin: null,
  sidebarCollapsed: false,
  activeSection: 'dashboard',
  setAdmin: (admin) => set({ admin }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActiveSection: (activeSection) => set({ activeSection }),
}));
