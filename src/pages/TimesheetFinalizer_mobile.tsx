import TimesheetFinalizer, { type TimesheetFinalizerProps } from './TimesheetFinalizer';

export default function TimesheetFinalizerMobile(props: TimesheetFinalizerProps = {}) {
  return <TimesheetFinalizer {...props} mobileLayout />;
}
