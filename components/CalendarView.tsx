
import React, { useState, useMemo } from 'react';
import { GeneratedSchedule, ScoredPairing } from '../types';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, getDay, isWithinInterval } from 'date-fns';
import { Calendar as CalendarIcon, Clock, Home, CheckCircle2, Info } from 'lucide-react';

interface CalendarViewProps {
    schedules: GeneratedSchedule[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ schedules }) => {
    const [selectedScheduleId, setSelectedScheduleId] = useState<string>(schedules[0]?.id || '');

    const currentSchedule = useMemo(() => 
        schedules.find(s => s.id === selectedScheduleId) || schedules[0], 
    [schedules, selectedScheduleId]);

    if (!currentSchedule) return <div>No schedules available</div>;

    // Determine month context from the first pairing of the schedule, or today
    const firstDate = currentSchedule.pairings[0]?.departureTime || new Date();
    const monthStart = startOfMonth(firstDate);
    const monthEnd = endOfMonth(firstDate);
    const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad start of month
    const startDayOfWeek = getDay(monthStart); // 0 = Sun
    const paddedDays = Array(startDayOfWeek).fill(null);

    const isFlightDay = (date: Date): ScoredPairing | undefined => {
        return currentSchedule.pairings.find(p => 
            isWithinInterval(date, { start: p.departureTime, end: p.arrivalTime })
        );
    };

    const getFlightStatus = (date: Date, pairing: ScoredPairing) => {
        const isStart = isSameDay(date, pairing.departureTime);
        const isEnd = isSameDay(date, pairing.arrivalTime);
        return { isStart, isEnd };
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Strategy Selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {schedules.map(schedule => (
                    <button
                        key={schedule.id}
                        onClick={() => setSelectedScheduleId(schedule.id)}
                        className={`flex flex-col p-4 rounded-xl border text-left transition-all ${
                            selectedScheduleId === schedule.id 
                                ? 'bg-aviation-600 border-aviation-600 text-white shadow-md ring-2 ring-aviation-200' 
                                : 'bg-white border-slate-200 text-slate-600 hover:border-aviation-300 hover:bg-slate-50'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-sm uppercase tracking-wide opacity-90">{schedule.name}</span>
                            {selectedScheduleId === schedule.id && <CheckCircle2 className="w-5 h-5 text-white" />}
                        </div>
                        <p className={`text-xs mb-4 line-clamp-2 ${selectedScheduleId === schedule.id ? 'text-aviation-100' : 'text-slate-500'}`}>
                            {schedule.description}
                        </p>
                        <div className="mt-auto flex items-center gap-4 text-sm font-semibold">
                            <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" /> {schedule.stats.totalBlockHours} BH
                            </div>
                            <div className="flex items-center gap-1">
                                <Home className="w-4 h-4" /> {schedule.stats.totalDaysOff} Off
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-aviation-600" />
                        {format(monthStart, 'MMMM yyyy')}
                    </h2>
                    <div className="text-sm text-slate-500">
                        {currentSchedule.pairings.length} Trips Scheduled
                    </div>
                </div>

                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {d}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 auto-rows-[1fr] bg-slate-100 gap-px border-b border-slate-200">
                    {paddedDays.map((_, i) => (
                        <div key={`pad-${i}`} className="bg-white min-h-[120px]" />
                    ))}
                    
                    {calendarDays.map(day => {
                        const pairing = isFlightDay(day);
                        const isToday = isSameDay(day, new Date());
                        
                        let isStart = false;
                        let isEnd = false;
                        let isMiddle = false;

                        if (pairing) {
                            const status = getFlightStatus(day, pairing);
                            isStart = status.isStart;
                            isEnd = status.isEnd;
                            isMiddle = !isStart && !isEnd;
                        }
                        
                        return (
                            <div key={day.toString()} className={`bg-white min-h-[120px] p-1 flex flex-col ${isToday ? 'bg-blue-50/30' : ''}`}>
                                <span className={`text-xs font-semibold mb-1 w-fit px-1.5 py-0.5 rounded ${isToday ? 'bg-aviation-100 text-aviation-700' : 'text-slate-400'}`}>
                                    {format(day, 'd')}
                                </span>
                                
                                {pairing ? (
                                    <div className={`
                                        flex-1 relative group cursor-pointer text-xs flex flex-col justify-between
                                        ${isStart ? 'ml-1 rounded-tl-md rounded-bl-md border-l border-y' : ''}
                                        ${isEnd ? 'mr-1 rounded-tr-md rounded-br-md border-r border-y' : ''}
                                        ${isMiddle ? 'border-y -mx-[1px] z-10' : ''}
                                        ${isStart && isEnd ? 'mx-1 rounded-md border' : ''}
                                        bg-aviation-50 border-aviation-200 hover:bg-aviation-100 transition-colors
                                        p-1.5
                                    `}>
                                        {/* Always show Pairing ID for identification */}
                                        <div className="font-bold text-aviation-900 text-[10px] leading-tight flex items-center justify-between">
                                            <span>{pairing.pairingNumber}</span>
                                            {isStart && <Info className="w-3 h-3 text-aviation-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                        </div>

                                        {/* Start Details */}
                                        {isStart && (
                                            <div className="mt-1">
                                                <div className="text-[10px] font-bold text-aviation-700">
                                                    {format(pairing.departureTime, 'HH:mm')}
                                                </div>
                                                <div className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
                                                    Dep {pairing.details.split('-')[0]}
                                                </div>
                                            </div>
                                        )}

                                        {/* Middle Details - Just keep visual continuity */}
                                        {isMiddle && (
                                             <div className="mt-auto mb-auto text-[9px] text-aviation-300 text-center opacity-50">
                                                 ●
                                             </div>
                                        )}

                                        {/* End Details */}
                                        {isEnd && (
                                            <div className="mt-auto text-right">
                                                 <div className="text-[10px] font-bold text-aviation-700">
                                                    {format(pairing.arrivalTime, 'HH:mm')}
                                                </div>
                                                <div className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
                                                    Arr Base
                                                </div>
                                            </div>
                                        )}

                                        {/* Hover Tooltip - Positioned relative to the cell */}
                                        <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-48 bg-slate-800 text-white p-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                            <div className="font-bold text-sm mb-1">Pairing {pairing.pairingNumber}</div>
                                            <div className="text-xs text-slate-300 mb-2">{pairing.details}</div>
                                            <div className="space-y-1 text-xs">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400">Dep:</span>
                                                    <span>{format(pairing.departureTime, 'MMM dd HH:mm')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400">Arr:</span>
                                                    <span>{format(pairing.arrivalTime, 'MMM dd HH:mm')}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                                                    <span className="text-slate-400">Block Hours:</span>
                                                    <span className="font-mono text-emerald-400">{pairing.blockHours}</span>
                                                </div>
                                                 <div className="flex justify-between">
                                                    <span className="text-slate-400">Aircraft:</span>
                                                    <span>{pairing.aircraftType}</span>
                                                </div>
                                            </div>
                                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-800"></div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1"></div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CalendarView;
