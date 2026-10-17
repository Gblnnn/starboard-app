import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { CircleMinus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Holiday {
  id: string;
  day: number;
  name: string;
}

export default function HolidayMaster() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [day, setDay] = useState("1");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    if (Number(day) > daysInMonth) setDay(String(daysInMonth));
  }, [day, daysInMonth]);

  useEffect(() => {
    let isCurrent = true;
    const fetchHolidays = async () => {
      const { data, error } = await supabase
        .from("attendance_holidays")
        .select("id, day, name")
        .eq("year", year)
        .eq("month", month)
        .order("day");
      if (error) {
        console.error("Error fetching holidays:", error);
        toast.error("Unable to load holidays.");
        return;
      }
      if (isCurrent) setHolidays(data ?? []);
    };

    void fetchHolidays();
    return () => {
      isCurrent = false;
    };
  }, [year, month]);

  const addHoliday = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a holiday name.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("attendance_holidays")
        .insert({ year, month, day: Number(day), name: name.trim() })
        .select("id, day, name")
        .single();
      if (error) throw error;
      setHolidays((current) =>
        [...current, data].sort((left, right) => left.day - right.day)
      );
      setName("");
      toast.success("Holiday declared successfully.");
    } catch (error) {
      console.error("Error adding holiday:", error);
      toast.error("Failed to declare holiday.");
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (holiday: Holiday) => {
    if (!confirm(`Are you sure you want to delete the holiday on day ${holiday.day}?`)) return;
    try {
      const { data, error } = await supabase
        .from("attendance_holidays")
        .delete()
        .eq("id", holiday.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Holiday was not found or cannot be deleted.");
      setHolidays((current) => current.filter((entry) => entry.id !== holiday.id));
      toast.success("Holiday deleted.");
    } catch (error) {
      console.error("Error deleting holiday:", error);
      toast.error("Failed to delete holiday.");
    }
  };

  return (
    <section className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Month
          <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, index) => (
                <SelectItem key={index} value={String(index)}>{new Date(2000, index, 1).toLocaleString("en", { month: "long" })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Year
          <Input className="mt-1" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </label>
      </div>

      <form onSubmit={(event) => void addHoliday(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[8rem_minmax(12rem,1fr)_auto] sm:items-end">
        <label className="text-sm font-medium text-slate-700">
          Day of month
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-56">
              {Array.from({ length: daysInMonth }, (_, index) => (
                <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Holiday name
          <Input className="mt-1" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <Button type="submit" disabled={saving}>{saving ? "Adding…" : <><Plus className="mr-2 h-4 w-4" />Add holiday</>}</Button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Declared holidays</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {holidays.length === 0 ? (
            <li className="py-4 text-sm text-slate-500">No public holidays declared for this month.</li>
          ) : holidays.map((holiday) => (
            <li key={holiday.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span><strong>Day {holiday.day}:</strong> {holiday.name}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete holiday on day ${holiday.day}`} onClick={() => void removeHoliday(holiday)}>
                <CircleMinus className="h-4 w-4 text-red-500" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
