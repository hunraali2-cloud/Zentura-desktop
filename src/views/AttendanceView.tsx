import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, UserCheck, LogOut, Users } from 'lucide-react';
import { dbSync, User, Attendance } from '@zentura/database';

interface AttendanceViewProps {
  cashier?: User | null;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ cashier }) => {
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Attendance[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadLiveData = () => {
      setLogs(dbSync.getAttendanceLogs());
      setStaffUsers(dbSync.getUsers());
    };
    loadLiveData();
    dbSync.fetchAttendance().then(setLogs);
    dbSync.fetchUsers().then(setStaffUsers);
    const unsubscribe = dbSync.subscribe(loadLiveData);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (clockedIn) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [clockedIn]);

  const formatElapsed = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClockIn = () => {
    if (isSubmitting || clockedIn) return;
    setIsSubmitting(true);

    try {
      const staffId = cashier ? cashier.id : (staffUsers[0]?.id || 'u-2');
      setClockedIn(true);
      const now = new Date();
      setClockInTime(now.toLocaleTimeString());
      const newAtt = dbSync.clockInUser(staffId);
      setAttendanceId(newAtt.id);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  };

  const handleClockOut = () => {
    if (isSubmitting || !clockedIn) return;
    setIsSubmitting(true);

    try {
      if (attendanceId) {
        dbSync.clockOutUser(attendanceId);
      }
      setClockedIn(false);
      setElapsedSeconds(0);
      setClockInTime(null);
      setAttendanceId(null);
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
    }
  };

  return (
    <div className="flex-1 flex gap-6 p-6 h-[calc(100vh-64px)] animate-fade-in overflow-hidden">
      {/* Left Column: Clock-In / Clock-Out */}
      <div className="w-[500px] bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-xs flex flex-col justify-between text-center overflow-y-auto">
        <div className="flex flex-col items-center gap-2">
          <div className="p-4 bg-[#4F46E5]/10 rounded-2xl text-[#4F46E5]">
            <Clock className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-[#0F172A]">Staff Attendance</h2>
          <p className="text-xs text-[#64748B]">
            Record attendance for: <span className="font-bold text-[#4F46E5]">{cashier ? cashier.name : 'Cashier Counter'}</span>
          </p>
        </div>

        {/* Live Timer Card */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6 flex flex-col gap-2 my-4">
          <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Shift Duration</div>
          <div className="text-5xl font-extrabold text-[#4F46E5] tabular-nums tracking-tight">
            {formatElapsed(elapsedSeconds)}
          </div>
          {clockInTime && (
            <div className="text-xs text-[#10B981] font-semibold flex items-center justify-center gap-1 mt-1">
              <UserCheck className="w-4 h-4" /> Clocked In at {clockInTime}
            </div>
          )}
        </div>

        {/* Big Touch Clock-In / Clock-Out Action Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            onClick={handleClockIn}
            disabled={clockedIn}
            className="h-16 min-h-[48px] bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-extrabold text-lg rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-6 h-6" /> Clock In
          </button>
          <button
            onClick={handleClockOut}
            disabled={!clockedIn}
            className="h-16 min-h-[48px] bg-[#F43F5E] hover:bg-[#E11D48] disabled:opacity-50 text-white font-extrabold text-lg rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-6 h-6" /> Clock Out
          </button>
        </div>
      </div>

      {/* Right Column: Live Shift Attendance Logs */}
      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col overflow-hidden">
        <div className="flex justify-between items-center pb-4 border-b border-[#E2E8F0]">
          <div>
            <h3 className="text-base font-bold text-[#0F172A]">Attendance History</h3>
            <p className="text-xs text-[#64748B]">Staff clock-in and clock-out logs</p>
          </div>
          <span className="px-3 py-1 bg-[#4F46E5]/10 text-[#4F46E5] rounded-full text-xs font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {staffUsers.length} Staff Members
          </span>
        </div>

        <div className="flex-1 overflow-y-auto mt-4">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs gap-2">
              No attendance logs recorded yet. Click "Clock In" to start.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-bold border-b border-[#E2E8F0]">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Clock In</th>
                  <th className="py-3 px-4">Clock Out</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {logs.map((log) => {
                  const staffUser = staffUsers.find((u) => u.id === log.user_id);
                  return (
                    <tr key={log.id} className="hover:bg-[#F1F5F9] transition-colors">
                      <td className="py-3 px-4 font-bold text-[#0F172A]">
                        {staffUser ? staffUser.name : log.user_id}
                      </td>
                      <td className="py-3 px-4 text-[#10B981] font-mono">{new Date(log.clock_in).toLocaleString()}</td>
                      <td className="py-3 px-4 text-[#64748B] font-mono">
                        {log.clock_out ? new Date(log.clock_out).toLocaleString() : 'Active Shift'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-1 font-bold rounded-md text-[10px] uppercase ${log.clock_out ? 'bg-[#CBD5E1] text-[#0F172A]' : 'bg-[#10B981]/10 text-[#10B981]'}`}>
                          {log.clock_out ? 'Shift Ended' : 'Working'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
