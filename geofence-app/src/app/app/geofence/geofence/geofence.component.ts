import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { v4 as uuidv4 } from 'uuid';
import { BackendZone, ZoneService } from '../../../zone.service';
import { firstValueFrom } from 'rxjs';

interface Zone {
  _id: string;
  name: string;
  coordinates: L.LatLng[];
  layer?: L.Polyline;
  active?: boolean;
  visibleOnMap?: boolean;
}

@Component({
  selector: 'app-geofence',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './geofence.component.html',
  styleUrls: ['./geofence.component.scss'],
  providers: [ZoneService]
})
export class GeofenceComponent implements AfterViewInit {

  @ViewChild('tablePanel') tablePanel!: ElementRef;
  @ViewChild('mapPanel') mapPanel!: ElementRef;

  map!: L.Map;

  // Sidebar
  sidebarActive = false;

  // Panel
  panelVisible = false;
  tablePanelWidth = 0;

  // Zone drawing
  isDrawing = false;
  drawingCoords: L.LatLng[] = [];
  mainPolyline?: L.Polyline;
  previewLine?: L.Polyline;

  zoneName = '';
  showZoneNamePopup = false;
  duplicateZonePopup = false;
  zoneCreatedMessage = '';
  showZoneCreatedPopup = false;

  savedZones: Zone[] = [];

  searchPlaceName = '';
  searchLatitude?: number;
  searchLongitude?: number;

  // Resizing
  isResizing = false;
  resizeStart = 0;
  startWidth = 0;

  // Undo/Redo
  undoStack: L.LatLng[] = [];

  constructor(private zoneService: ZoneService) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadZonesFromLocalStorage(); // load persistent zones first
    this.loadZones();                  // then fetch from backend (optional)
  }

  // ---------------- Map ----------------
  initMap() {
    this.map = L.map('map').setView([11.0168, 76.9558], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  // ---------------- Sidebar ----------------
  toggleSidebar() {
    this.sidebarActive = !this.sidebarActive;
  }

  // ---------------- Panel Toggle ----------------
  togglePanel() {
    const panel = this.tablePanel.nativeElement as HTMLElement;
    if (this.panelVisible) {
      this.tablePanelWidth = panel.offsetWidth;
      panel.style.width = '0px';
      this.panelVisible = false;
    } else {
      panel.style.width = this.tablePanelWidth > 0 ? `${this.tablePanelWidth}px` : '40%';
      this.panelVisible = true;
    }
    setTimeout(() => this.map.invalidateSize(), 300);
  }

  // ---------------- Resizing ----------------
  startResize(event: MouseEvent) {
    this.isResizing = true;
    this.resizeStart = event.clientX;
    this.startWidth = this.tablePanel.nativeElement.offsetWidth;

    document.addEventListener('mousemove', this.onResizing);
    document.addEventListener('mouseup', this.stopResize);
  }

  onResizing = (event: MouseEvent) => {
    if (!this.isResizing) return;
    const dx = event.clientX - this.resizeStart;
    const newWidth = this.startWidth + dx;
    if (newWidth > 200 && newWidth < window.innerWidth - 200) {
      this.tablePanel.nativeElement.style.width = `${newWidth}px`;
      this.tablePanelWidth = newWidth;
      this.map.invalidateSize();
    }
  };

  stopResize = () => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.onResizing);
    document.removeEventListener('mouseup', this.stopResize);
  };

  // ---------------- Search ----------------
  searchPlace() {
    if (this.searchLatitude != null && this.searchLongitude != null) {
      this.map.setView([this.searchLatitude, this.searchLongitude], 14);
      return;
    }
    if (this.searchPlaceName.trim()) {
      const q = encodeURIComponent(this.searchPlaceName);
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}`)
        .then(r => r.json())
        .then((d: any) => {
          if (d && d.length > 0) {
            this.map.setView([parseFloat(d[0].lat), parseFloat(d[0].lon)], 14);
          }
        });
    }
  }

  // ---------------- Drawing ----------------
  startDrawingZone() {
    if (this.isDrawing) return;
    this.isDrawing = true;
    this.drawingCoords = [];

    if (this.mainPolyline) this.map.removeLayer(this.mainPolyline);
    if (this.previewLine) this.map.removeLayer(this.previewLine);

    this.mainPolyline = L.polyline([], { color: '#007bff', weight: 4 }).addTo(this.map);
    this.previewLine = L.polyline([], { color: '#999', weight: 2, dashArray: '6,6' }).addTo(this.map);

    this.map.on('click', this.onMapClickAddPoint);
    this.map.on('mousemove', this.onMapMouseMovePreview);
    this.map.on('dblclick', this.finishZone);
  }

  onMapClickAddPoint = (e: L.LeafletMouseEvent) => {
    this.drawingCoords.push(e.latlng);
    this.mainPolyline?.setLatLngs(this.drawingCoords);
  };

  onMapMouseMovePreview = (e: L.LeafletMouseEvent) => {
    if (!this.isDrawing || this.drawingCoords.length === 0) return;
    const preview = [...this.drawingCoords, e.latlng];
    this.previewLine?.setLatLngs(preview);
  };

  finishZone = () => {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.map.off('click', this.onMapClickAddPoint);
    this.map.off('mousemove', this.onMapMouseMovePreview);
    this.map.off('dblclick', this.finishZone);

    if (this.drawingCoords.length < 3) {
      if (this.mainPolyline) this.map.removeLayer(this.mainPolyline);
      if (this.previewLine) this.map.removeLayer(this.previewLine);
      this.drawingCoords = [];
      return;
    }

    this.showZoneNamePopup = true;
  };

  // ---------------- Save Zone ----------------
  async saveZone() {
    const name = this.zoneName.trim();
    if (!name) return;

    if (this.savedZones.some(z => z.name.toLowerCase() === name.toLowerCase())) {
      this.duplicateZonePopup = true;
      return;
    }
    this.duplicateZonePopup = false;

    if (this.drawingCoords.length < 3) return;

    const newZone: Zone = {
      _id: uuidv4(),
      name,
      coordinates: [...this.drawingCoords],
      layer: L.polyline(this.drawingCoords, { color: '#2ecc71', weight: 4 }),
      active: true,
      visibleOnMap: false
    };

    // Save locally
    this.savedZones.push(newZone);
    this.saveZones();

    // Reset drawing
    this.resetDrawingState(newZone.name);

    // Send to backend (optional)
    const backendData: BackendZone = {
      name: newZone.name,
      coordinates: newZone.coordinates.map(c => ({ lat: c.lat, lng: c.lng }))
    };

    try {
      const saved = await firstValueFrom(this.zoneService.createZone(backendData));
      newZone._id = saved._id ?? newZone._id;
      this.saveZones(); // update localStorage with backend ID
    } catch (err) {
      console.error('Error saving to backend:', err);
    }
  }

  cancelZoneCreation() {
    this.showZoneNamePopup = false;
    if (this.mainPolyline) this.map.removeLayer(this.mainPolyline);
    if (this.previewLine) this.map.removeLayer(this.previewLine);
    this.drawingCoords = [];
  }

  // ---------------- View / Unview Map ----------------
  viewZone(id: string) {
    const zone = this.savedZones.find(z => z._id === id);
    if (!zone || !zone.layer) return;
    this.map.addLayer(zone.layer);
    zone.visibleOnMap = true;
    this.map.fitBounds(zone.layer.getBounds());
  }

  unviewZone(id: string) {
    const zone = this.savedZones.find(z => z._id === id);
    if (!zone || !zone.layer) return;
    this.map.removeLayer(zone.layer);
    zone.visibleOnMap = false;
  }

  // ---------------- Delete Zone ----------------
  async deleteZone(id: string) {
    try {
      await firstValueFrom(this.zoneService.deleteZone(id));
      const zone = this.savedZones.find(z => z._id === id);
      if (zone?.layer) this.map.removeLayer(zone.layer);
      this.savedZones = this.savedZones.filter(z => z._id !== id);
      this.saveZones();
    } catch (err) {
      console.error('Error deleting zone:', err);
      alert('Failed to delete zone. Please try again.');
    }
  }

  // ---------------- Load Zones from Backend ----------------
  async loadZones() {
    try {
      const zones: BackendZone[] = await firstValueFrom(this.zoneService.getZones());
      this.savedZones = zones.map(z => ({
        _id: z._id ?? uuidv4(),
        name: z.name,
        coordinates: z.coordinates.map(c => L.latLng(c.lat, c.lng)),
        layer: L.polyline(z.coordinates.map(c => L.latLng(c.lat, c.lng)), { color: '#2ecc71', weight: 4 }),
        active: true,
        visibleOnMap: false
      }));
      this.saveZones(); // persist backend zones locally
    } catch (err) {
      console.error('Error loading zones:', err);
    }
  }

  // ---------------- LocalStorage ----------------
  saveZones() {
    localStorage.setItem('zones', JSON.stringify(this.savedZones.map(z => ({
      _id: z._id,
      name: z.name,
      coordinates: z.coordinates.map(c => ({ lat: c.lat, lng: c.lng }))
    }))));
  }

  loadZonesFromLocalStorage() {
    const saved = localStorage.getItem('zones');
    if (!saved) return;
    const zones = JSON.parse(saved) as { _id: string; name: string; coordinates: { lat: number; lng: number }[] }[];
    this.savedZones = zones.map(z => ({
      _id: z._id,
      name: z.name,
      coordinates: z.coordinates.map(c => L.latLng(c.lat, c.lng)),
      layer: L.polyline(z.coordinates.map(c => L.latLng(c.lat, c.lng)), { color: '#2ecc71', weight: 4 }),
      active: true,
      visibleOnMap: false
    }));
  }

  // ---------------- Undo / Redo ----------------
  undoPoint() {
    if (!this.isDrawing || this.drawingCoords.length === 0) return;
    const lastPoint = this.drawingCoords.pop();
    if (lastPoint) this.undoStack.push(lastPoint);
    this.mainPolyline?.setLatLngs(this.drawingCoords);
    this.previewLine?.setLatLngs(this.drawingCoords);
  }

  redoPoint() {
    if (!this.isDrawing || this.undoStack.length === 0) return;
    const redoPoint = this.undoStack.pop()!;
    this.drawingCoords.push(redoPoint);
    this.mainPolyline?.setLatLngs(this.drawingCoords);
    this.previewLine?.setLatLngs(this.drawingCoords);
  }

  // ---------------- Helper ----------------
  resetDrawingState(name: string) {
    this.zoneName = '';
    this.showZoneNamePopup = false;
    if (this.mainPolyline) this.map.removeLayer(this.mainPolyline);
    if (this.previewLine) this.map.removeLayer(this.previewLine);
    this.drawingCoords = [];
    this.mainPolyline = undefined;
    this.previewLine = undefined;

    this.zoneCreatedMessage = `Zone "${name}" created`;
    this.showZoneCreatedPopup = true;
    setTimeout(() => (this.showZoneCreatedPopup = false), 2000);
  }
}
