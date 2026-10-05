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
  if (fac.is_silent) return '#f59e0b';
  if (fac.risk_tier === 'CRITICAL') return '#ef4444';
  if (fac.risk_tier === 'HIGH') return '#f97316';
  if (fac.risk_tier === 'MEDIUM') return '#eab308';
  return '#10b981';
}

function createPopupContent(fac: Facility): string {
  return `
    <div style="font-family: sans-serif; padding: 4px; min-width: 180px; color: #0f172a;">
      <div style="font-weight: 700; font-size: 0.9rem;">${fac.facility_name}</div>
      <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">
        ${fac.lga_name} LGA, ${fac.state} (${fac.geopolitical_zone})
      </div>
      <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; font-weight: 700;">
          Risk: ${fac.base_risk_score}/100 (${fac.risk_tier})
        </span>
        ${fac.is_silent ? '<span style="color: #d97706; font-weight: 700; font-size: 0.7rem;">⚠️ SILENT</span>' : ''}
      </div>
      <div style="font-size: 0.72rem; color: #475569; margin-top: 4px;">
        Staff: ${fac.total_staff} • Cold Chain: ${fac.has_cold_chain ? 'Yes' : 'No'}
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

  // Initialize Map with Hardware-Accelerated Canvas & Parallelized Tile Layer
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [9.0820, 8.6753],
      zoom: 6,
      zoomControl: true,
      preferCanvas: true,
      wheelDebounceTime: 60,
      wheelPxPerZoomLevel: 100,
      inertia: true,
      inertiaDeceleration: 3000,
      inertiaMaxSpeed: 1500,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    // Parallel multi-subdomain tile fetching for zero-lag panning
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
      updateWhenIdle: true,
      updateWhenZooming: false,
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

  // Update/Rebuild markers cleanly using Canvas with lazy popups
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!map || !markersLayer || !canvasRenderer) return;

    markersLayer.clearLayers();
    markerMapRef.current.clear();

    facilities.forEach(fac => {
      if (!fac.latitude || !fac.longitude) return;

      const isSelected = selectedFacility?.facility_id === fac.facility_id;
      const color = getMarkerColor(fac);
      const radius = isSelected ? 10 : fac.risk_tier === 'CRITICAL' ? 7 : 5;

      const circle = L.circleMarker([fac.latitude, fac.longitude], {
        renderer: canvasRenderer,
        radius,
        fillColor: color,
        fillOpacity: isSelected ? 1 : 0.85,
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 3 : 1.5,
      });

      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectFacility(fac);
        
        // Lazy dynamic popup creation on click
        L.popup()
          .setLatLng([fac.latitude, fac.longitude])
          .setContent(createPopupContent(fac))
          .openOn(map);
      });

      circle.addTo(markersLayer);
      markerMapRef.current.set(fac.facility_id, circle);
    });
  }, [facilities]);

  // Fast lightweight selection highlight without rebuilding markers
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const currentId = selectedFacility?.facility_id;

    if (prevId && markerMapRef.current.has(prevId)) {
      const prevMarker = markerMapRef.current.get(prevId)!;
      const prevFac = facilities.find(f => f.facility_id === prevId);
      if (prevFac) {
        const color = getMarkerColor(prevFac);
        prevMarker.setStyle({
          radius: prevFac.risk_tier === 'CRITICAL' ? 7 : 5,
          color: color,
          weight: 1.5,
          fillOpacity: 0.85,
        });
      }
    }

    if (currentId && markerMapRef.current.has(currentId)) {
      const currentMarker = markerMapRef.current.get(currentId)!;
      currentMarker.setStyle({
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1,
      });
      currentMarker.bringToFront();
    }

    prevSelectedIdRef.current = currentId || null;
  }, [selectedFacility?.facility_id]);

  // Smooth camera centering and polyline network rendering
  useEffect(() => {
    const map = mapInstanceRef.current;
    const networkLayer = networkLayerRef.current;
    if (!map || !networkLayer) return;

    networkLayer.clearLayers();

    if (selectedFacility && selectedFacility.latitude && selectedFacility.longitude) {
      map.stop();
      
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom, 10);
      
      map.flyTo([selectedFacility.latitude, selectedFacility.longitude], targetZoom, {
        duration: 0.45,
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
                color: cascadingResult ? '#ef4444' : '#06b6d4',
                weight: cascadingResult ? 3.5 : 2.5,
                dashArray: cascadingResult ? '8, 6' : '4, 6',
                opacity: 0.9,
              }
            ).addTo(networkLayer);
          }
        });
      }
    }
  }, [selectedFacility?.facility_id, neighbors, cascadingResult]);

  return (
    <div style={{ height: '100%', minHeight: '650px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
      <div
        ref={mapContainerRef}
        style={{ height: '100%', minHeight: '650px', width: '100%', background: '#0f172a' }}
      />

      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(8px)',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        zIndex: 1000,
        fontSize: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: 'none'
      }}>
        <div style={{ fontWeight: 700, marginBottom: '2px', color: '#fff' }}>Geospatial Triage Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span>Critical Risk (70-100)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
          <span>High Risk (50-69)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }} />
          <span>Medium Risk (30-49)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          <span>Low Risk (0-29)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
          <span>Silent / Non-Reporting</span>
        </div>
      </div>
    </div>
  );
}

const FacilityMap = memo(FacilityMapComponent);
export default FacilityMap;
