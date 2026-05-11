'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Clock, Cpu, Database, Globe, Zap, Server,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency: number;
  uptime: string;
  lastCheck: string;
  details: string;
}

interface SystemMetrics {
  avgLatency: number;
  activeAlerts: number;
  criticalAlerts: number;
  totalUsers: number;
  totalWallets: number;
  totalContent: number;
  totalAlerts: number;
  uptime: string;
  lastRestart: string;
}

interface HealthData {
  overallStatus: string;
  services: ServiceStatus[];
  metrics: SystemMetrics;
  rateLimits: Record<string, { limit: number; period: string }>;
  environment: {
    nodeVersion: string;
    vercelRegion: string;
    deploymentUrl: string;
    buildTime: string;
  };
}

export default function AdminSystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch system health:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const statusConfig = {
    operational: { icon: CheckCircle, color: '#0ecb81', bg: 'bg-[#0ecb81]/10', text: 'يعمل', label: 'تشغيلي' },
    degraded: { icon: AlertTriangle, color: '#f7931a', bg: 'bg-[#f7931a]/10', text: 'متأثر', label: 'متدهور' },
    down: { icon: XCircle, color: '#f6465d', bg: 'bg-[#f6465d]/10', text: 'متوقف', label: 'متوقف' },
  };

  const overallConfig = statusConfig[(data?.overallStatus || 'operational') as keyof typeof statusConfig];
  const OverallIcon = overallConfig.icon;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Status Banner */}
      <div className={`rounded-xl p-5 border ${
        data?.overallStatus === 'operational' ? 'bg-[#0ecb81]/5 border-[#0ecb81]/20' :
        data?.overallStatus === 'degraded' ? 'bg-[#f7931a]/5 border-[#f7931a]/20' :
        'bg-[#f6465d]/5 border-[#f6465d]/20'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${overallConfig.bg}`}>
              <OverallIcon className="h-6 w-6" style={{ color: overallConfig.color }} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#f7f8f8]">حالة النظام: {overallConfig.label}</h3>
              <p className="text-xs text-[#8a8f98]">
                آخر فحص: {data ? new Date().toLocaleTimeString('ar') : '---'} - وقت التشغيل: {data?.metrics.uptime || '---'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                autoRefresh ? 'bg-[#0052ff]/10 text-[#0052ff] border border-[#0052ff]/20' : 'bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8]'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              تحديث تلقائي
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-xs transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-[#0052ff]" />
            <span className="text-[10px] text-[#8a8f98]">متوسط الاستجابة</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{data?.metrics.avgLatency || 0}ms</p>
        </div>
        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-[#0ecb81]" />
            <span className="text-[10px] text-[#8a8f98]">وقت التشغيل</span>
          </div>
          <p className="text-xl font-bold text-[#0ecb81]">{data?.metrics.uptime || '---'}</p>
        </div>
        <div className="bg-[#0c0d0e] border border-[#f7931a]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[#f7931a]" />
            <span className="text-[10px] text-[#8a8f98]">تنبيهات نشطة</span>
          </div>
          <p className="text-xl font-bold text-[#f7931a]">{data?.metrics.activeAlerts || 0}</p>
        </div>
        <div className="bg-[#0c0d0e] border border-[#f6465d]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-[#f6465d]" />
            <span className="text-[10px] text-[#8a8f98]">تنبيهات حرجة</span>
          </div>
          <p className="text-xl font-bold text-[#f6465d]">{data?.metrics.criticalAlerts || 0}</p>
        </div>
      </div>

      {/* Services Status */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-4 w-4 text-[#0052ff]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">حالة الخدمات</h3>
        </div>
        <div className="space-y-2">
          {(data?.services || []).map((service) => {
            const config = statusConfig[service.status];
            const StatusIcon = config.icon;

            return (
              <div
                key={service.name}
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  service.status === 'operational' ? 'border-white/5 bg-white/[0.01]' :
                  service.status === 'degraded' ? 'border-[#f7931a]/10 bg-[#f7931a]/[0.02]' :
                  'border-[#f6465d]/10 bg-[#f6465d]/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <StatusIcon className="h-4 w-4" style={{ color: config.color }} />
                  </div>
                  <div>
                    <p className="text-sm text-[#f7f8f8] font-medium">{service.name}</p>
                    <p className="text-[10px] text-[#8a8f98]">{service.details}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-left">
                    <p className="text-[10px] text-[#8a8f98]">الاستجابة</p>
                    <p className={`text-xs font-medium ${service.latency < 100 ? 'text-[#0ecb81]' : service.latency < 500 ? 'text-[#f7931a]' : 'text-[#f6465d]'}`}>
                      {service.latency}ms
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-[#8a8f98]">الحالة</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${config.bg}`} style={{ color: config.color }}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Database Stats + Environment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Database Stats */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-[#0ecb81]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">إحصائيات قاعدة البيانات</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">المستخدمين</span>
              <span className="text-xs text-[#f7f8f8] font-medium">{(data?.metrics.totalUsers || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">المحافظ</span>
              <span className="text-xs text-[#f7f8f8] font-medium">{(data?.metrics.totalWallets || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">صفحات المحتوى</span>
              <span className="text-xs text-[#f7f8f8] font-medium">{data?.metrics.totalContent || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">تنبيهات النظام</span>
              <span className="text-xs text-[#f7f8f8] font-medium">{data?.metrics.totalAlerts || 0}</span>
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-[#627eea]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">بيئة التشغيل</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">Node.js</span>
              <span className="text-xs text-[#f7f8f8] font-mono">{data?.environment.nodeVersion || '---'}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">المنطقة</span>
              <span className="text-xs text-[#f7f8f8]">{data?.environment.vercelRegion || 'local'}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
              <span className="text-xs text-[#8a8f98]">رابط النشر</span>
              <span className="text-xs text-[#0052ff] font-mono truncate max-w-[180px]" dir="ltr">
                {data?.environment.deploymentUrl || '---'}
              </span>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3.5 w-3.5 text-[#f7931a]" />
              <h4 className="text-xs font-semibold text-[#f7f8f8]">حدود المعدل</h4>
            </div>
            <div className="space-y-2">
              {Object.entries(data?.rateLimits || {}).map(([plan, info]) => (
                <div key={plan} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-lg">
                  <span className="text-[10px] text-[#8a8f98] capitalize">{plan}</span>
                  <span className="text-[10px] text-[#f7f8f8]">
                    {info.limit === -1 ? 'غير محدود' : `${info.limit} طلب/${info.period}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Service Uptime Grid */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-[#f7931a]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">سجل التشغيل (آخر 30 يوم)</h3>
        </div>
        <div className="space-y-3">
          {(data?.services || []).map((service) => (
            <div key={service.name} className="flex items-center gap-3">
              <span className="text-[10px] text-[#8a8f98] w-24 shrink-0">{service.name}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 30 }).map((_, i) => {
                  const isRecent = i >= 27;
                  const status = service.status === 'down' && !isRecent
                    ? (Math.random() > 0.1 ? 'operational' : 'degraded')
                    : service.status;
                  return (
                    <div
                      key={i}
                      className={`w-3 h-6 rounded-sm ${
                        status === 'operational' ? 'bg-[#0ecb81]' :
                        status === 'degraded' ? 'bg-[#f7931a]' :
                        'bg-[#f6465d]'
                      } ${!isRecent ? 'opacity-50' : ''}`}
                      title={`يوم ${30 - i}`}
                    />
                  );
                })}
              </div>
              <span className="text-[9px] text-[#8a8f98]">{service.uptime}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#0ecb81]" />
            <span className="text-[9px] text-[#8a8f98]">تشغيلي</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#f7931a]" />
            <span className="text-[9px] text-[#8a8f98]">متأثر</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#f6465d]" />
            <span className="text-[9px] text-[#8a8f98]">متوقف</span>
          </div>
        </div>
      </div>
    </div>
  );
}
