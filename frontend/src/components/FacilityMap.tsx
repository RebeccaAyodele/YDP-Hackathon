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
}

function getMarkerColor(fac: Facility): string {
  if (fac.is_silent) return '#D97706'; // Amber for silent
  if (fac.risk_tier === 'CRITICAL') return '#DC2626'; // Red for critical
  if (fac.risk_tier === 'HIGH') return '#EA580C'; // Orange for high
  if (fac.risk_tier === 'MEDIUM') return '#D97706'; // Amber for medium
  return '#16A34A'; // Green for low risk
}

function createPopupContent(fac: Facility): string {
  const riskColor = fac.risk_tier === 'CRITICAL' ? '#DC2626' : fac.risk_tier === 'HIGH' ? '#EA580C' : fac.risk_tier === 'MEDIUM' ? '#D97706' : '#16A34A';
  return `
    <div style="font-family: Inter, -apple-system, sans-serif; padding: 6px; min-width: 190px; color: #0F172A;">
      <div style="font-weight: 700; font-size: 13px; color: #0052FF;">${fac.facility_name}</div>
      <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
        ${fac.lga_name} LGA, <strong>${fac.state}</strong> (${fac.facility_type})
      </div>
      <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11.5px; font-weight: 700; color: ${riskColor};">
          Score: ${fac.base_risk_score}/100 [${fac.risk_tier}]
        </span>
        ${fac.is_silent ? '<span style="font-size: 10px; font-weight: 700; color: #D97706; background: #FEF3C7; padding: 1px 5px; border-radius: 3px;">SILENT</span>' : ''}
      </div>
      <div style="font-size: 11px; color: #4B5563; margin-top: 4px;">
        Staff: <strong>${fac.total_staff}</strong> • Cold Chain: <strong>${fac.has_cold_chain ? 'Equipped' : 'None'}</strong>
      </div>
    </div>
  `;
}

function FacilityMapComponent({
  facilities,
  selectedFacility,
  neighbors = [],
  cascadingResult,
  onSelectFacility
}: FacilityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const networkLayerRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [9.0820, 8.6753],
      zoom: 6,
      zoomControl: true,
      preferCanvas: true,
      wheelDebounceTime: 60,
      inertia: true,
      zoomAnimation: true,
      fadeAnimation: true,
    });

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

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
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
        radius: isSelected ? 9.5 : (fac.risk_tier === 'CRITICAL' ? 6 : 4.5),
        fillColor: color,
        fillOpacity: isSelected ? 1 : 0.85,
        color: isSelected ? '#0052FF' : '#FFFFFF',
        weight: isSelected ? 3.5 : 1.2,
      });

      circleMarker.bindPopup(createPopupContent(fac), {
        offset: [0, -4]
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
      const trueColor = currentFac ? getMarkerColor(currentFac) : '#16A34A';
      currentMarker.setStyle({
        radius: 9.5,
        color: '#0052FF',
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
                color: cascadingResult ? '#DC2626' : '#0052FF',
                weight: cascadingResult ? 3 : 2,
                dashArray: cascadingResult ? '6, 4' : '4, 4',
                opacity: 0.85,
              }
            ).addTo(networkLayer);

            const neighborMarker = markerMapRef.current.get(neighbor.facility_id);
            if (neighborMarker) {
              neighborMarker.setStyle({
                radius: 7.5,
                weight: 2,
                color: cascadingResult ? '#DC2626' : '#0052FF',
              });
            }
          }
        });
      }
    }
  }, [selectedFacility?.facility_id, neighbors, cascadingResult, facilities]);

  return (
    <div style={{ height: '100%', width: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-light)', position: 'relative', background: '#F8FAFC' }}>
      <div
        ref={mapContainerRef}
        style={{ height: '100%', width: '100%' }}
      />

      {/* Clear Status Legend */}
      <div style={{
        position: 'absolute',
        bottom: '14px',
        right: '14px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)',
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 1000,
        fontSize: '11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Risk Indicator Dots</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#DC2626' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Critical Priority (70–100)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#EA580C' }} />
          <span style={{ color: 'var(--text-secondary)' }}>High Risk (45–69)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#D97706' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Medium / Silent (25–44)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#16A34A' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Low Risk (0–24)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0052FF' }} />
          <span style={{ color: 'var(--blue-primary)', fontWeight: 700 }}>Selected Inspection</span>
        </div>
      </div>
    </div>
  );
}

const FacilityMap = memo(FacilityMapComponent);
export default FacilityMap;
