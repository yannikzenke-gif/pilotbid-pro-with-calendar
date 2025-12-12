import { Pairing, Preference, ScoredPairing } from '../types';
import { getHours, eachDayOfInterval, format, isSameDay, getDay } from 'date-fns';

const SCORE_WEIGHTS = {
  STRATEGY_MONEY: 2, // Multiplier for block hours
  ROUTE: 30,
  TIME_WINDOW: 20,
  MAX_DURATION: 15,
  MAX_LEGS: 15,
  AVOID_RED_EYE: -50, // Penalty for red eye
  AVOID_AIRPORT: -100, // Heavy penalty
  DAY_OF_WEEK_OFF: -40, // Penalty per overlapping day
  SPECIFIC_DATE_OFF: -500, // Massive penalty (Dealbreaker)
};

export const rankPairings = (pairings: Pairing[], preferences: Preference[]): ScoredPairing[] => {
  return pairings.map((pairing) => {
    let score = 0;
    const matches: string[] = [];

    // Pre-calculate flight days for date/weekday logic
    const flightDays = eachDayOfInterval({
      start: pairing.departureTime,
      end: pairing.arrivalTime
    });

    preferences.forEach((pref) => {
      let isMatch = false;

      switch (pref.type) {
        case 'STRATEGY_MONEY':
          // Add score based on block hours (High block hours = High score)
          const moneyPoints = Math.round(pairing.blockHoursDecimal * SCORE_WEIGHTS.STRATEGY_MONEY);
          score += moneyPoints;
          if (pairing.blockHoursDecimal > 15) {
             matches.push(`High Earnings ($$$)`);
          }
          break;

        case 'SPECIFIC_DATE_OFF':
          // Value format: "yyyy-MM-dd"
          const dateToAvoid = new Date(pref.value);
          // Check if any day of the pairing overlaps with the requested off day
          const hasConflict = flightDays.some(day => isSameDay(day, dateToAvoid));
          
          if (hasConflict) {
            score += SCORE_WEIGHTS.SPECIFIC_DATE_OFF;
            matches.push(`Conflicts with ${format(dateToAvoid, 'MMM dd')} (Violated)`);
          }
          break;

        case 'DAY_OF_WEEK_OFF':
          // Value: "0" (Sunday) to "6" (Saturday)
          const dayToAvoid = parseInt(pref.value, 10);
          const weekdayConflict = flightDays.some(day => getDay(day) === dayToAvoid);

          if (weekdayConflict) {
            score += SCORE_WEIGHTS.DAY_OF_WEEK_OFF;
            matches.push(`Works on a requested Day Off (Violated)`);
          } else {
            // Small bonus for successfully keeping the day off? 
            // Or just lack of penalty. Let's add a small bonus to bubble these up.
            score += 10; 
            matches.push(`Keeps preferred weekday free`);
          }
          break;

        case 'AVOID_RED_EYE':
          const arrHour = getHours(pairing.arrivalTime);
          // Definition from transcript: land around 5, 6, 7 am. Let's say 00:00 to 07:00.
          if (arrHour >= 0 && arrHour <= 7) {
            score += SCORE_WEIGHTS.AVOID_RED_EYE;
            matches.push(`Red Eye Arrival (${arrHour}:00)`);
          }
          break;

        case 'MAX_LEGS_PER_DAY':
          // Estimate legs based on layovers + 1 (destination). 
          // Details: PTY - MIA - PTY (2 legs). 
          // Note: This is an approximation per trip, not per day, but serves the pilot's request roughly.
          const totalLegs = pairing.layovers.length + 1;
          const legsPerDay = totalLegs / pairing.duration; // Average
          const maxLegs = parseInt(pref.value, 10);
          
          if (legsPerDay <= maxLegs) {
            score += SCORE_WEIGHTS.MAX_LEGS;
            matches.push(`Low workload (~${Math.ceil(legsPerDay)} legs/day)`);
          }
          break;

        case 'ROUTE':
          if (pairing.details.toUpperCase().includes(pref.value.toUpperCase())) {
            score += SCORE_WEIGHTS.ROUTE;
            matches.push(`Route includes ${pref.value}`);
          }
          break;

        case 'TIME_WINDOW':
          const [startStr, endStr] = pref.value.split('-');
          const startHour = parseInt(startStr, 10);
          const endHour = parseInt(endStr, 10);
          const depHour = getHours(pairing.departureTime);
          
          if (depHour >= startHour && depHour <= endHour) {
            score += SCORE_WEIGHTS.TIME_WINDOW;
            matches.push(`Departure between ${startHour}:00-${endHour}:00`);
          }
          break;

        case 'MAX_DURATION':
          const maxDays = parseInt(pref.value, 10);
          if (pairing.duration <= maxDays) {
            score += SCORE_WEIGHTS.MAX_DURATION;
            matches.push(`Duration under ${maxDays} days`);
          }
          break;

        case 'AVOID_AIRPORT':
          if (pairing.details.toUpperCase().includes(pref.value.toUpperCase())) {
            score += SCORE_WEIGHTS.AVOID_AIRPORT;
            matches.push(`Avoids ${pref.value} (Violated)`);
          }
          break;
      }
    });

    // Deduplicate matches
    const uniqueMatches = Array.from(new Set(matches));

    return {
      ...pairing,
      score,
      matches: uniqueMatches,
    };
  }).sort((a, b) => b.score - a.score);
};