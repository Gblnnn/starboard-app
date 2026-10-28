import { supabase } from '@/lib/supabase';
import type { HTMAttendance } from './types';

const PAGE_SIZE = 1000;

export async function fetchAttendanceRecords(
  projectCode: string,
  empIds: string[],
  startDate: string,
  endDate: string,
): Promise<HTMAttendance[]> {
  if (empIds.length === 0) return [];

  const records: HTMAttendance[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('hourly_tm_attendance')
      .select('*')
      .eq('project_code', projectCode)
      .in('emp_id', empIds)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as HTMAttendance[];
    records.push(...page);
    if (page.length < PAGE_SIZE) return records;
  }
}
