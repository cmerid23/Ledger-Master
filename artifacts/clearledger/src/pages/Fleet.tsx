import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  Fuel, MapPin, Car, X, ChevronRight, Info, BarChart3, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: number;
  businessId: number;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  licensePlate: string | null;
  vin: string | null;
  odometerStart: string | null;
  fuelType: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  totalMiles: number;
  mileageLogCount: number;
  totalGallons: number;
  totalFuelCost: number;
  fuelLogCount: number;
}

interface MileageLog {
  id: number;
  vehicleId: number | null;
  jobId: number | null;
  driverName: string | null;
  date: string;
  startLocation: string | null;
  endLocation: string | null;
  odometerStart: string | null;
  odometerEnd: string | null;
  miles: number;
  purpose: string | null;
  tripType: string;
  notes: string | null;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
  deductionValue: number;
  irsRate: number;
}

interface FuelLog {
  id: number;
  vehicleId: number | null;
  jobId: number | null;
  date: string;
  stationName: string | null;
  state: string | null;
  gallons: string | null;
  pricePerGallon: string | null;
  totalAmount: string | null;
  odometer: string | null;
  fuelType: string;
  iftaReportable: boolean;
  notes: string | null;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const num = (v: string | number | null | undefined) => Number(v ?? 0);

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const FUEL_TYPES = ["diesel", "gasoline", "electric", "hybrid", "propane", "cng"];
const TRIP_TYPES = ["business", "personal", "medical", "charity"];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY",
  "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function apiHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// VEHICLES TAB
// ══════════════════════════════════════════════════════════════

function VehiclesTab({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const EMPTY = { name: "", make: "", model: "", year: "", licensePlate: "", vin: "", odometerStart: "", fuelType: "diesel", notes: "" };
  const [form, setForm] = useState(EMPTY);

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["vehicles", businessId],
    queryFn: async () => {
      const r = await fetch(`/api/vehicles?businessId=${businessId}`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editing ? `/api/vehicles/${editing.id}` : "/api/vehicles";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: apiHeaders(), body: JSON.stringify({ ...data, businessId, year: data.year ? Number(data.year) : null }) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles", businessId] });
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY);
      toast({ title: editing ? "Vehicle updated" : "Vehicle added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/vehicles/${id}`, { method: "DELETE", headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles", businessId] }); setDeletingId(null); toast({ title: "Vehicle removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() { setEditing(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({ name: v.name, make: v.make ?? "", model: v.model ?? "", year: v.year ? String(v.year) : "", licensePlate: v.licensePlate ?? "", vin: v.vin ?? "", odometerStart: v.odometerStart ?? "", fuelType: v.fuelType, notes: v.notes ?? "" });
    setModalOpen(true);
  }

  const sf = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading vehicles…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} registered</p>
        <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" />Add Vehicle</Button>
      </div>

      {vehicles.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No vehicles yet</p>
          <p className="text-sm mt-1">Add your first vehicle to start tracking mileage and fuel.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <Card key={v.id} className={!v.isActive ? "opacity-60" : ""}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{v.name}</p>
                      {(v.year || v.make || v.model) && (
                        <p className="text-xs text-muted-foreground">{[v.year, v.make, v.model].filter(Boolean).join(" ")}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {deletingId === v.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteMutation.mutate(v.id)} className="px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
                          {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                        </button>
                        <button onClick={() => setDeletingId(null)} className="px-2 py-0.5 text-xs border rounded"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingId(v.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {v.licensePlate && <Badge variant="outline" className="text-xs">{v.licensePlate}</Badge>}
                  <Badge variant="outline" className="text-xs capitalize">{v.fuelType}</Badge>
                  {!v.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Miles</p>
                    <p className="font-semibold">{v.totalMiles.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fuel Cost</p>
                    <p className="font-semibold">{fmt(v.totalFuelCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fuel Logs</p>
                    <p className="text-muted-foreground">{v.fuelLogCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gallons</p>
                    <p className="text-muted-foreground">{num(v.totalGallons).toFixed(1)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setEditing(null); setForm(EMPTY); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Vehicle Name *</Label>
                <Input placeholder='e.g. "Truck 1" or "Van - ABC123"' value={form.name} onChange={sf("name")} required />
              </div>
              <div className="space-y-1">
                <Label>Make</Label>
                <Input placeholder="Freightliner" value={form.make} onChange={sf("make")} />
              </div>
              <div className="space-y-1">
                <Label>Model</Label>
                <Input placeholder="Cascadia" value={form.model} onChange={sf("model")} />
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input type="number" placeholder="2022" min="1900" max="2030" value={form.year} onChange={sf("year")} />
              </div>
              <div className="space-y-1">
                <Label>License Plate</Label>
                <Input placeholder="ABC-1234" value={form.licensePlate} onChange={sf("licensePlate")} />
              </div>
              <div className="space-y-1">
                <Label>VIN</Label>
                <Input placeholder="1FUJGHDV..." value={form.vin} onChange={sf("vin")} />
              </div>
              <div className="space-y-1">
                <Label>Starting Odometer</Label>
                <Input type="number" placeholder="125000" step="0.1" value={form.odometerStart} onChange={sf("odometerStart")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Fuel Type</Label>
                <select value={form.fuelType} onChange={(e) => setForm((p) => ({ ...p, fuelType: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize">
                  {FUEL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Input placeholder="Any additional notes" value={form.notes} onChange={sf("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {editing ? "Save Changes" : "Add Vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MILEAGE LOGS TAB
// ══════════════════════════════════════════════════════════════

function MileageTab({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [tripFilter, setTripFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MileageLog | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const EMPTY = { vehicleId: "", date: today(), startLocation: "", endLocation: "", odometerStart: "", odometerEnd: "", purpose: "", tripType: "business", driverName: "", notes: "" };
  const [form, setForm] = useState(EMPTY);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles", businessId],
    queryFn: async () => {
      const r = await fetch(`/api/vehicles?businessId=${businessId}`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: logsData, isLoading } = useQuery<{ logs: MileageLog[]; totalBusinessMiles: number; totalDeductionValue: number }>({
    queryKey: ["mileage", businessId, year],
    queryFn: async () => {
      const r = await fetch(`/api/mileage?businessId=${businessId}&year=${year}`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const allLogs = logsData?.logs ?? [];

  const filtered = useMemo(() => {
    let logs = allLogs;
    if (vehicleFilter !== "all") logs = logs.filter((l) => String(l.vehicleId) === vehicleFilter);
    if (tripFilter !== "all") logs = logs.filter((l) => l.tripType === tripFilter);
    return logs;
  }, [allLogs, vehicleFilter, tripFilter]);

  const totalBizMiles = filtered.filter((l) => l.tripType === "business").reduce((s, l) => s + num(l.miles), 0);
  const totalDeduction = filtered.filter((l) => l.tripType === "business").reduce((s, l) => s + num(l.deductionValue), 0);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editing ? `/api/mileage/${editing.id}` : "/api/mileage";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: apiHeaders(), body: JSON.stringify({ ...data, businessId, vehicleId: data.vehicleId || null }) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mileage", businessId] });
      qc.invalidateQueries({ queryKey: ["vehicles", businessId] });
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY);
      toast({ title: editing ? "Log updated" : "Mileage logged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/mileage/${id}`, { method: "DELETE", headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mileage", businessId] });
      qc.invalidateQueries({ queryKey: ["vehicles", businessId] });
      setDeletingId(null);
      toast({ title: "Log deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() { setEditing(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(l: MileageLog) {
    setEditing(l);
    setForm({ vehicleId: l.vehicleId ? String(l.vehicleId) : "", date: l.date, startLocation: l.startLocation ?? "", endLocation: l.endLocation ?? "", odometerStart: l.odometerStart ?? "", odometerEnd: l.odometerEnd ?? "", purpose: l.purpose ?? "", tripType: l.tripType, driverName: l.driverName ?? "", notes: l.notes ?? "" });
    setModalOpen(true);
  }

  const miles = form.odometerStart && form.odometerEnd
    ? Math.max(0, Number(form.odometerEnd) - Number(form.odometerStart))
    : null;

  const sf = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Business Miles</p>
            <p className="text-xl font-bold">{totalBizMiles.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">IRS Deduction</p>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalDeduction)}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Total Trips</p>
            <p className="text-xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All vehicles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tripFilter} onValueChange={setTripFilter}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TRIP_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" />Log Mileage</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No mileage logs</p>
          <p className="text-sm mt-1">Log your first trip to start tracking mileage and IRS deductions.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Vehicle</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Route</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Driver</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Miles</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-emerald-700">Deduction</th>
                    <th className="py-2.5 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/30 group">
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{log.date}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-medium">{log.vehicleName ?? "—"}</span>
                        {log.vehicleLicensePlate && <span className="text-xs text-muted-foreground ml-1">({log.vehicleLicensePlate})</span>}
                      </td>
                      <td className="py-2.5 px-4 max-w-48">
                        {log.startLocation || log.endLocation ? (
                          <span className="text-muted-foreground truncate block">
                            {[log.startLocation, log.endLocation].filter(Boolean).join(" → ")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">{log.purpose ?? "—"}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{log.driverName ?? "—"}</td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge variant={log.tripType === "business" ? "default" : "secondary"} className="text-xs capitalize">
                          {log.tripType}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium">{num(log.miles).toFixed(1)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-700">
                        {log.tripType === "business" ? fmt(num(log.deductionValue)) : "—"}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(log)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {deletingId === log.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => deleteMutation.mutate(log.id)} className="px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
                                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Del"}
                              </button>
                              <button onClick={() => setDeletingId(null)} className="p-1 rounded hover:bg-muted"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setDeletingId(log.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={5} className="py-2.5 px-4 font-bold text-sm">Totals</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">
                      {filtered.reduce((s, l) => s + num(l.miles), 0).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">{fmt(totalDeduction)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Mileage Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setEditing(null); setForm(EMPTY); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Mileage Log" : "Log Mileage"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={sf("date")} required />
              </div>
              <div className="space-y-1">
                <Label>Vehicle</Label>
                <select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">No vehicle</option>
                  {vehicles.filter((v) => v.isActive).map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Start Location</Label>
                <Input placeholder="Chicago, IL" value={form.startLocation} onChange={sf("startLocation")} />
              </div>
              <div className="space-y-1">
                <Label>End Location</Label>
                <Input placeholder="Milwaukee, WI" value={form.endLocation} onChange={sf("endLocation")} />
              </div>
              <div className="space-y-1">
                <Label>Odometer Start</Label>
                <Input type="number" step="0.1" placeholder="125000" value={form.odometerStart} onChange={sf("odometerStart")} />
              </div>
              <div className="space-y-1">
                <Label>Odometer End</Label>
                <Input type="number" step="0.1" placeholder="125092" value={form.odometerEnd} onChange={sf("odometerEnd")} />
              </div>
              {miles !== null && (
                <div className="col-span-2 flex items-center gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Computed miles:</span>
                  <span className="font-semibold">{miles.toFixed(1)}</span>
                </div>
              )}
              <div className="space-y-1">
                <Label>Trip Type</Label>
                <select value={form.tripType} onChange={(e) => setForm((p) => ({ ...p, tripType: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize">
                  {TRIP_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Driver Name</Label>
                <Input placeholder="John Smith" value={form.driverName} onChange={sf("driverName")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Purpose</Label>
                <Input placeholder="Customer delivery — Acme Corp" value={form.purpose} onChange={sf("purpose")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Input placeholder="Optional notes" value={form.notes} onChange={sf("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {editing ? "Save Changes" : "Log Mileage"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FUEL LOGS TAB
// ══════════════════════════════════════════════════════════════

function FuelTab({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [iftaFilter, setIftaFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FuelLog | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const EMPTY = { vehicleId: "", date: today(), stationName: "", state: "", gallons: "", pricePerGallon: "", totalAmount: "", odometer: "", fuelType: "diesel", iftaReportable: "true", notes: "" };
  const [form, setForm] = useState(EMPTY);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["vehicles", businessId],
    queryFn: async () => {
      const r = await fetch(`/api/vehicles?businessId=${businessId}`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: logsData, isLoading } = useQuery<{ logs: FuelLog[]; totalGallons: number; totalAmount: number; avgPricePerGallon: number }>({
    queryKey: ["fuel", businessId, year],
    queryFn: async () => {
      const r = await fetch(`/api/fuel?businessId=${businessId}&year=${year}`, { headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const allLogs = logsData?.logs ?? [];

  const filtered = useMemo(() => {
    let logs = allLogs;
    if (vehicleFilter !== "all") logs = logs.filter((l) => String(l.vehicleId) === vehicleFilter);
    if (iftaFilter === "ifta") logs = logs.filter((l) => l.iftaReportable);
    if (iftaFilter === "non-ifta") logs = logs.filter((l) => !l.iftaReportable);
    return logs;
  }, [allLogs, vehicleFilter, iftaFilter]);

  const totalGallons = filtered.reduce((s, l) => s + num(l.gallons), 0);
  const totalAmount = filtered.reduce((s, l) => s + num(l.totalAmount), 0);
  const avgPpg = totalGallons > 0 ? totalAmount / totalGallons : 0;
  const iftaGallons = filtered.filter((l) => l.iftaReportable).reduce((s, l) => s + num(l.gallons), 0);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editing ? `/api/fuel/${editing.id}` : "/api/fuel";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: apiHeaders(), body: JSON.stringify({ ...data, businessId, vehicleId: data.vehicleId || null, iftaReportable: data.iftaReportable === "true" }) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fuel", businessId] });
      qc.invalidateQueries({ queryKey: ["vehicles", businessId] });
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY);
      toast({ title: editing ? "Fuel log updated" : "Fuel logged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/fuel/${id}`, { method: "DELETE", headers: apiHeaders() });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fuel", businessId] });
      qc.invalidateQueries({ queryKey: ["vehicles", businessId] });
      setDeletingId(null);
      toast({ title: "Fuel log deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() { setEditing(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(l: FuelLog) {
    setEditing(l);
    setForm({ vehicleId: l.vehicleId ? String(l.vehicleId) : "", date: l.date, stationName: l.stationName ?? "", state: l.state ?? "", gallons: l.gallons ?? "", pricePerGallon: l.pricePerGallon ?? "", totalAmount: l.totalAmount ?? "", odometer: l.odometer ?? "", fuelType: l.fuelType, iftaReportable: l.iftaReportable ? "true" : "false", notes: l.notes ?? "" });
    setModalOpen(true);
  }

  const computedTotal = form.gallons && form.pricePerGallon
    ? (Number(form.gallons) * Number(form.pricePerGallon)).toFixed(2)
    : null;

  const sf = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Total Gallons</p>
          <p className="text-xl font-bold">{totalGallons.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Fuel Cost</p>
          <p className="text-xl font-bold">{fmt(totalAmount)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Avg $/gal</p>
          <p className="text-xl font-bold">${avgPpg.toFixed(3)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">IFTA Gallons</p>
          <p className="text-xl font-bold">{iftaGallons.toFixed(1)}</p>
        </CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All vehicles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={iftaFilter} onValueChange={setIftaFilter}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="IFTA filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entries</SelectItem>
              <SelectItem value="ifta">IFTA reportable</SelectItem>
              <SelectItem value="non-ifta">Non-IFTA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" />Log Fuel</Button>
      </div>

      {/* IFTA hint */}
      {iftaGallons > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span><strong>IFTA:</strong> {iftaGallons.toFixed(1)} gallons are marked IFTA-reportable. Use the state filter or export to prepare your quarterly IFTA fuel tax report.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Fuel className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No fuel logs</p>
          <p className="text-sm mt-1">Log fuel purchases to track costs, MPG, and IFTA reporting.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Vehicle</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Station</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">State</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Gallons</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">$/gal</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Total</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">IFTA</th>
                    <th className="py-2.5 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/30 group">
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{log.date}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-medium">{log.vehicleName ?? "—"}</span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{log.stationName ?? "—"}</td>
                      <td className="py-2.5 px-4 text-center">
                        {log.state ? <Badge variant="outline" className="text-xs">{log.state}</Badge> : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{log.gallons ? num(log.gallons).toFixed(3) : "—"}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">{log.pricePerGallon ? `$${num(log.pricePerGallon).toFixed(4)}` : "—"}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">{log.totalAmount ? fmt(num(log.totalAmount)) : "—"}</td>
                      <td className="py-2.5 px-4 text-center">
                        {log.iftaReportable
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
                          : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(log)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {deletingId === log.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => deleteMutation.mutate(log.id)} className="px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
                                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Del"}
                              </button>
                              <button onClick={() => setDeletingId(null)} className="p-1 rounded hover:bg-muted"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setDeletingId(log.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={4} className="py-2.5 px-4 font-bold text-sm">Totals</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{totalGallons.toFixed(3)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">${avgPpg.toFixed(4)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{fmt(totalAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Fuel Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setEditing(null); setForm(EMPTY); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Fuel Log" : "Log Fuel"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={sf("date")} required />
              </div>
              <div className="space-y-1">
                <Label>Vehicle</Label>
                <select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">No vehicle</option>
                  {vehicles.filter((v) => v.isActive).map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Station Name</Label>
                <Input placeholder="Pilot Flying J" value={form.stationName} onChange={sf("stationName")} />
              </div>
              <div className="space-y-1">
                <Label>State</Label>
                <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Gallons</Label>
                <Input type="number" step="0.001" min="0" placeholder="125.500" value={form.gallons} onChange={sf("gallons")} />
              </div>
              <div className="space-y-1">
                <Label>Price per Gallon ($)</Label>
                <Input type="number" step="0.0001" min="0" placeholder="3.8990" value={form.pricePerGallon} onChange={sf("pricePerGallon")} />
              </div>
              {computedTotal && (
                <div className="col-span-2 flex items-center gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
                  <Fuel className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Computed total:</span>
                  <span className="font-semibold">${computedTotal}</span>
                </div>
              )}
              <div className="space-y-1">
                <Label>Total Amount ($)</Label>
                <Input type="number" step="0.01" min="0" placeholder="Auto-computed or override" value={form.totalAmount} onChange={sf("totalAmount")} />
              </div>
              <div className="space-y-1">
                <Label>Odometer Reading</Label>
                <Input type="number" step="0.1" placeholder="125,000" value={form.odometer} onChange={sf("odometer")} />
              </div>
              <div className="space-y-1">
                <Label>Fuel Type</Label>
                <select value={form.fuelType} onChange={(e) => setForm((p) => ({ ...p, fuelType: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize">
                  {FUEL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>IFTA Reportable</Label>
                <select value={form.iftaReportable} onChange={(e) => setForm((p) => ({ ...p, iftaReportable: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="true">Yes — IFTA reportable</option>
                  <option value="false">No — exclude from IFTA</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Input placeholder="Optional notes" value={form.notes} onChange={sf("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {editing ? "Save Changes" : "Log Fuel"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

type Tab = "vehicles" | "mileage" | "fuel";

export default function FleetPage({ businessId }: { businessId: number }) {
  const [tab, setTab] = useState<Tab>("vehicles");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Truck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet Management</h1>
          <p className="text-sm text-muted-foreground">Vehicles, mileage logs, fuel tracking &amp; IFTA reporting</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-0">
        <TabButton active={tab === "vehicles"} onClick={() => setTab("vehicles")}>
          <span className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5" />Vehicles</span>
        </TabButton>
        <TabButton active={tab === "mileage"} onClick={() => setTab("mileage")}>
          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Mileage Logs</span>
        </TabButton>
        <TabButton active={tab === "fuel"} onClick={() => setTab("fuel")}>
          <span className="flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5" />Fuel Logs</span>
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === "vehicles" && <VehiclesTab businessId={businessId} />}
      {tab === "mileage" && <MileageTab businessId={businessId} />}
      {tab === "fuel" && <FuelTab businessId={businessId} />}
    </div>
  );
}
