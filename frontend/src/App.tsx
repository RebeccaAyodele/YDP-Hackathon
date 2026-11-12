import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, 
  Building2, 
  Search, 
  Zap, 
  RefreshCw,
  Share2,
  Package,
  Users,
  ChevronLeft,
  ChevronRight,
  Shield,
  MapPin,
  Thermometer,
  ArrowUpRight,
  BarChart3,
  Map as MapIcon,
  TrendingUp,
  AlertTriangle,
  Radio,
  Layers,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid, 
  ReferenceLine, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  fetchOverviewStats, 
  fetchFacilities, 
  fetchFacilityById, 
  simulateCascadingRisk,
  fetchDatasetAnalytics 
} from './services/api.ts';
import { 
  Facility, 
  OverviewStats, 
  CascadingSimulationResponse, 
  NeighborDetail,
  DatasetAnalyticsResponse 
} from './types/index.ts';
import FacilityMap from './components/FacilityMap.tsx';

interface AuthUser {
  username: string;
  role: 'NATIONAL' | 'STATE';
  state: string;
  displayName: string;
}

const DEMO_PRESET_USERS: AuthUser[] = [
  { username: 'National_Admin', role: 'NATIONAL', state: '', displayName: 'Federal Ministry of Health (All States)' },
  { username: 'Lagos_Admin', role: 'STATE', state: 'Lagos', displayName: 'Lagos State Primary Health Care Board' },
  { username: 'Sokoto_Admin', role: 'STATE', state: 'Sokoto', displayName: 'Sokoto State Primary Health Care Agency' },
  { username: 'Yobe_Admin', role: 'STATE', state: 'Yobe', displayName: 'Yobe State Primary Health Care Board' },
  { username: 'Bayelsa_Admin', role: 'STATE', state: 'Bayelsa', displayName: 'Bayelsa State Primary Health Care Board' },
  { username: 'Plateau_Admin', role: 'STATE', state: 'Plateau', displayName: 'Plateau State Primary Health Care Board' },
  { username: 'Ebonyi_Admin', role: 'STATE', state: 'Ebonyi', displayName: 'Ebonyi State Primary Health Care Agency' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser>(DEMO_PRESET_USERS[0]);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [customLoginInput, setCustomLoginInput] = useState<string>('');

  // View Mode: 'overview' | 'map' | 'analytics' | 'facility'
  const [mainViewMode, setMainViewMode] = useState<'overview' | 'map' | 'analytics' | 'facility'>('overview');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'commodities' | 'lgas' | 'reporting' | 'states' | 'facilities'>('commodities');
  const [datasetAnalytics, setDatasetAnalytics] = useState<DatasetAnalyticsResponse | null>(null);

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityTotalCount, setFacilityTotalCount] = useState<number>(0);
  const [facilityFilterSummary, setFacilityFilterSummary] = useState<{
    critical_risk: number; high_risk: number; medium_risk: number; low_risk: number; silent_facilities: number;
  }>({ critical_risk: 0, high_risk: 0, medium_risk: 0, low_risk: 0, silent_facilities: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [neighbors, setNeighbors] = useState<NeighborDetail[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [onlySilent, setOnlySilent] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cascadingResult, setCascadingResult] = useState<CascadingSimulationResponse | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Pagination for Triage List (5 per page) & Floating Drawer Toggle
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5;
  const [triageOpen, setTriageOpen] = useState<boolean>(true);

  useEffect(() => {
    if (currentUser.role === 'STATE') {
      setSelectedState(currentUser.state);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
    setCurrentPage(1);
  }, [selectedState, selectedTier, onlySilent, currentUser]);

  useEffect(() => {
    if (selectedFacility) {
      fetchFacilityById(selectedFacility.facility_id)
        .then(res => {
          if (res.facility) {
            setSelectedFacility(prev => prev && prev.facility_id === res.facility.facility_id ? { ...prev, ...res.facility } : prev);
          }
          setNeighbors(res.network?.neighbors || []);
        })
        .catch(() => setNeighbors([]));
    } else {
      setNeighbors([]);
    }
  }, [selectedFacility?.facility_id]);

  // URL Deep-Link Route Sync (?facility=FAC_ID & ?view=overview|map|analytics)
  useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const facId = params.get('facility');
      const viewParam = params.get('view');

      if (facId) {
        fetchFacilityById(facId).then(res => {
          if (res.facility) {
            setSelectedFacility(res.facility);
            setNeighbors(res.network?.neighbors || []);
            setMainViewMode('facility');
          }
        });
      } else if (viewParam === 'map' || viewParam === 'analytics') {
        setMainViewMode(viewParam);
      } else {
        setMainViewMode('overview');
      }
    }

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  async function loadData() {
    setLoading(true);
    const activeState = currentUser.role === 'STATE' ? currentUser.state : selectedState;

    try {
      const [statsData, facData, analyticsData] = await Promise.all([
        fetchOverviewStats(activeState ? { state: activeState } : undefined).catch(() => null),
        fetchFacilities({ 
          state: activeState || undefined,
          risk_tier: selectedTier || undefined,
          is_silent: onlySilent ? true : undefined,
          limit: 1500
        }).catch(() => ({ facilities: [], total_count: 0, page: 1, limit: 50, total_pages: 1, filter_summary: { critical_risk: 0, high_risk: 0, medium_risk: 0, low_risk: 0, silent_facilities: 0 } })),
        fetchDatasetAnalytics(activeState || undefined).catch(() => null)
      ]);
      setStats(statsData);
      setDatasetAnalytics(analyticsData);
      const list = facData.facilities || [];
      setFacilities(list);
      setFacilityTotalCount(facData.total_count ?? list.length);
      setFacilityFilterSummary(facData.filter_summary ?? { critical_risk: 0, high_risk: 0, medium_risk: 0, low_risk: 0, silent_facilities: 0 });

      if (list.length > 0) {
        if (!selectedFacility || !list.some(f => f.facility_id === selectedFacility.facility_id)) {
          setSelectedFacility(list[0]);
        }
      } else {
        setSelectedFacility(null);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectFacility = useCallback((fac: Facility) => {
    setSelectedFacility(fac);
    setCascadingResult(null);
  }, []);

  const openFullFacilityPage = useCallback((fac: Facility) => {
    setSelectedFacility(fac);
    setCascadingResult(null);
    setMainViewMode('facility');
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    url.searchParams.set('facility', fac.facility_id);
    window.history.pushState({ facilityId: fac.facility_id }, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToView = useCallback((targetMode: 'overview' | 'map' | 'analytics' = 'overview') => {
    setMainViewMode(targetMode);
    const url = new URL(window.location.href);
    url.searchParams.delete('facility');
    if (targetMode === 'overview') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', targetMode);
    }
    window.history.pushState({ view: targetMode }, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleCopyLink = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, []);

  const handleSelectNeighbor = useCallback((neighborId: string) => {
    const target = facilities.find(f => f.facility_id === neighborId);
    if (target) {
      openFullFacilityPage(target);
    } else {
      fetchFacilityById(neighborId).then(res => {
        if (res.facility) {
          openFullFacilityPage(res.facility);
        }
      });
    }
  }, [facilities, openFullFacilityPage]);

  async function handleSimulateCascading(facId: string) {
    setSimulating(true);
    try {
      const res = await simulateCascadingRisk(facId, 35);
      setCascadingResult(res);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  }

  function handleLogin(usernameToLogin: string) {
    const trimmed = usernameToLogin.trim();
    if (!trimmed) return;

    const matchedState = ['Lagos', 'Sokoto', 'Yobe', 'Bayelsa', 'Plateau', 'Ebonyi'].find(
      s => trimmed.toLowerCase().startsWith(s.toLowerCase())
    );

    if (matchedState) {
      setCurrentUser({
        username: trimmed,
        role: 'STATE',
        state: matchedState,
        displayName: `${matchedState} State Primary Health Care Board`
      });
      setSelectedState(matchedState);
    } else {
      setCurrentUser({
        username: trimmed,
        role: 'NATIONAL',
        state: '',
        displayName: 'Federal Ministry of Health (All States)'
      });
      setSelectedState('');
    }
    setShowAuthModal(false);
    setCustomLoginInput('');
  }

  const filteredFacilities = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return facilities;
    return facilities.filter(f => 
      f.facility_name?.toLowerCase().includes(q) ||
      f.lga_name?.toLowerCase().includes(q) ||
      f.state?.toLowerCase().includes(q) ||
      (f.nhfr_facility_code && f.nhfr_facility_code.toLowerCase().includes(q))
    );
  }, [facilities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFacilities.length / itemsPerPage));
  const paginatedFacilities = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFacilities.slice(start, start + itemsPerPage);
  }, [filteredFacilities, currentPage, itemsPerPage]);

  const coldChainReadyCount = useMemo(() => facilities.filter(f => f.has_cold_chain).length, [facilities]);
  const coldChainPct = useMemo(() => facilityTotalCount > 0 ? Math.round((coldChainReadyCount / facilityTotalCount) * 100) : 0, [facilityTotalCount, coldChainReadyCount]);

  // Recharts Dataset 1: Risk Tier Breakdown — uses filter_summary (full dataset, not paginated slice)
  const riskTierChartData = useMemo(() => {
    return [
      { name: 'Critical Priority (70–100)', tierKey: 'CRITICAL', count: facilityFilterSummary.critical_risk, color: '#DC2626' },
      { name: 'High Risk (45–69)', tierKey: 'HIGH', count: facilityFilterSummary.high_risk, color: '#EA580C' },
      { name: 'Medium Risk (25–44)', tierKey: 'MEDIUM', count: facilityFilterSummary.medium_risk, color: '#D97706' },
      { name: 'Low Risk (0–24)', tierKey: 'LOW', count: facilityFilterSummary.low_risk, color: '#0F766E' },
      { name: 'Silent Blackout (≥3 wks)', tierKey: 'SILENT', count: facilityFilterSummary.silent_facilities, color: '#B45309' },
    ];
  }, [facilityFilterSummary]);

  const topUrgentFacilities = useMemo(() => {
    return [...facilities]
      .sort((a, b) => (b.base_risk_score || 0) - (a.base_risk_score || 0))
      .slice(0, 6);
  }, [facilities]);

  const topStockoutCommodities = useMemo(() => {
    return [...(datasetAnalytics?.commodity_stockouts || [])]
      .sort((a, b) => b.stockout_rate_pct - a.stockout_rate_pct)
      .slice(0, 6);
  }, [datasetAnalytics]);

  // Recharts Dataset 2: LGA Average Risk Comparison (Actual Dataset Aggregation)
  const lgaChartData = useMemo(() => {
    const lgaMap: Record<string, { lga_name: string; state: string; count: number; total_risk: number; stockouts: number }> = {};
    facilities.forEach(f => {
      const key = `${f.lga_name}`;
      if (!lgaMap[key]) {
        lgaMap[key] = { lga_name: f.lga_name, state: f.state, count: 0, total_risk: 0, stockouts: 0 };
      }
      lgaMap[key].count += 1;
      lgaMap[key].total_risk += f.base_risk_score || 0;
      if (f.ground_truth_stockout_count && f.ground_truth_stockout_count > 0) {
        lgaMap[key].stockouts += 1;
      }
    });

    return Object.values(lgaMap)
      .map(item => ({
        lga: `${item.lga_name}`,
        avgRisk: Math.round(item.total_risk / item.count),
        clinicCount: item.count,
        stockoutRate: Math.round((item.stockouts / item.count) * 100)
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk)
      .slice(0, 10);
  }, [facilities]);

  // Recharts Dataset: Facility Staffing Comparison by Type
  const facilityTypeStaffData = useMemo(() => {
    const typeMap: Record<string, { totalStaff: number; totalNurses: number; count: number }> = {};
    facilities.forEach(f => {
      const type = f.facility_type || 'PHC';
      if (!typeMap[type]) {
        typeMap[type] = { totalStaff: 0, totalNurses: 0, count: 0 };
      }
      typeMap[type].totalStaff += f.total_staff || 0;
      typeMap[type].totalNurses += f.nurses_midwives_count || 0;
      typeMap[type].count += 1;
    });

    return Object.entries(typeMap).map(([type, d]) => ({
      type: type.replace('Comprehensive Health Centre', 'CHC').replace('Primary Health Centre', 'PHC').replace('Primary Health Clinic', 'Clinic'),
      avgStaff: Math.round((d.totalStaff / d.count) * 10) / 10,
      avgNurses: Math.round((d.totalNurses / d.count) * 10) / 10,
      count: d.count
    }));
  }, [facilities]);

  return (
    <div className="app-layout">
      {/* LEFT VERTICAL SIDEBAR (NAVIGATION STYLE OPTION A) */}
      <aside className="app-sidebar">
        <div>
          {/* Brand header */}
          <div className="sidebar-brand">
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--teal-primary) 0%, var(--teal-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Activity size={21} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Repulse
                </span>
                <span className="badge-clean badge-blue" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                  Engine
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Vulnerability Triage
              </div>
            </div>
          </div>

          {/* Navigation links */}
          <div className="sidebar-nav">
            <div className="sidebar-section-title">Navigation</div>
            <button
              onClick={() => navigateToView('overview')}
              className={`sidebar-nav-item ${mainViewMode === 'overview' ? 'active' : ''}`}
            >
              <Activity size={18} />
              <span>Overview</span>
            </button>
            <button
              onClick={() => navigateToView('map')}
              className={`sidebar-nav-item ${mainViewMode === 'map' ? 'active' : ''}`}
            >
              <MapIcon size={18} />
              <span>Live Map</span>
            </button>
            <button
              onClick={() => navigateToView('analytics')}
              className={`sidebar-nav-item ${mainViewMode === 'analytics' ? 'active' : ''}`}
            >
              <BarChart3 size={18} />
              <span>Visual Analytics</span>
            </button>
            {selectedFacility && (
              <button
                onClick={() => openFullFacilityPage(selectedFacility)}
                className={`sidebar-nav-item ${mainViewMode === 'facility' ? 'active' : ''}`}
              >
                <Building2 size={18} />
                <span>Facility Page</span>
              </button>
            )}

            <div className="sidebar-section-title" style={{ marginTop: '16px' }}>Operational Scope</div>
            <div style={{
              padding: '12px 14px',
              background: '#FFFFFF',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Jurisdiction
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {currentUser.role === 'STATE' ? `${currentUser.state} State` : (selectedState ? `${selectedState} State` : 'National Scope (6 Zones)')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {facilityTotalCount.toLocaleString()} Monitored PHCs
              </div>
            </div>
          </div>
        </div>

        {/* User profile card at bottom */}
        <div
          className="sidebar-profile"
          onClick={() => setShowAuthModal(true)}
          title="Switch operational role or agency login"
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--blue-subtle)',
            border: '1px solid var(--blue-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Shield size={17} color="var(--blue-primary)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser.username}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
              {currentUser.role === 'STATE' ? `${currentUser.state} PHCB` : 'FMOH National'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="app-workspace">
        {/* Slim Workspace Top Bar */}
        <header className="app-topbar">
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Good morning, {currentUser.username.replace('_', ' ')} 👋
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Repulse Spatial Epidemiological Intelligence Dashboard
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentUser.role === 'NATIONAL' && (
              <select
                value={selectedState}
                onChange={e => { setSelectedState(e.target.value); setCurrentPage(1); }}
                className="input-clean"
                style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                aria-label="Scope by state"
              >
                <option value="">All States (6 Zones)</option>
                <option value="Sokoto">Sokoto State</option>
                <option value="Yobe">Yobe State</option>
                <option value="Ebonyi">Ebonyi State</option>
                <option value="Plateau">Plateau State</option>
                <option value="Bayelsa">Bayelsa State</option>
                <option value="Lagos">Lagos State</option>
              </select>
            )}

            <button
              onClick={handleCopyLink}
              className="btn btn-outline"
              style={{ padding: '7px 12px', fontSize: '13px' }}
              title="Copy deep link to current view"
            >
              <Share2 size={14} color="var(--text-muted)" />
              {copiedLink ? 'Copied!' : 'Share'}
            </button>

            <button 
              onClick={loadData}
              className="btn btn-outline"
              style={{ padding: '7px 13px', fontSize: '13px' }}
              title="Refresh database records"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </header>

        {/* Main Content Workspace */}
        <main
          className="main-content"
          style={{
            padding: mainViewMode === 'map' ? '0' : '24px 32px',
            maxWidth: mainViewMode === 'map' ? '100%' : '1680px',
            margin: '0 auto',
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: mainViewMode === 'map' ? '0px' : '20px'
          }}
        >

          {/* PAGE 1: EXECUTIVE OVERVIEW BENTO GRID */}
          {mainViewMode === 'overview' && (
            <div className="bento-grid">
              {/* COLUMN 1 (~1.15fr, 3 asymmetric rows) */}
              <div className="bento-col">
                {/* Row 1A: Viridian Green Hero Briefing Card */}
                <section
                  style={{
                    padding: '26px 28px',
                    background: 'linear-gradient(135deg, #0F766E 0%, #0D5C56 100%)',
                    borderRadius: '16px',
                    border: '1px solid #115E59',
                    boxShadow: '0 12px 32px rgba(15, 118, 110, 0.22)',
                    color: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.18)',
                        border: '1px solid rgba(255, 255, 255, 0.32)',
                        color: '#FFFFFF',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: '6px',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase'
                      }}
                    >
                      Live Network Briefing
                    </span>
                    <span style={{ fontSize: '13px', color: '#CCFBF1', fontWeight: 600 }}>
                      {currentUser.displayName}
                    </span>
                  </div>

                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: '1.25' }}>
                      Primary Healthcare Vulnerability Overview
                    </h1>
                    <p style={{ fontSize: '14px', color: '#E6FFFA', marginTop: '6px', lineHeight: '1.5' }}>
                      Operational summary of facility risk posture, reporting blackouts, cold chain readiness, and essential commodity shortages across monitored wards.
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTriageOpen(true);
                        navigateToView('map');
                      }}
                      style={{
                        height: '42px',
                        padding: '0 20px',
                        fontSize: '14.5px',
                        fontWeight: 700,
                        background: '#FFFFFF',
                        color: '#0F766E',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.14)',
                        transition: 'all 0.14s ease'
                      }}
                    >
                      <MapIcon size={16} color="#0F766E" />
                      Launch Full-Screen Map &rarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToView('analytics')}
                      style={{
                        height: '42px',
                        padding: '0 16px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.14)',
                        color: '#FFFFFF',
                        border: '1px solid rgba(255, 255, 255, 0.35)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px'
                      }}
                    >
                      <BarChart3 size={15} color="#FFFFFF" />
                      Visual Analytics
                    </button>
                  </div>
                </section>

                {/* Row 1B: Network Risk Posture Donut Ring Chart */}
                <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Facility Vulnerability Posture
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Proportional risk distribution across {facilityTotalCount.toLocaleString()} active clinics
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateToView('analytics')}
                      className="btn btn-outline"
                      style={{ fontSize: '12.5px', padding: '5px 10px' }}
                    >
                      Analytics <ArrowUpRight size={13} />
                    </button>
                  </div>

                  {/* Donut Chart with Centered Number */}
                  <div style={{ position: 'relative', width: '100%', height: '210px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={riskTierChartData.slice(0, 4)}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={94}
                          paddingAngle={4}
                          cornerRadius={5}
                        >
                          {riskTierChartData.slice(0, 4).map((entry, index) => (
                            <Cell key={`donut-cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div style={{ background: '#1C2424', color: '#FFFFFF', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                                  <div style={{ fontWeight: 700 }}>{data.name}</div>
                                  <div style={{ marginTop: '2px', color: '#D1D5DB' }}>{data.count} facilities ({facilityTotalCount > 0 ? Math.round((data.count / facilityTotalCount) * 100) : 0}%)</div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Centered Total */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none'
                    }}>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {loading ? '…' : facilityTotalCount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px' }}>
                        Monitored PHCs
                      </div>
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingTop: '4px' }}>
                    {riskTierChartData.slice(0, 4).map(tier => {
                      const pct = facilityTotalCount > 0 ? Math.round((tier.count / facilityTotalCount) * 100) : 0;
                      return (
                        <div
                          key={tier.tierKey}
                          onClick={() => {
                            setSelectedTier(tier.tierKey);
                            setOnlySilent(false);
                            setTriageOpen(true);
                            navigateToView('map');
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            transition: 'all 0.12s ease'
                          }}
                          title={`Filter map to ${tier.name}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tier.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {tier.tierKey}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: tier.color }}>
                            {tier.count} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Row 1C: Highest-Risk Priority Clinics List */}
                <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Highest-Risk Priority Clinics
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Click any clinic to open full diagnostic dossier
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTriageOpen(true);
                        navigateToView('map');
                      }}
                      className="btn btn-outline"
                      style={{ fontSize: '12.5px', padding: '5px 10px' }}
                    >
                      Full Queue <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {loading ? (
                      <div className="loading-message" role="status">Loading top clinics…</div>
                    ) : topUrgentFacilities.slice(0, 4).map(fac => {
                      const dotColor = fac.risk_tier === 'CRITICAL' ? '#DC2626' 
                                    : fac.risk_tier === 'HIGH' ? '#EA580C' 
                                    : fac.risk_tier === 'MEDIUM' ? '#D97706' : '#0F766E';
                      return (
                        <div
                          key={fac.facility_id}
                          onClick={() => openFullFacilityPage(fac)}
                          className="panel-row"
                          style={{
                            padding: '12px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px'
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 700, color: 'var(--blue-primary)' }}>
                                {fac.nhfr_facility_code || fac.facility_id}
                              </span>
                              {fac.is_silent && (
                                <span className="badge-clean badge-amber" style={{ padding: '1px 6px', fontSize: '10.5px' }}>
                                  Silent ({fac.weeks_since_last_report || 3}w)
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {fac.facility_name}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                              {fac.lga_name} LGA, {fac.state}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {fac.base_risk_score}
                            </span>
                            <ArrowUpRight size={15} color="var(--blue-primary)" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* COLUMN 2 (~1.25fr, 3 cards: Micro-Capsules row, Commodity Stockouts, Priority LGAs) */}
              <div className="bento-col">
                {/* Row 2A: 3 Micro-Stat Capsule Cards in a row */}
                <div className="capsule-grid">
                  {/* Capsule 1: Critical Priority */}
                  <div
                    className="capsule-card"
                    onClick={() => {
                      setSelectedTier('CRITICAL');
                      setOnlySilent(false);
                      setTriageOpen(true);
                      navigateToView('map');
                    }}
                    title="Filter live map to critical priority clinics"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Critical Triage
                      </span>
                      <AlertTriangle size={16} color="#DC2626" />
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#DC2626', lineHeight: 1 }}>
                      {loading ? '…' : (stats?.critical_risk_count ?? '—')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Score &ge; 70 immediate triage
                    </div>
                  </div>

                  {/* Capsule 2: Silent Blackout */}
                  <div
                    className="capsule-card"
                    onClick={() => {
                      setOnlySilent(true);
                      setSelectedTier('');
                      setTriageOpen(true);
                      navigateToView('map');
                    }}
                    title="Filter live map to silent blackout clinics"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Blackouts
                      </span>
                      <Radio size={16} color="#D97706" />
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#D97706', lineHeight: 1 }}>
                      {loading ? '…' : (stats?.silent_facilities_count ?? facilityFilterSummary.silent_facilities)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      &ge;3 missed reports
                    </div>
                  </div>

                  {/* Capsule 3: Cold Chain Readiness */}
                  <div
                    className="capsule-card"
                    onClick={() => {
                      setAnalyticsSubTab('facilities');
                      navigateToView('analytics');
                    }}
                    title="View cold chain readiness breakdown"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Cold Chain
                      </span>
                      <Thermometer size={16} color="#0F766E" />
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F766E', lineHeight: 1 }}>
                      {loading ? '…' : `${coldChainPct}%`}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {coldChainReadyCount} solar direct-drive clinics
                    </div>
                  </div>
                </div>

                {/* Row 2B: Highest Essential Commodity Stockout Rates */}
                <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Highest Commodity Stockout Rates
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Share of monitored healthcare facilities currently facing zero stock
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAnalyticsSubTab('commodities');
                        navigateToView('analytics');
                      }}
                      className="btn btn-outline"
                      style={{ fontSize: '12.5px', padding: '5px 10px' }}
                    >
                      All Items <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topStockoutCommodities.length > 0 ? (
                      topStockoutCommodities.map(comm => {
                        const badgeClass = comm.stockout_rate_pct >= 50 ? 'badge-clean badge-red' : comm.stockout_rate_pct >= 25 ? 'badge-clean badge-amber' : 'badge-clean badge-green';
                        return (
                          <div
                            key={comm.commodity_id}
                            className="panel-row"
                            style={{
                              padding: '12px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px'
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.25' }}>
                                {comm.name}
                              </div>
                              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {comm.category} • Avg {comm.avg_days_stocked_out}d out • {comm.total_unmet_demand?.toLocaleString()} unfulfilled doses
                              </div>
                            </div>

                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                              <span className={badgeClass} style={{ fontSize: '13px', padding: '2px 8px' }}>
                                {comm.stockout_rate_pct}% Stockout
                              </span>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                {comm.stockout_facilities} of {comm.total_facilities} clinics
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading commodity stockouts…</div>
                    )}
                  </div>
                </div>

                {/* Row 2C: Priority LGA Vulnerability Ranking */}
                <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        High-Vulnerability Local Government Areas (LGAs)
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Highest average facility vulnerability risk scores
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAnalyticsSubTab('lgas');
                        navigateToView('analytics');
                      }}
                      className="btn btn-outline"
                      style={{ fontSize: '12.5px', padding: '5px 10px' }}
                    >
                      Compare LGAs <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {lgaChartData.slice(0, 5).map(item => (
                      <div
                        key={item.lga}
                        className="panel-row"
                        style={{
                          padding: '11px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.lga} LGA
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {item.clinicCount} Monitored PHCs • {item.stockoutRate}% Stockout Burden
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={item.avgRisk >= 60 ? 'badge-clean badge-red' : item.avgRisk >= 40 ? 'badge-clean badge-amber' : 'badge-clean badge-green'} style={{ fontSize: '13px' }}>
                            Avg Risk: {item.avgRisk}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* PAGE 2: FULL-SCREEN MAP WITH COLLAPSIBLE FLOATING TRIAGE DRAWER & EMBEDDED FILTERS */}
        {mainViewMode === 'map' && (
          <div
            className="facility-map-wrap"
            style={{
              position: 'relative',
              width: '100%',
              height: 'calc(100vh - 70px)',
              minHeight: '620px'
            }}
          >
            {/* Full-Screen Edge-to-Edge Interactive Map */}
            <FacilityMap
              facilities={filteredFacilities}
              selectedFacility={selectedFacility}
              neighbors={neighbors}
              cascadingResult={cascadingResult}
              onSelectFacility={handleSelectFacility}
              onInspectFacility={openFullFacilityPage}
              fullBleed={true}
            />

            {/* Floating Re-open Button when Triage Drawer is closed */}
            {!triageOpen && (
              <button
                type="button"
                onClick={() => setTriageOpen(true)}
                className="btn btn-outline"
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  zIndex: 450,
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 700,
                  boxShadow: '0 10px 28px rgba(28, 36, 36, 0.16)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-medium)'
                }}
              >
                <PanelLeftOpen size={17} color="var(--blue-primary)" />
                Triage & Filters ({filteredFacilities.length})
              </button>
            )}

            {/* Floating Collapsible Left Triage Drawer (Warm Cream Surface Holding Search/Filters + Crisp White PHC Cards) */}
            {triageOpen && (
              <aside className="triage-drawer" aria-label="Facility triage queue and filters">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Triage Queue
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({filteredFacilities.length})
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="btn btn-outline"
                      style={{ padding: '5px 8px' }}
                      title="Previous page"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 2px' }}>
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="btn btn-outline"
                      style={{ padding: '5px 8px' }}
                      title="Next page"
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTriageOpen(false)}
                      className="btn btn-outline"
                      style={{ padding: '5px 8px', marginLeft: '2px' }}
                      title="Close triage drawer to view full map"
                      aria-label="Close triage drawer"
                    >
                      <PanelLeftClose size={16} />
                    </button>
                  </div>
                </div>

                {/* Compact Embedded Search & Filters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-medium)' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search facility, LGA, NHFR..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="input-clean"
                      style={{ width: '100%', paddingLeft: '36px', fontSize: '13.5px', height: '38px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <select
                      value={currentUser.role === 'STATE' ? currentUser.state : selectedState}
                      onChange={e => { setSelectedState(e.target.value); setCurrentPage(1); }}
                      disabled={currentUser.role === 'STATE'}
                      className="input-clean"
                      style={{ cursor: currentUser.role === 'STATE' ? 'not-allowed' : 'pointer', fontSize: '13px', height: '36px', padding: '4px 10px' }}
                    >
                      {currentUser.role === 'STATE' ? (
                        <option value={currentUser.state}>{currentUser.state}</option>
                      ) : (
                        <>
                          <option value="">All States</option>
                          <option value="Sokoto">Sokoto</option>
                          <option value="Yobe">Yobe</option>
                          <option value="Ebonyi">Ebonyi</option>
                          <option value="Plateau">Plateau</option>
                          <option value="Bayelsa">Bayelsa</option>
                          <option value="Lagos">Lagos</option>
                        </>
                      )}
                    </select>

                    <select
                      value={selectedTier}
                      onChange={e => { setSelectedTier(e.target.value); setCurrentPage(1); }}
                      className="input-clean"
                      style={{ cursor: 'pointer', fontSize: '13px', height: '36px', padding: '4px 10px' }}
                    >
                      <option value="">All Tiers</option>
                      <option value="CRITICAL">Critical (70+)</option>
                      <option value="HIGH">High (45–69)</option>
                      <option value="MEDIUM">Medium (25–44)</option>
                      <option value="LOW">Low (0–24)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => { setOnlySilent(!onlySilent); setCurrentPage(1); }}
                      className={onlySilent ? 'btn btn-primary' : 'btn btn-outline'}
                      style={{ flex: 1, justifyContent: 'center', fontSize: '13px', height: '34px', padding: '4px 10px' }}
                    >
                      {onlySilent ? 'Silent Only (Active)' : 'Filter Silent Blackouts'}
                    </button>
                    {(searchQuery || selectedTier || onlySilent || (currentUser.role === 'NATIONAL' && selectedState)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedTier('');
                          setOnlySilent(false);
                          if (currentUser.role === 'NATIONAL') setSelectedState('');
                          setCurrentPage(1);
                        }}
                        className="btn btn-outline"
                        style={{ fontSize: '12.5px', height: '34px', padding: '4px 10px' }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Clickable PHC Cards -> Direct Navigation to Facility ID Page */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '9px', overflowY: 'auto', paddingRight: '2px' }}>
                  {loading ? (
                    <div className="loading-message" role="status">Loading facilities…</div>
                  ) : paginatedFacilities.length > 0 ? (
                    paginatedFacilities.map(fac => {
                      const isSelected = selectedFacility?.facility_id === fac.facility_id;
                      const dotColor = fac.risk_tier === 'CRITICAL' ? '#DC2626' 
                                    : fac.risk_tier === 'HIGH' ? '#EA580C' 
                                    : fac.risk_tier === 'MEDIUM' ? '#D97706' : '#0F766E';

                      return (
                        <div 
                          key={fac.facility_id}
                          onClick={() => openFullFacilityPage(fac)}
                          className={`panel-row ${isSelected ? 'panel-row-selected' : ''}`}
                          style={{
                            padding: '14px 16px',
                            cursor: 'pointer',
                          }}
                          title={`Click to open ${fac.facility_name} dossier`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: 'var(--blue-primary)',
                                background: 'var(--bg-subtle)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '5px',
                                padding: '2px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {fac.nhfr_facility_code || fac.facility_id}
                              <ArrowUpRight size={12} />
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
                              <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {fac.base_risk_score}
                              </span>
                            </div>
                          </div>

                          <div style={{ fontWeight: 700, fontSize: '16px', color: isSelected ? 'var(--blue-primary)' : 'var(--text-primary)', lineHeight: '1.3' }}>
                            {fac.facility_name}
                          </div>
                          <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {fac.lga_name} LGA, {fac.state}
                          </div>

                          <div style={{ marginTop: '7px', fontSize: '13.5px', color: 'var(--text-body)', lineHeight: '1.4' }}>
                            {fac.top_reason_summary?.split('•')[0] || 'Standard baseline parameters'}
                          </div>

                          {fac.is_silent && (
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#D97706', fontWeight: 600 }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D97706' }} />
                              Silent ({fac.weeks_since_last_report || 3} wks missed)
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
                      No facilities found.
                    </div>
                  )}
                </div>

                {/* Drawer Footer */}
                <div style={{ borderTop: '1px solid var(--border-medium)', paddingTop: '10px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {loading ? 'Updating facility list…' : `${filteredFacilities.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, filteredFacilities.length)} of ${filteredFacilities.length}`}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={loading || currentPage <= 1}
                      className="btn btn-outline"
                      style={{ padding: '5px 11px', fontSize: '13px' }}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={loading || currentPage >= totalPages}
                      className="btn btn-outline"
                      style={{ padding: '5px 11px', fontSize: '13px' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* PAGE 4: DEDICATED FULL-PAGE FACILITY DOSSIER (?facility=FAC_ID) */}
        {mainViewMode === 'facility' && selectedFacility && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Breadcrumb & Quick Actions Bar */}
            <div className="panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => navigateToView('map')}
                  className="btn btn-outline"
                  style={{ gap: '6px', fontSize: '14px' }}
                >
                  <ChevronLeft size={16} />
                  Back to Map
                </button>
                <button
                  type="button"
                  onClick={() => navigateToView('overview')}
                  className="btn btn-outline"
                  style={{ fontSize: '14px' }}
                >
                  Overview
                </button>
                <span style={{ color: 'var(--border-medium)' }}>|</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13.5px', fontWeight: 700, color: 'var(--blue-primary)' }}>
                  Facility ID: {selectedFacility.nhfr_facility_code || selectedFacility.facility_id}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                className="btn btn-outline"
                style={{ gap: '7px', fontSize: '14px' }}
              >
                <Share2 size={15} />
                {copiedLink ? 'Direct Link Copied!' : 'Copy Facility URL'}
              </button>
            </div>

            {/* Facility Profile Master Banner */}
            <div className="panel" style={{ padding: '26px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <span className="badge-clean badge-blue">
                      Risk Score: {selectedFacility.base_risk_score} / 100
                    </span>
                    <span className={`badge-clean ${
                      selectedFacility.risk_tier === 'CRITICAL' ? 'badge-red' :
                      selectedFacility.risk_tier === 'HIGH' ? 'badge-amber' :
                      selectedFacility.risk_tier === 'LOW' ? 'badge-green' : 'badge-amber'
                    }`}>
                      {selectedFacility.risk_tier} PRIORITY
                    </span>
                    {selectedFacility.is_silent && (
                      <span className="badge-clean badge-amber">
                        Silent Facility ({selectedFacility.weeks_since_last_report || 3} wks missed)
                      </span>
                    )}
                    <span className="badge-clean">
                      {selectedFacility.is_rural ? 'Rural Zone' : 'Urban Zone'}
                    </span>
                  </div>

                  <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                    {selectedFacility.facility_name}
                  </h1>
                  <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={16} /> {selectedFacility.lga_name} LGA, {selectedFacility.state} State
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={16} /> {selectedFacility.facility_type} ({selectedFacility.ownership})
                    </span>
                    <span>•</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13.5px' }}>
                      GPS: {selectedFacility.latitude?.toFixed(4)}, {selectedFacility.longitude?.toFixed(4)}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSimulateCascading(selectedFacility.facility_id)}
                  disabled={simulating}
                  className="btn btn-primary"
                  style={{ padding: '12px 20px', fontSize: '14.5px' }}
                >
                  <Zap size={16} />
                  {simulating ? 'Running Shock Simulation...' : 'Simulate Stockout Spillover (+35 pts)'}
                </button>
              </div>
            </div>

            {/* Dedicated Clinical Readiness Card with Visual Icons on Every Tile */}
            <section className="panel" style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Clinical Readiness
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Facility capacity, vaccine preservation infrastructure, catchment load, and reporting health
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                {/* Card 1: Clinical Staffing */}
                <div style={{ background: 'var(--bg-subtle)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'var(--blue-subtle)',
                    border: '1px solid var(--blue-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Users size={21} color="var(--blue-primary)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Clinical Staffing
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                      {selectedFacility.total_staff} Staff
                    </div>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-body)', marginTop: '2px' }}>
                      {selectedFacility.nurses_midwives_count} Nurses & Midwives
                    </div>
                  </div>
                </div>

                {/* Card 2: Cold Chain Preservation */}
                <div style={{ background: 'var(--bg-subtle)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: selectedFacility.has_cold_chain ? 'var(--blue-subtle)' : '#FEF2F2',
                    border: selectedFacility.has_cold_chain ? '1px solid var(--blue-border)' : '1px solid #FECACA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Thermometer size={21} color={selectedFacility.has_cold_chain ? 'var(--blue-primary)' : '#DC2626'} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Cold Chain Unit
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: selectedFacility.has_cold_chain ? 'var(--blue-primary)' : '#DC2626', marginTop: '3px' }}>
                      {selectedFacility.has_cold_chain ? 'Operational' : 'Unavailable'}
                    </div>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-body)', marginTop: '2px' }}>
                      {selectedFacility.has_cold_chain ? 'Solar Direct-Drive Fridge' : 'Requires Cold Chain Deployment'}
                    </div>
                  </div>
                </div>

                {/* Card 3: Catchment Population */}
                <div style={{ background: 'var(--bg-subtle)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'var(--blue-subtle)',
                    border: '1px solid var(--blue-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Shield size={21} color="var(--blue-primary)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Catchment Pop.
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                      {selectedFacility.catchment_population?.toLocaleString() || 'N/A'}
                    </div>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-body)', marginTop: '2px' }}>
                      Estimated residents served
                    </div>
                  </div>
                </div>

                {/* Card 4: GSM & Telemetry Reporting */}
                <div style={{ background: 'var(--bg-subtle)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: selectedFacility.is_silent ? '#FFFBEB' : 'var(--blue-subtle)',
                    border: selectedFacility.is_silent ? '1px solid #FDE68A' : '1px solid var(--blue-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Radio size={21} color={selectedFacility.is_silent ? '#D97706' : 'var(--blue-primary)'} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      GSM & Telemetry
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                      {Math.round(selectedFacility.gsm_connectivity_score * 100)}% Signal
                    </div>
                    <div style={{ fontSize: '13.5px', color: selectedFacility.is_silent ? '#D97706' : 'var(--text-body)', marginTop: '2px', fontWeight: selectedFacility.is_silent ? 600 : 400 }}>
                      Report delay: {selectedFacility.weeks_since_last_report} wk(s)
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Two-Column Full Inspection Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
              {/* Left Column: Diagnostic Risk Drivers + Essential Commodities */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="panel" style={{ padding: '24px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <AlertTriangle size={18} color="var(--blue-primary)" />
                    Diagnostic Vulnerability Drivers
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedFacility.detailed_reasons?.length > 0 ? (
                      selectedFacility.detailed_reasons.map((reason, idx) => (
                        <div key={idx} style={{
                          padding: '13px 16px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '10px',
                          fontSize: '14.5px',
                          color: 'var(--text-body)',
                          lineHeight: '1.5'
                        }}>
                          {reason}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '14.5px', color: 'var(--text-muted)' }}>
                        {selectedFacility.top_reason_summary || 'Standard baseline operational risk profile.'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <Package size={18} color="var(--blue-primary)" />
                      Essential Commodities Stock ({selectedFacility.commodities?.length || 0})
                    </h2>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>Week 52 Audit</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedFacility.commodities?.length > 0 ? (
                      selectedFacility.commodities.map(comm => {
                        const badgeClass = comm.status === 'ADEQUATE' ? 'badge-clean badge-green'
                                        : comm.status === 'STOCKOUT' ? 'badge-clean badge-red'
                                        : 'badge-clean badge-amber';
                        return (
                          <div key={comm.commodity_id} style={{
                            padding: '14px 16px',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {comm.name}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                {comm.category} • Unit: {comm.unit}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                              <span className={badgeClass}>{comm.status}</span>
                              <span style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: comm.status === 'STOCKOUT' ? '#DC2626' : comm.status === 'LOW' ? '#D97706' : '#0F766E'
                              }}>
                                {comm.estimated_days_remaining}d supply
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: '14.5px', color: 'var(--text-muted)' }}>
                        No commodity stock records returned for this facility.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Spatial Catchments & Cascade Simulator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="panel" style={{ padding: '24px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <Layers size={18} color="var(--blue-primary)" />
                    Spatial Referral Neighbors ({neighbors.length})
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Click any neighboring facility to navigate to its dedicated page.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {neighbors.length > 0 ? (
                      neighbors.map(neighbor => (
                        <div
                          key={neighbor.facility_id}
                          onClick={() => handleSelectNeighbor(neighbor.facility_id)}
                          className="panel-row"
                          style={{
                            padding: '14px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                              {neighbor.facility_name}
                            </div>
                            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              {neighbor.distance_km} km away • Staff: {neighbor.total_staff} • Cold Chain: {neighbor.has_cold_chain ? 'Yes' : 'No'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="badge-clean">Risk: {neighbor.neighbor_base_risk}</span>
                            <ArrowUpRight size={16} color="var(--blue-primary)" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '14.5px', color: 'var(--text-muted)' }}>
                        Loading nearest spatial network neighbors...
                      </div>
                    )}
                  </div>
                </div>

                {/* Cascading Stockout Simulator Panel */}
                <div className="panel" style={{ padding: '24px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <Zap size={18} color="var(--blue-primary)" />
                    Cascading Stockout Simulator
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.5' }}>
                    Simulate a sudden supply stockout at {selectedFacility.facility_name} to model patient spillover load across its {neighbors.length} nearest neighboring clinics.
                  </p>

                  <button
                    type="button"
                    onClick={() => handleSimulateCascading(selectedFacility.facility_id)}
                    disabled={simulating}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: '14.5px' }}
                  >
                    <Zap size={16} />
                    {simulating ? 'Simulating Spillover...' : 'Trigger Stockout Shock (+35 pts)'}
                  </button>

                  {cascadingResult && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Neighboring Clinics Impacted ({cascadingResult.direct_hop1_neighbors?.length || 0})
                      </div>
                      {cascadingResult.direct_hop1_neighbors?.map(n => (
                        <div key={n.facility_id} style={{
                          padding: '13px 16px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--text-primary)' }}>{n.facility_name}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{n.distance_km} km radial distance</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="badge-clean badge-blue">+{n.added_risk} pts</span>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Risk: {n.original_risk} ➔ {n.new_risk}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: VISUAL ANALYTICS (RECHARTS BAR CHARTS POWERED DIRECTLY BY THE DATASET) */}
        {mainViewMode === 'analytics' && (
          <div className="analytics-view" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Analytics Sub-Navigation Bar */}
            <div className="analytics-nav" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-surface)',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                <button
                  onClick={() => setAnalyticsSubTab('commodities')}
                  className={`tab-btn ${analyticsSubTab === 'commodities' ? 'tab-btn-active' : ''}`}
                >
                  <Package size={14} />
                  Essential Commodities Stockout ({datasetAnalytics?.commodity_stockouts.length || 8})
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('lgas')}
                  className={`tab-btn ${analyticsSubTab === 'lgas' ? 'tab-btn-active' : ''}`}
                >
                  <MapPin size={14} />
                  LGA Vulnerability Index ({datasetAnalytics?.lga_vulnerability.length || 0} LGAs)
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('reporting')}
                  className={`tab-btn ${analyticsSubTab === 'reporting' ? 'tab-btn-active' : ''}`}
                >
                  <Radio size={14} />
                  Reporting Latency & Blackouts
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('states')}
                  className={`tab-btn ${analyticsSubTab === 'states' ? 'tab-btn-active' : ''}`}
                >
                  <TrendingUp size={14} />
                  State & Zone Comparisons
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('facilities')}
                  className={`tab-btn ${analyticsSubTab === 'facilities' ? 'tab-btn-active' : ''}`}
                >
                  <Building2 size={14} />
                  Staffing & Infrastructure
                </button>
              </div>

              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge-clean badge-blue">
                  Dataset Source: {datasetAnalytics?.total_facilities ?? facilities.length} Monitored Facilities
                </span>
              </div>
            </div>

            {/* TAB 1: ESSENTIAL COMMODITIES STOCKOUT BAR CHARTS */}
            {analyticsSubTab === 'commodities' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
                {/* Main Stockout Rate % Bar Chart */}
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Essential Commodity Stockout Rates (% of Facilities)
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Computed across all {datasetAnalytics?.total_facilities || facilities.length} healthcare facilities in scope
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.commodity_stockouts || []} 
                        layout="vertical"
                        margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" horizontal={false} vertical={true} />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} width={160} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [
                            `${val}% stockout rate (${item.payload.stockout_facilities} of ${item.payload.total_facilities} facilities)`,
                            item.payload.name
                          ]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <ReferenceLine x={50} stroke="#DC2626" strokeDasharray="3 3" label={{ value: 'Severe Shortage (50%)', fill: '#DC2626', fontSize: 11 }} />
                        <Bar dataKey="stockout_rate_pct" name="Stockout Rate %" radius={[0, 4, 4, 0]}>
                          {(datasetAnalytics?.commodity_stockouts || []).map((entry, idx) => (
                            <Cell key={`cell-comm-${idx}`} fill={entry.stockout_rate_pct >= 50 ? '#DC2626' : entry.stockout_rate_pct >= 25 ? '#EA580C' : '#0F766E'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                    * Measles and Oxytocin display highest stockout frequency due to cold-chain dependency.
                  </div>
                </div>

                {/* Secondary Unmet Demand Units Bar Chart */}
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Unmet Patient Demand (Estimated Doses / Packs)
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Aggregated shortfall volume from stockout intervals in active dataset
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.commodity_stockouts || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          formatter={(val: any) => [`${Number(val).toLocaleString()} units`, 'Total Unmet Demand']}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Bar dataKey="total_unmet_demand" fill="#0F766E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                    * Units represent unfulfilled prescriptions during stockout episodes.
                  </div>
                </div>

                {/* Full Commodities Data Table */}
                <div className="panel" style={{ gridColumn: 'span 2', padding: '22px' }}>
                  <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    Essential Commodities Inventory Summary Table
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px 8px' }}>Commodity Name</th>
                          <th style={{ padding: '10px 8px' }}>Category</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right' }}>Stockout Clinics</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right' }}>Stockout Rate</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right' }}>Avg Days Stocked Out</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right' }}>Unmet Demand</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cold Chain Breaches</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datasetAnalytics?.commodity_stockouts.map(comm => (
                          <tr key={comm.commodity_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '11px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{comm.name}</td>
                            <td style={{ padding: '11px 8px', color: 'var(--text-muted)' }}>{comm.category}</td>
                            <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 600 }}>{comm.stockout_facilities} / {comm.total_facilities}</td>
                            <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 800, color: comm.stockout_rate_pct >= 50 ? '#DC2626' : comm.stockout_rate_pct >= 25 ? '#EA580C' : '#0F766E' }}>
                              {comm.stockout_rate_pct}%
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right', color: 'var(--text-body)' }}>{comm.avg_days_stocked_out}d</td>
                            <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--blue-primary)' }}>{comm.total_unmet_demand.toLocaleString()} units</td>
                            <td style={{ padding: '11px 8px', textAlign: 'right', color: comm.cold_chain_breaches > 0 ? '#DC2626' : 'var(--text-muted)' }}>{comm.cold_chain_breaches}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: LGA VULNERABILITY INDEX BAR CHART */}
            {analyticsSubTab === 'lgas' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                {/* Chart: LGA Average Risk Score */}
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      LGA Mean Vulnerability Risk Score
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Calculated from ground-truth features across {datasetAnalytics?.lga_vulnerability.length || 0} LGAs
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.lga_vulnerability || []} 
                        margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="lga_name" tick={{ fontSize: 11, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} label={{ value: 'Avg Risk', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#94A3B8' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val}/100`, `${item.payload.lga_name} (${item.payload.state})`]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <ReferenceLine y={70} stroke="#DC2626" strokeDasharray="3 3" label={{ value: 'Critical (70)', fill: '#DC2626', fontSize: 11 }} />
                        <Bar dataKey="avg_risk_score" name="Avg Risk Score" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.lga_vulnerability || []).map((entry, idx) => (
                            <Cell key={`cell-lga-${idx}`} fill={entry.avg_risk_score >= 70 ? '#DC2626' : entry.avg_risk_score >= 45 ? '#EA580C' : '#0F766E'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart: LGA Stockout Rate % vs Immunization Coverage */}
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      LGA Stockout Rate % vs Immunization Rate %
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Comparison of facility stockout incidence vs full childhood immunization
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.lga_vulnerability || []} 
                        margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="lga_name" tick={{ fontSize: 11, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12.5px', paddingTop: '8px' }} />
                        <Bar dataKey="stockout_rate_pct" name="Stockout Rate %" fill="#DC2626" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="immunization_rate_pct" name="Immunization Rate %" fill="#0F766E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: REPORTING LATENCY & SILENCE DISTRIBUTION */}
            {analyticsSubTab === 'reporting' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Facility Distribution by Reporting Latency
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Number of primary health centers by missed weekly report intervals
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.reporting_latency_distribution || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748B' }} label={{ value: 'Clinics Count', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#94A3B8' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val} clinics (${item.payload.percentage}%)`, 'Count']}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Bar dataKey="count" name="Facilities Count" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.reporting_latency_distribution || []).map((entry, idx) => {
                            const color = idx >= 3 ? '#DC2626' : idx >= 2 ? '#EA580C' : idx === 1 ? '#D97706' : '#0F766E';
                            return <Cell key={`cell-rep-${idx}`} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Silence Insights Card */}
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Information Decay Architecture
                  </div>
                  <div style={{ fontSize: '13.5px', color: 'var(--text-body)', lineHeight: '1.55' }}>
                    When a clinic misses reports, standard dashboards assume stocks are stable. 
                    The <strong>Repulse Risk Engine</strong> implements time-decay penalty:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Week 1 Missed: Warning Delay</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>+6 risk points applied due to unverified buffer.</div>
                    </div>

                    <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Week 2 Missed: Moderate Drift</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>+14 risk points applied with synthetic consumption projection.</div>
                    </div>

                    <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Week 3+ Missed: Blackout Threshold</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>+24 risk points applied. Immediate escalation to silent triage queue.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STATE & ZONE COMPARISONS */}
            {analyticsSubTab === 'states' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      State Average Risk Score Comparison
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Aggregated across all focal states
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.state_comparison || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="state" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val}/100`, `${item.payload.state} (${item.payload.zone})`]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Bar dataKey="avg_risk" name="Avg Risk Score" fill="#0F766E" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.state_comparison || []).map((entry, idx) => (
                            <Cell key={`cell-st-${idx}`} fill={entry.avg_risk >= 70 ? '#DC2626' : entry.avg_risk >= 45 ? '#EA580C' : '#0F766E'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Cold Chain Coverage % vs Clinical Staff Density
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Infrastructure readiness by state
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.state_comparison || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="state" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12.5px', paddingTop: '8px' }} />
                        <Bar dataKey="cold_chain_pct" name="Cold Chain %" fill="#0F766E" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_staff" name="Avg Staff Density" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: FACILITY LEVEL INFRASTRUCTURE & STAFFING */}
            {analyticsSubTab === 'facilities' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Staff Density by Health Facility Level
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Average total staff, nurse-midwives, and CHEWs per facility category
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.facility_type_breakdown || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="facility_type" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12.5px', paddingTop: '8px' }} />
                        <Bar dataKey="avg_staff" name="Total Staff" fill="#0F766E" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_nurses" name="Nurses / Midwives" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_chews" name="CHEWs" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Infrastructure Electrification & Water (% Equipped)
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Solar power, borehole water, and cold chain distribution
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.facility_type_breakdown || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E6E1" vertical={false} />
                        <XAxis dataKey="facility_type" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E6E1', borderRadius: '8px', fontSize: '12.5px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12.5px', paddingTop: '8px' }} />
                        <Bar dataKey="solar_pct" name="Solar Power %" fill="#0F766E" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="water_pct" name="Borehole Water %" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cold_chain_pct" name="Cold Chain %" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>
      </div>

      {/* State / Role Login Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="panel" style={{ maxWidth: '440px', width: '100%', padding: '22px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
              Officer Account & State Scope
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Select a state officer demo account or enter your username:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {DEMO_PRESET_USERS.map(u => (
                <button
                  key={u.username}
                  onClick={() => {
                    setCurrentUser(u);
                    setSelectedState(u.state);
                    setShowAuthModal(false);
                  }}
                  className={`btn ${currentUser.username === u.username ? 'btn-primary' : 'btn-outline'}`}
                  style={{ justifyContent: 'flex-start', fontSize: '12px', padding: '8px 10px' }}
                >
                  {u.username}
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '14px', display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="e.g. Lagos_Lead, Sokoto_Officer"
                value={customLoginInput}
                onChange={e => setCustomLoginInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(customLoginInput); }}
                className="input-clean"
                style={{ flex: 1 }}
              />
              <button onClick={() => handleLogin(customLoginInput)} className="btn btn-primary">
                Login
              </button>
            </div>

            <button
              onClick={() => setShowAuthModal(false)}
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '10px', justifyContent: 'center' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
