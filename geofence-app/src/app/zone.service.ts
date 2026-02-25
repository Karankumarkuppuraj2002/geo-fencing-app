import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BackendZone {
  _id?: string;
  name: string;
  coordinates: { lat: number; lng: number }[];
  isZoneActive?: number; // 1 or 0
  isTrue?: number;       // 1 or 0

}


@Injectable({
  providedIn: 'root'
})
export class ZoneService {
private apiUrl = 'http://localhost:3000/api/zones';



  constructor(private http: HttpClient) {}

  getZones(): Observable<BackendZone[]> {
    return this.http.get<BackendZone[]>(this.apiUrl);
  }

  createZone(zone: BackendZone): Observable<BackendZone> {
    return this.http.post<BackendZone>(this.apiUrl, zone);
  }

  deleteZone(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
