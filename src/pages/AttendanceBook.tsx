import TimesheetViewer from '../components/TimesheetViewer';

interface AttendanceBookProps {
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
}

export default function AttendanceBook({ refreshTrigger, onLoadingChange }: AttendanceBookProps = {}) {
  return (
    <TimesheetViewer
      refreshTrigger={refreshTrigger}
      onLoadingChange={onLoadingChange}
      source="summary_view"      
    />
  );
}
