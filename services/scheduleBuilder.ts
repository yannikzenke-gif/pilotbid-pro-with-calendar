
import { Pairing, Preference, GeneratedSchedule, ScoredPairing } from '../types';
import { rankPairings } from './rankingService';
import { isBefore, isAfter, addMinutes, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';

const MAX_MONTHLY_BLOCK_HOURS = 88; // Legal limit buffer mentioned by pilot (~85-90)
const MIN_REST_HOURS = 10; // Minimum rest between flights

// Helper to check if two time ranges overlap
const isOverlapping = (start1: Date, end1: Date, start2: Date, end2: Date): boolean => {
    // Add buffer for rest
    const bufferedEnd1 = addMinutes(end1, MIN_REST_HOURS * 60);
    const bufferedEnd2 = addMinutes(end2, MIN_REST_HOURS * 60);
    return isBefore(start1, bufferedEnd2) && isAfter(bufferedEnd1, start2);
};

// Helper to check if a pairing conflicts with specific blocked dates
const conflictsWithBlockedDates = (pairing: Pairing, preferences: Preference[]): boolean => {
    const flightDays = eachDayOfInterval({ start: pairing.departureTime, end: pairing.arrivalTime });
    
    // Check Specific Dates
    const blockedDates = preferences
        .filter(p => p.type === 'SPECIFIC_DATE_OFF')
        .map(p => parseISO(p.value));

    for (const day of flightDays) {
        if (blockedDates.some(blocked => isSameDay(day, blocked))) {
            return true;
        }
    }
    return false;
};

const buildSchedule = (
    pairings: Pairing[], 
    preferences: Preference[], 
    strategyName: string, 
    strategyDescription: string, 
    customWeights?: any
): GeneratedSchedule => {
    // 1. Score all pairings based on the specific strategy
    // We create a temporary preference list for the strategy if needed, 
    // but primarily we use the existing scoring engine with tweaks or sort order.
    
    let strategyPrefs = [...preferences];
    
    // Inject strategy-specific preferences if not present
    if (customWeights?.focus === 'MONEY') {
        if (!strategyPrefs.some(p => p.type === 'STRATEGY_MONEY')) {
             strategyPrefs.push({ id: 'temp-money', type: 'STRATEGY_MONEY', value: 'true', label: 'Temp Money' });
        }
    }
    
    // Get scored list
    let candidates = rankPairings(pairings, strategyPrefs);

    // 2. Greedy Construction
    const selectedPairings: ScoredPairing[] = [];
    let currentBlockHours = 0;

    // Sort candidates:
    // For Money: Highest Score first (which already weights block hours)
    // For Lifestyle: Highest Score first (which weights weekends/short duration)
    // We rely on rankPairings to have done the heavy lifting on sorting.
    
    for (const candidate of candidates) {
        // Hard Constraints
        
        // A. Monthly Block Limit
        if (currentBlockHours + candidate.blockHoursDecimal > MAX_MONTHLY_BLOCK_HOURS) continue;

        // B. Blocked Dates (Absolute Hard constraint for the Calendar Builder)
        if (conflictsWithBlockedDates(candidate, preferences)) continue;

        // C. Overlap with already selected
        const hasOverlap = selectedPairings.some(selected => 
            isOverlapping(candidate.departureTime, candidate.arrivalTime, selected.departureTime, selected.arrivalTime)
        );
        if (hasOverlap) continue;

        // D. Negative Score check? 
        // If the score is deeply negative (e.g. avoided airport), we likely shouldn't pick it unless desperate.
        // Let's filter out anything with a "Violated" match description or very low score.
        if (candidate.score < -100) continue;

        // Add to schedule
        selectedPairings.push(candidate);
        currentBlockHours += candidate.blockHoursDecimal;
    }

    // Sort selected by date for display
    selectedPairings.sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime());

    // Calculate days off
    // Approximation: Days in month minus days touching a flight
    let uniqueWorkDays = new Set<string>();
    selectedPairings.forEach(p => {
        eachDayOfInterval({ start: p.departureTime, end: p.arrivalTime }).forEach(d => {
            uniqueWorkDays.add(d.toDateString());
        });
    });
    const totalDaysOff = 30 - uniqueWorkDays.size; // Approx

    return {
        id: strategyName.toLowerCase().replace(/\s/g, '-'),
        name: strategyName,
        description: strategyDescription,
        pairings: selectedPairings,
        stats: {
            totalBlockHours: parseFloat(currentBlockHours.toFixed(2)),
            totalDaysOff,
            flightCount: selectedPairings.length
        }
    };
};

export const generateSchedules = (pairings: Pairing[], preferences: Preference[]): GeneratedSchedule[] => {
    if (pairings.length === 0) return [];

    // Plan A: Maximize Earnings
    const moneySchedule = buildSchedule(
        pairings, 
        preferences, 
        "Plan A: Max Earnings", 
        "Prioritizes high block-hour trips to maximize pay, filling the schedule up to legal limits.",
        { focus: 'MONEY' }
    );

    // Plan B: Lifestyle / Balanced
    // For lifestyle, we might want to ensure 'MAX_DURATION' or 'DAY_OF_WEEK_OFF' are weighted heavily
    // The rankingService already handles this if the user added those prefs.
    // If they didn't, we can simulate a "Short Trips" preference.
    const lifestylePrefs = [...preferences];
    if (!lifestylePrefs.some(p => p.type === 'MAX_DURATION')) {
        lifestylePrefs.push({ id: 'temp-dur', type: 'MAX_DURATION', value: '3', label: 'Temp Short Trips' });
    }
    const lifestyleSchedule = buildSchedule(
        pairings,
        lifestylePrefs,
        "Plan B: Lifestyle & Comfort",
        "Prioritizes shorter trips and user preferences like specific routes or time windows.",
        { focus: 'LIFESTYLE' }
    );

    // Plan C: Max Days Off (Condensed)
    // To maximize days off, we want efficient pairings (high block hours per day of duty).
    // This is similar to money but maybe different packing. 
    // For now, let's offer a "Weekends Off" focused one if not already requested.
    const weekendPrefs: Preference[] = [
        ...preferences, 
        { id: 'temp-weekend', type: 'DAY_OF_WEEK_OFF', value: '0', label: 'Sunday' }, 
        { id: 'temp-sat', type: 'DAY_OF_WEEK_OFF', value: '6', label: 'Saturday' }
    ];
    const weekendSchedule = buildSchedule(
        pairings,
        weekendPrefs,
        "Plan C: Weekends Free",
        "Attempts to keep Saturdays and Sundays free where possible.",
        { focus: 'WEEKEND' }
    );

    return [moneySchedule, lifestyleSchedule, weekendSchedule];
};
