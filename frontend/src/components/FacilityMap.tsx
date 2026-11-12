import React, { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Facility, NeighborDetail, CascadingSimulationResponse } from '../types/index.ts';

interface FacilityMapProps {
  facilities: Facility[];
  selectedFacility: Facility | null;
  neighbors?: NeighborDetail[];
  cascadingResult?: CascadingSimulationResponse | null;
  onSelectFacility: (fac: Facility) => void;
  onInspectFacility?: (fac: Facility) => void;
  fullBleed?: boolean;
}

function getMarkerColor(fac: Facility): string {
  if (fac.is_silent) return '#D97706'; // Amber for silent
  if (fac.risk_tier === 'CRITICAL') return '#DC2626'; // Red for critical
  if (fac.risk_tier === 'HIGH') return '#EA580C'; // Orange for high
  if (fac.risk_tier === 'MEDIUM') return '#D97706'; // Amber for medium
  return '#0F766E'; // Deep Viridian Spruce Green for low risk
}

function createPopupContent(fac: Facility, showInspectAction: boolean): string {
  const riskColor = fac.risk_tier === 'CRITICAL' ? '#DC2626' : fac.risk_tier === 'HIGH' ? '#EA580C' : fac.risk_tier === 'MEDIUM' ? '#D97706' : '#0F766E';
  return `
    <div style="font-family: 'IBM Plex Sans', -apple-system, sans-serif; padding: 6px; min-width: 230px; color: #1C2424;">
      <div style="font-size: 12px; font-family: 'IBM Plex Mono', monospace; color: #0F766E; font-weight: 700;">${fac.nhfr_facility_code || fac.facility_id}</div>
      <div style="font-weight: 700; font-size: 15px; color: #1C2424; margin-top: 3px; line-height: 1.3;">${fac.facility_name}</div>
      <div style="font-size: 13px; color: #6B7280; margin-top: 3px;">
        ${fac.lga_name} LGA, <strong style="color: #1C2424;">${fac.state}</strong> (${fac.facility_type})
      </div>
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E7E6E1; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 13px; font-weight: 700; color: ${riskColor};">
          Score: ${fac.base_risk_score}/100 [${fac.risk_tier}]
        </span>
        ${fac.is_silent ? '<span style="font-size: 11px; font-weight: 700; color: #D97706; background: #FEF3C7; padding: 2px 7px; border-radius: 4px;">SILENT</span>' : ''}
      </div>
      <div style="font-size: 12.5px; color: #4B5563; margin-top: 6px;">
        Staff: <strong>${fac.total_staff}</strong> • Cold Chain: <strong>${fac.has_cold_chain ? 'Solar Refrigerator' : 'None'}</strong>
      </div>
      ${showInspectAction ? `
        <button
          type="button"
          data-inspect-facility="${fac.facility_id}"
          style="margin-top: 10px; width: 100%; padding: 8px 12px; background: #0F766E; color: #FFFFFF; border: none; border-radius: 7px; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer;"
        >
          Open Facility Page &rarr;
        </button>
      ` : ''}
    </div>
  `;
}

function FacilityMapComponent({
  facilities,
  selectedFacility,
  neighbors = [],
  cascadingResult,
  onSelectFacility,
  onInspectFacility,
  fullBleed = false
}: FacilityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const networkLayerRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);
  const onInspectRef = useRef(onInspectFacility);
  onInspectRef.current = onInspectFacility;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [9.0820, 8.6753],
      zoom: 6,
      zoomControl: false,
      preferCanvas: true,
      wheelDebounceTime: 60,
      inertia: true,
      zoomAnimation: true,
      fadeAnimation: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map);

    const canvasRenderer = L.canvas({ padding: 0.25 });
    canvasRendererRef.current = canvasRenderer;

    markersLayerRef.current = L.layerGroup().addTo(map);
    networkLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const invalidate = () => {
      if (map) map.invalidateSize();
    };

    invalidate();
    const timer1 = setTimeout(invalidate, 100);
    const timer2 = setTimeout(invalidate, 400);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => invalidate());
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers Batch
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!map || !markersLayer || !canvasRenderer) return;

    markersLayer.clearLayers();
    markerMapRef.current.clear();

    const selectedId = selectedFacility?.facility_id;

    facilities.forEach(fac => {
      if (!fac.latitude || !fac.longitude) return;

      const isSelected = fac.facility_id === selectedId;
      const color = getMarkerColor(fac);

      const circleMarker = L.circleMarker([fac.latitude, fac.longitude], {
        renderer: canvasRenderer,
        radius: isSelected ? 10 : (fac.risk_tier === 'CRITICAL' ? 6.5 : 5),
        fillColor: color,
        fillOpacity: isSelected ? 1 : 0.85,
        color: isSelected ? '#0F766E' : '#FFFFFF',
        weight: isSelected ? 3.5 : 1.5,
      });

      circleMarker.bindPopup(createPopupContent(fac, Boolean(onInspectRef.current)), {
        offset: [0, -4]
      });

      circleMarker.on('popupopen', (e) => {
        const popupEl = e.popup.getElement();
        const btn = popupEl?.querySelector(`[data-inspect-facility="${fac.facility_id}"]`);
        if (btn) {
          btn.addEventListener('click', () => {
            onInspectRef.current?.(fac);
          }, { once: true });
        }
      });

      circleMarker.on('click', () => {
        onSelectFacility(fac);
      });

      markersLayer.addLayer(circleMarker);
      markerMapRef.current.set(fac.facility_id, circleMarker);
    });

    if (facilities.length > 0 && facilities.length < 500) {
      const bounds = L.latLngBounds(facilities.map(f => [f.latitude, f.longitude]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
      }
    }
  }, [facilities, onSelectFacility]);

  // Handle Dynamic Selected Marker Style
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const currentId = selectedFacility?.facility_id;

    if (prevId && markerMapRef.current.has(prevId)) {
      const prevMarker = markerMapRef.current.get(prevId)!;
      const prevFac = facilities.find(f => f.facility_id === prevId);
      if (prevFac) {
        const color = getMarkerColor(prevFac);
        prevMarker.setStyle({
          radius: prevFac.risk_tier === 'CRITICAL' ? 6 : 4.5,
          color: '#FFFFFF',
          weight: 1.2,
          fillColor: color,
          fillOpacity: 0.85,
        });
      }
    }

    if (currentId && markerMapRef.current.has(currentId)) {
      const currentMarker = markerMapRef.current.get(currentId)!;
      const currentFac = facilities.find(f => f.facility_id === currentId);
      const trueColor = currentFac ? getMarkerColor(currentFac) : '#0F766E';
      currentMarker.setStyle({
        radius: 10,
        color: '#0F766E',
        weight: 3.5,
        fillColor: trueColor,
        fillOpacity: 1,
      });
      currentMarker.bringToFront();
    }

    prevSelectedIdRef.current = currentId || null;
  }, [selectedFacility?.facility_id, facilities]);

  // Spatial Adjacency Network Lines
  useEffect(() => {
    const map = mapInstanceRef.current;
    const networkLayer = networkLayerRef.current;
    if (!map || !networkLayer) return;

    networkLayer.clearLayers();

    if (selectedFacility && selectedFacility.latitude && selectedFacility.longitude) {
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom, 10);

      map.flyTo([selectedFacility.latitude, selectedFacility.longitude], targetZoom, {
        duration: 0.4,
        easeLinearity: 0.5,
      });

      if (neighbors && neighbors.length > 0) {
        neighbors.forEach(neighbor => {
          const targetFac = facilities.find(f => f.facility_id === neighbor.facility_id);
          if (targetFac && targetFac.latitude && targetFac.longitude) {
            L.polyline(
              [
                [selectedFacility.latitude, selectedFacility.longitude],
                [targetFac.latitude, targetFac.longitude],
              ],
              {
                color: cascadingResult ? '#DC2626' : '#0F766E',
                weight: cascadingResult ? 3 : 2.5,
                dashArray: cascadingResult ? '6, 4' : '4, 4',
                opacity: 0.9,
              }
            ).addTo(networkLayer);

            const neighborMarker = markerMapRef.current.get(neighbor.facility_id);
            if (neighborMarker) {
              neighborMarker.setStyle({
                radius: 7.5,
                weight: 2,
                color: cascadingResult ? '#DC2626' : '#0F766E',
              });
            }
          }
        });
      }
    }
  }, [selectedFacility?.facility_id, neighbors, cascadingResult, facilities]);

  return (
    <div style={{
      height: '100%',
      minHeight: '620px',
      width: '100%',
      borderRadius: fullBleed ? '0px' : '14px',
      overflow: 'hidden',
      border: fullBleed ? 'none' : '1px solid var(--border-medium)',
      position: 'relative',
      background: '#D8D6CE',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div
        ref={mapContainerRef}
        style={{ height: '100%', width: '100%', flex: 1, minHeight: '620px' }}
      />

      {/* Clear Status Legend */}
      <div style={{
        position: 'absolute',
        bottom: '18px',
        right: '18px',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(8px)',
        padding: '14px 18px',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-md)',
        zIndex: 440,
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
      }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>Triage Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#DC2626' }} />
          <span style={{ color: 'var(--text-body)' }}>Critical Priority (70–100)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#EA580C' }} />
          <span style={{ color: 'var(--text-body)' }}>High Risk (45–69)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#D97706' }} />
          <span style={{ color: 'var(--text-body)' }}>Medium / Silent (25–44)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0F766E' }} />
          <span style={{ color: 'var(--text-body)' }}>Low Risk (0–24)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '5px', marginTop: '2px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0F766E', boxShadow: '0 0 0 2px rgba(15, 118, 110, 0.25)' }} />
          <span style={{ color: 'var(--blue-primary)', fontWeight: 700 }}>Selected Inspection</span>
        </div>
      </div>
    </div>
  );
}

const FacilityMap = memo(FacilityMapComponent);
export default FacilityMap;
